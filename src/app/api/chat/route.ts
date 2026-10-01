import { NextRequest, NextResponse } from "next/server";

import {
  AI_LIMITS,
  AI_MODEL,
  DEEPSEEK_API_URL,
  buildSystemPrompt,
  checkAndConsumeRateLimit,
  clientRateKey,
  emptyRateBucket,
  extractFollowups,
  looksLikeSecretFishing,
  normalizeAppContext,
  normalizeClientMessages,
  sanitizeUserText,
  type AiDataCard,
  type AiStreamEvent,
  type RateBucket,
} from "@/lib/ai-chat";
import { AI_TOOLS, aiToolStatus, runAiTool, storeToolData, type AiToolData } from "@/lib/ai-tools";
import {
  UpstreamError,
  readUpstreamRound,
  upstreamErrorFor,
  type UpstreamMessage,
} from "@/lib/ai-upstream";
import { assistantDailyLimit, consumeAiUsage, refundAiUsage } from "@/lib/ai-usage";
import { assistantRequiresSignIn } from "@/lib/access";
import { getDb } from "@/lib/db";
import { proQuotasEnabled, resolveQuotaSubject } from "@/lib/quota";
import { searchTermDeps } from "@/lib/search-terms-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Soft in-isolate burst guard; the daily cap lives in D1 (ai_usage). */
const rateBuckets = new Map<string, RateBucket>();

/** Data cards per reply, so a tool-happy answer stays readable. */
const MAX_CARDS = 4;
/** Tool calls answered per round; extras get an error result. */
const MAX_CALLS_PER_ROUND = 4;
const REPLY_TIMEOUT_MS = 90_000;

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
  return forwarded.slice(0, 64);
}

function jsonError(
  status: number,
  error: string,
  extra: Record<string, unknown> = {},
): NextResponse {
  return NextResponse.json({ error, ...extra }, { status });
}

interface ReplyResult {
  message: string;
  followups: string[];
  cards: AiDataCard[];
}

/**
 * Run the model with Apple-data tools until it answers. Streams progress
 * through `emit`; throws UpstreamError when no answer could be produced.
 */
async function runReply(options: {
  apiKey: string;
  messages: UpstreamMessage[];
  toolData: AiToolData | null;
  defaults: { country: string; genre?: string | null };
  signal: AbortSignal;
  emit: (event: AiStreamEvent) => void;
}): Promise<ReplyResult> {
  const { apiKey, messages, toolData, defaults, signal, emit } = options;
  const cards: AiDataCard[] = [];
  // One extra round is kept for a retry when the model spends its whole
  // budget thinking and writes nothing.
  let retried = false;
  for (let round = 0; round <= AI_LIMITS.maxToolRounds + 1; round += 1) {
    // Tools stay declared on the answer round (the thread holds tool calls)
    // but the model may not call them, so it has to answer with what it has.
    const lastRound = round >= AI_LIMITS.maxToolRounds || retried;
    let upstream: Response;
    try {
      upstream = await fetch(DEEPSEEK_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream, application/json",
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages,
          stream: true,
          temperature: 0.5,
          max_tokens: retried ? AI_LIMITS.maxCompletionTokens * 2 : AI_LIMITS.maxCompletionTokens,
          ...(toolData ? { tools: AI_TOOLS, tool_choice: lastRound ? "none" : "auto" } : {}),
        }),
        signal,
      });
    } catch {
      throw new UpstreamError(502, "Could not reach the assistant model. Try again in a moment.");
    }
    if (!upstream.ok) throw upstreamErrorFor(upstream.status);

    let streamedText = false;
    const result = await readUpstreamRound(upstream, {
      onReasoning: () => {
        if (!streamedText) emit({ type: "status", text: "Thinking" });
      },
      onContent: (text) => {
        streamedText = true;
        emit({ type: "delta", text });
      },
    });

    if (result.toolCalls.length === 0 || !toolData || lastRound) {
      const content = sanitizeUserText(stripToolMarkup(result.content), AI_LIMITS.maxCompletionTokens * 4);
      const { body, followups } = extractFollowups(content);
      if (body) return { message: body, followups, cards };
      console.error(
        "[chat] empty answer:",
        JSON.stringify({ round, finish: result.finishReason, reasoning: result.reasoning.length }),
      );
      if (retried) throw new UpstreamError(502, "Empty assistant response.");
      retried = true;
      if (streamedText) emit({ type: "reset" });
      emit({ type: "status", text: "Writing the answer" });
      continue;
    }

    // Text before a tool call is a preamble ("Let me check…"); drop it so
    // the answer starts clean once the data is in.
    if (streamedText) emit({ type: "reset" });
    messages.push({
      role: "assistant",
      content: result.content || null,
      reasoning_content: result.reasoning,
      tool_calls: result.toolCalls,
    });
    for (const [index, call] of result.toolCalls.entries()) {
      if (index >= MAX_CALLS_PER_ROUND) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ error: "Too many tool calls at once; batch terms into one call." }),
        });
        continue;
      }
      emit({ type: "status", text: aiToolStatus(call.function.name, call.function.arguments) });
      const outcome = await runAiTool(toolData, call.function.name, call.function.arguments, defaults);
      messages.push({ role: "tool", tool_call_id: call.id, content: outcome.content });
      if (outcome.card && outcome.card.rows.length > 0 && cards.length < MAX_CARDS) {
        cards.push(outcome.card);
        emit({ type: "card", card: outcome.card });
      }
    }
    emit({ type: "status", text: "Writing the answer" });
  }
  throw new UpstreamError(502, "The assistant did not finish its answer. Try again.");
}

/**
 * Some providers leak their raw tool-call syntax into the text when a call
 * cannot be made; never show that to the user.
 */
function stripToolMarkup(text: string): string {
  if (!/DSML/u.test(text)) return text;
  return text
    .replace(/<[｜|]+DSML[｜|]+[^]*?(?:<\/[｜|]+DSML[｜|]+\s*(?:function_)?calls>|$)/gu, "")
    .trim();
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    return jsonError(
      503,
      "Assistant is not configured yet. Set DEEPSEEK_API_KEY on the server.",
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }

  const payload = body as {
    messages?: unknown;
    context?: unknown;
    message?: unknown;
    stream?: unknown;
  };

  const history = normalizeClientMessages(payload.messages);
  const latest = sanitizeUserText(payload.message);
  if (!latest) {
    return jsonError(400, "Message is required.");
  }
  if (latest.length < 2) {
    return jsonError(400, "Message is too short.");
  }
  const wantsStream = payload.stream === true;

  // Soft refusal for obvious secret fishing (still charges rate limit).
  const fishing = looksLikeSecretFishing(latest);

  const ip = getClientIp(request);
  const ua = request.headers.get("user-agent") ?? "";
  const db = getDb();
  const subject = await resolveQuotaSubject(request, db);
  if (assistantRequiresSignIn(Boolean(db), subject.isSignedIn)) {
    return jsonError(401, "Sign in to use the ASO assistant.", { authRequired: true });
  }
  // Signed-in users are keyed by account (quota follows them); anonymous
  // visitors fall back to the IP+UA hash key when accounts are not live.
  const key = subject.isSignedIn ? subject.key : clientRateKey(ip, ua);
  const quotasOn = proQuotasEnabled();
  const maxPerDay = assistantDailyLimit(subject.plan);
  const existing = rateBuckets.get(key) ?? emptyRateBucket();
  const rate = checkAndConsumeRateLimit(existing, Date.now(), {
    maxPerHour: quotasOn ? maxPerDay : AI_LIMITS.maxMessagesPerHour,
    maxPerDay,
  });
  rateBuckets.set(key, rate.bucket);

  // Prevent unbounded map growth in long-lived isolates.
  if (rateBuckets.size > 5_000) {
    const first = rateBuckets.keys().next().value;
    if (first) rateBuckets.delete(first);
  }

  if (!rate.ok) {
    return jsonError(429, rate.reason, {
      retryAfterSec: rate.retryAfterSec,
    });
  }

  // The durable daily cap: one row per account per UTC day.
  let remainingDay = rate.remainingDay;
  let charged = false;
  if (db && subject.isSignedIn && Number.isFinite(maxPerDay)) {
    try {
      const used = await consumeAiUsage(db, subject.key, maxPerDay);
      if (used === null) {
        return jsonError(429, "Daily assistant limit reached. Limits reset every 24 hours.", {
          remainingDay: 0,
        });
      }
      charged = true;
      remainingDay = Math.max(0, maxPerDay - used);
    } catch (error) {
      // Table missing or D1 hiccup: the in-memory bucket still applies.
      console.error(
        "[chat] usage counter failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  const remainingHour = rate.remainingHour;
  const refund = async () => {
    if (!charged || !db) return;
    charged = false;
    await refundAiUsage(db, subject.key).catch(() => undefined);
  };

  if (fishing) {
    return NextResponse.json({
      message:
        "I can’t help with API keys, secrets, or internal credentials. I can help with App Store keywords, popularity/difficulty, and positioning for your app.",
      followups: [],
      remainingHour,
      remainingDay,
    });
  }

  const context = normalizeAppContext(payload.context);
  const storeDeps = searchTermDeps();
  const toolData = storeDeps ? storeToolData(storeDeps) : null;
  // The client sends the thread including the new message; drop that copy
  // (only that one — an earlier identical question is real history).
  const prior = [...history];
  const last = prior[prior.length - 1];
  if (last && last.role === "user" && last.content === latest) prior.pop();
  const messages: UpstreamMessage[] = [
    { role: "system", content: buildSystemPrompt(context, { tools: Boolean(toolData) }) },
    ...prior.slice(-(AI_LIMITS.maxHistoryMessages - 1)),
    { role: "user", content: latest },
  ];
  const defaults = { country: context?.country?.toUpperCase() || "US", genre: context?.genre ?? null };

  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), REPLY_TIMEOUT_MS);
  const onClientGone = () => abort.abort();
  request.signal?.addEventListener("abort", onClientGone);
  const cleanup = () => {
    clearTimeout(timeout);
    request.signal?.removeEventListener("abort", onClientGone);
  };

  if (!wantsStream) {
    try {
      const reply = await runReply({
        apiKey,
        messages,
        toolData,
        defaults,
        signal: abort.signal,
        emit: () => undefined,
      });
      return NextResponse.json({
        message: reply.message,
        followups: reply.followups,
        cards: reply.cards,
        model: AI_MODEL,
        remainingHour,
        remainingDay,
      });
    } catch (error) {
      await refund();
      const failure =
        error instanceof UpstreamError
          ? error
          : new UpstreamError(502, "Could not reach the assistant model. Try again in a moment.");
      return jsonError(
        failure.status,
        failure.message,
        failure.retryAfterSec ? { retryAfterSec: failure.retryAfterSec } : {},
      );
    } finally {
      cleanup();
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: AiStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The client went away; the abort signal stops the work.
        }
      };
      emit({ type: "meta", model: AI_MODEL, remainingDay, remainingHour });
      try {
        const reply = await runReply({
          apiKey,
          messages,
          toolData,
          defaults,
          signal: abort.signal,
          emit,
        });
        emit({ type: "done", message: reply.message, followups: reply.followups });
      } catch (error) {
        await refund();
        emit({
          type: "error",
          error:
            error instanceof UpstreamError
              ? error.message
              : abort.signal.aborted
                ? "The answer took too long. Try a shorter question."
                : "Could not reach the assistant model. Try again in a moment.",
        });
      } finally {
        cleanup();
        try {
          controller.close();
        } catch {
          // Already closed by a cancelled reader.
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
