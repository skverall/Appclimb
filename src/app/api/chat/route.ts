import { NextRequest, NextResponse } from "next/server";

import {
  AI_LIMITS,
  AI_MODEL,
  DEEPSEEK_API_URL,
  buildSystemPrompt,
  checkAndConsumeRateLimit,
  clientRateKey,
  emptyRateBucket,
  looksLikeSecretFishing,
  normalizeAppContext,
  normalizeClientMessages,
  sanitizeUserText,
  type RateBucket,
} from "@/lib/ai-chat";
import { getDb } from "@/lib/db";
import { aiDailyLimit, proQuotasEnabled, resolveQuotaSubject } from "@/lib/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Soft in-isolate rate store (best-effort on Workers; pairs with client caps). */
const rateBuckets = new Map<string, RateBucket>();

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
  };

  const history = normalizeClientMessages(payload.messages);
  const latest = sanitizeUserText(payload.message);
  if (!latest) {
    return jsonError(400, "Message is required.");
  }
  if (latest.length < 2) {
    return jsonError(400, "Message is too short.");
  }

  // Soft refusal for obvious secret fishing (still charges rate limit).
  const fishing = looksLikeSecretFishing(latest);

  const ip = getClientIp(request);
  const ua = request.headers.get("user-agent") ?? "";
  const subject = await resolveQuotaSubject(request, getDb());
  // Signed-in users are keyed by account (quota follows them); anonymous
  // visitors fall back to the IP+UA hash key.
  const key = subject.isSignedIn ? subject.key : clientRateKey(ip, ua);
  const quotasOn = proQuotasEnabled();
  const maxPerDay = quotasOn ? aiDailyLimit(subject.plan) : AI_LIMITS.maxMessagesPerDay;
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

  if (fishing) {
    return NextResponse.json({
      message:
        "I can’t help with API keys, secrets, or internal credentials. I can help with App Store keywords, popularity/difficulty, and positioning for your app.",
      remainingHour: rate.remainingHour,
      remainingDay: rate.remainingDay,
    });
  }

  const remainingHour = rate.remainingHour;
  const remainingDay = rate.remainingDay;

  const context = normalizeAppContext(payload.context);
  const messages = [
    { role: "system" as const, content: buildSystemPrompt(context) },
    ...history
      .filter((m) => m.content !== latest)
      .slice(-AI_LIMITS.maxHistoryMessages + 1),
    { role: "user" as const, content: latest },
  ];

  let upstream: Response;
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 55_000);
  try {
    upstream = await fetch(DEEPSEEK_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
        stream: false,
        temperature: 0.55,
        max_tokens: AI_LIMITS.maxCompletionTokens,
      }),
      signal: abort.signal,
    });
  } catch {
    return jsonError(
      502,
      "Could not reach the assistant model. Try again in a moment.",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!upstream.ok) {
    const status = upstream.status;
    if (status === 429) {
      return jsonError(
        429,
        "The model provider is rate-limiting right now. Please wait and retry.",
        { retryAfterSec: 30 },
      );
    }
    if (status === 401 || status === 403) {
      return jsonError(503, "Assistant authentication failed on the server.");
    }
    return jsonError(502, `Assistant upstream error (${status}).`);
  }

  let data: {
    choices?: Array<{ message?: { content?: string } }>;
  };
  try {
    data = (await upstream.json()) as typeof data;
  } catch {
    return jsonError(502, "Invalid response from the assistant model.");
  }

  const content = sanitizeUserText(
    data.choices?.[0]?.message?.content ?? "",
    AI_LIMITS.maxCompletionTokens * 4,
  );
  if (!content) {
    return jsonError(502, "Empty assistant response.");
  }

  return NextResponse.json({
    message: content,
    model: AI_MODEL,
    remainingHour,
    remainingDay,
  });
}
