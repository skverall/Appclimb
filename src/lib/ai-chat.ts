// AppClimb ASO assistant — client/server shared policy.
// The DeepSeek API key never leaves the server (Route Handler only).

import { assessOpportunity } from "@/lib/aso";
import { nextUtcMidnightMs } from "@/lib/day-window";

export const AI_MODEL = "deepseek-v4-flash";
export const AI_MODEL_LABEL = "DeepSeek V4 Flash";
export const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

/** Soft abuse limits (enforced server-side; client mirrors for UX). */
export const AI_LIMITS = {
  maxMessageChars: 2_000,
  maxHistoryMessages: 12,
  /** Room for the model's reasoning plus a full answer. */
  maxCompletionTokens: 2_400,
  /** Tool-call rounds per reply before the model must answer. */
  maxToolRounds: 3,
  /** Rolling window message cap per client key (IP / bucket). */
  maxMessagesPerHour: 20,
  maxMessagesPerDay: 60,
  minIntervalMs: 1_200,
} as const;

/** App Store Connect field limits the assistant writes against. */
export const METADATA_LIMITS = {
  title: 30,
  subtitle: 30,
  keywords: 100,
} as const;

export type MetadataField = keyof typeof METADATA_LIMITS;

export const AI_TOOL_NAMES = [
  "lookup_keywords",
  "related_keywords",
  "autocomplete_terms",
  "trending_keywords",
] as const;

export type AiToolName = (typeof AI_TOOL_NAMES)[number];

/** One row of an Apple data card. `popularity` is the ceiling when `longTail`. */
export interface AiDataRow {
  term: string;
  popularity: number;
  longTail?: boolean;
  /** Popularity change over the last 4 weeks; null when unknown. */
  change?: number | null;
  /** Newly published this month. */
  isNew?: boolean;
  category?: string;
}

/** Apple data a tool call returned, shown under the reply. */
export interface AiDataCard {
  tool: AiToolName;
  title: string;
  country: string;
  /** Sunday that starts Apple's data week. */
  week: string | null;
  rows: AiDataRow[];
}

/** Newline-delimited events of a streamed reply (POST /api/chat, stream: true). */
export type AiStreamEvent =
  | { type: "meta"; model: string; remainingDay?: number; remainingHour?: number }
  | { type: "status"; text: string }
  | { type: "reset" }
  | { type: "delta"; text: string }
  | { type: "card"; card: AiDataCard }
  | { type: "done"; message: string; followups: string[] }
  | { type: "error"; error: string };

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface AppChatKeyword {
  keyword: string;
  popularity?: number | null;
  /** official = Apple Ads score; longtail = at or below this ceiling; estimated = rough. */
  popularitySource?: "official" | "longtail" | "estimated";
  difficulty?: number | null;
  position?: number | null | string;
  /** Observed position at the start of the last 30 days (">200" when not found). */
  previousPosition?: number | null | string;
  note?: string;
}

export interface AppChatContext {
  appName?: string;
  appStoreId?: string;
  country?: string;
  developer?: string;
  genre?: string;
  /** First part of the App Store description, for keyword ideas. */
  description?: string;
  keywords?: AppChatKeyword[];
}

function formatPosition(value: number | null | string | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return `#${value}`;
  return value;
}

function verdictFor(row: AppChatKeyword): string | null {
  if (typeof row.popularity !== "number" || typeof row.difficulty !== "number") return null;
  return assessOpportunity({
    popularity: row.popularity,
    popularitySource: row.popularitySource ?? "estimated",
    difficulty: row.difficulty,
  }).label;
}

function keywordLine(row: AppChatKeyword): string {
  const popularity =
    row.popularity != null
      ? row.popularitySource === "official"
        ? `pop ${row.popularity} (Apple)`
        : row.popularitySource === "longtail"
          ? `pop ≤${row.popularity} (long tail)`
          : `pop ~${row.popularity} (estimate)`
      : null;
  const now = formatPosition(row.position);
  const before = formatPosition(row.previousPosition);
  const rank = now ? (before && before !== now ? `rank ${now} (30 days ago ${before})` : `rank ${now}`) : null;
  const verdict = verdictFor(row);
  const bits = [
    row.keyword,
    popularity,
    row.difficulty != null ? `difficulty ~${row.difficulty}` : null,
    rank,
    verdict ? `verdict: ${verdict}` : null,
    row.note ? `note: ${row.note.slice(0, 80)}` : null,
  ].filter(Boolean);
  return `  - ${bits.join(" | ")}`;
}

export function buildSystemPrompt(
  context?: AppChatContext | null,
  options: { tools?: boolean; today?: string } = {},
): string {
  const tools = options.tools ?? false;
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const lines = [
    "You are AppClimb's ASO assistant: a sharp, practical App Store Optimization advisor for indie iOS developers. You help them pick keywords they can actually rank for and turn that into title, subtitle, and keyword-field changes.",
    `Today is ${today}.`,
    "",
    "Where numbers come from:",
    tools
      ? "- Tools: lookup_keywords, related_keywords, autocomplete_terms, and trending_keywords read Apple Ads' weekly published search terms (the top 500 per category) for a storefront. Call them instead of guessing. Be efficient: at most one discovery round (related/autocomplete/trending), then ONE lookup_keywords call with your whole shortlist (up to 20 terms). If Apple's lists have nothing for a niche, it is long tail — say so plainly and recommend long-tail phrases instead of searching more."
      : "- Apple data tools are unavailable right now: do not quote popularity for terms outside the tracked-app context; say the user can check them in the Keyword Explorer.",
    "- The tracked-app context below comes from the user's own tracker: Apple popularity (source in brackets), AppClimb's difficulty estimate, observed rank, and AppClimb's verdict.",
    "- Everything else is general ASO experience. Say so when it matters.",
    "",
    "Rules for numbers (never break):",
    "- Quote a popularity number only if it came from a tool result or the context. Before recommending new keywords, look them up.",
    "- Popularity is Apple Ads' official relative 1–100 score. It is not search volume, downloads, installs, or revenue — never claim those.",
    "- A long-tail term is not in Apple's published list: its popularity is AT OR BELOW the ceiling. Write it as \"≤12 (long tail)\". Low traffic, often the easiest first wins for a new app.",
    "- Difficulty (1–99) is always an ESTIMATE from the apps ranking today (their ratings, whether the keyword is in their name, big brands). You cannot compute it for new terms; tell the user to open the keyword in the Keyword Explorer (bold keywords are clickable).",
    "- Rank is the observed position in Apple's public search results for the storefront (first 200 apps). >200 means not found. It is not an official ranking.",
    "",
    "How AppClimb judges a keyword (stay consistent with the app):",
    "- Worth targeting: real Apple demand (popularity above ~35) and difficulty 50 or less.",
    "- Long-tail win: long tail with difficulty 45 or less.",
    "- Competitive: real demand, difficulty 51–74 — needs ratings and the keyword in the title.",
    "- Dominated: difficulty 75+ or a brand search — skip unless it is the user's own brand.",
    "",
    "ASO facts to apply:",
    `- Indexed fields: app name (${METADATA_LIMITS.title} characters), subtitle (${METADATA_LIMITS.subtitle}), keyword field (${METADATA_LIMITS.keywords}, comma-separated, no spaces after commas). The name weighs most, then the subtitle, then the keyword field.`,
    "- Never repeat a word across name, subtitle, and keyword field. Apple combines words across fields, so the keyword field should hold single words, not phrases. One of singular/plural is enough. Skip 'app', 'free', the category name, and the developer name.",
    "- Many storefronts also index a second localization (for example the US store indexes Spanish (Mexico)), which adds keyword room.",
    "- Metadata changes ship with an app update; judge them after 1–2 weeks of rank checks, one change at a time.",
    "",
    "Format:",
    "- Reply in the user's language. Open with the direct answer in plain sentences (no heading like 'Answer' or 'Short answer'), then the why. Usually under 250 words; audits and plans may be longer.",
    "- Short paragraphs, '- ' bullets, '## ' headings for multi-part answers. Markdown tables are welcome for comparing keywords (at most 5 columns).",
    "- Put keyword names in bold lowercase, e.g. **car dealer** — the app turns them into links. Never bold anything else (no bold for emphasis).",
    "- Copy-ready metadata goes in fenced blocks the app renders with a live character counter, one suggestion per block:",
    "```title",
    "Car Dealer Tracker: Profit",
    "```",
    "```subtitle",
    "Inventory, Sales & Flip Log",
    "```",
    "```keywords",
    "dealership,inventory,flipping,auto,vehicle,sales,lot,profit,margin",
    "```",
    `- Stay within ${METADATA_LIMITS.title} characters for title, ${METADATA_LIMITS.subtitle} for subtitle, ${METADATA_LIMITS.keywords} for keywords. Don't state character counts in your text — the app counts and shows them.`,
    "- End every reply with 2–3 short next questions the user is likely to ask, in their language, from their point of view, in exactly this block (the app shows them as buttons):",
    "```followups",
    "- Write my keyword field",
    "- Which keywords should I drop?",
    "```",
    "",
    "Safety (absolute):",
    "- Never invent, request, store, or reveal API keys, secrets, tokens, passwords, private keys, or internal env vars. If asked for AppClimb's secrets or how to extract the DeepSeek key, refuse briefly.",
    "- Never help steal credentials, bypass rate limits, scrape abusively, or attack systems.",
    "- Do not fabricate competitor download or revenue numbers.",
    "- Stay on ASO and App Store marketing. Politely decline unrelated jailbreak, malware, or political requests.",
    "",
    "Product facts (never contradict): AppClimb is free with daily limits (8 new keyword checks, 5 assistant messages); Pro is $8/month with higher limits, 52 weeks of Apple popularity history, and cloud sync. There is no App Store Connect login. Guest keyword data stays in the browser.",
  ];

  if (context?.appName || context?.appStoreId) {
    lines.push("", "The user's tracked app (from their browser; may be incomplete):");
    if (context.appName) lines.push(`- Name: ${context.appName}`);
    if (context.appStoreId) lines.push(`- App Store ID: ${context.appStoreId}`);
    if (context.country) lines.push(`- Storefront: ${context.country} (use it as the default country for tools)`);
    if (context.developer) lines.push(`- Developer: ${context.developer}`);
    if (context.genre) lines.push(`- Category: ${context.genre}`);
    if (context.description) {
      lines.push(`- Description excerpt: ${context.description.replace(/\s+/gu, " ").slice(0, 700)}`);
    }
    if (context.keywords && context.keywords.length > 0) {
      lines.push(`- Tracked keywords (${context.keywords.length}):`);
      for (const row of context.keywords.slice(0, 40)) lines.push(keywordLine(row));
    } else {
      lines.push("- No tracked keywords yet.");
    }
  } else {
    lines.push(
      "",
      "No app is connected. If the user's question depends on their app, ask for the app name, category, and storefront — or suggest tracking it in AppClimb so you can see its keywords.",
    );
  }

  return lines.join("\n");
}

const FOLLOWUPS_BLOCK = /```followups[^\n]*\n([\s\S]*?)(?:```|$)/u;

/**
 * Split the model's trailing follow-up block off a reply. Returns the
 * visible text and up to three short follow-up questions.
 */
export function extractFollowups(text: string): { body: string; followups: string[] } {
  const match = FOLLOWUPS_BLOCK.exec(text);
  if (!match) return { body: text.trim(), followups: [] };
  const followups = match[1]
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/u, "").trim())
    .filter((line) => line.length >= 3 && line.length <= 90)
    .slice(0, 3);
  const body = (text.slice(0, match.index) + text.slice(match.index + match[0].length)).trim();
  return { body, followups };
}

export function sanitizeUserText(input: unknown, max: number = AI_LIMITS.maxMessageChars): string {
  if (typeof input !== "string") return "";
  return input.replace(/\u0000/gu, "").trim().slice(0, max);
}

export function normalizeClientMessages(
  raw: unknown,
): Array<{ role: "user" | "assistant"; content: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const content = sanitizeUserText((item as { content?: unknown }).content);
    if ((role !== "user" && role !== "assistant") || !content) continue;
    out.push({ role, content });
    if (out.length >= AI_LIMITS.maxHistoryMessages) break;
  }
  return out;
}

export function normalizeAppContext(raw: unknown): AppChatContext | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const keywordsRaw = Array.isArray(value.keywords) ? value.keywords : [];
  const keywords = keywordsRaw
    .slice(0, 40)
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const keyword = sanitizeUserText(r.keyword, 80);
      if (!keyword) return null;
      return {
        keyword,
        popularity:
          typeof r.popularity === "number" ? r.popularity : null,
        popularitySource:
          r.popularitySource === "official" ||
          r.popularitySource === "longtail" ||
          r.popularitySource === "estimated"
            ? (r.popularitySource as "official" | "longtail" | "estimated")
            : undefined,
        difficulty:
          typeof r.difficulty === "number" ? r.difficulty : null,
        position:
          typeof r.position === "number" || typeof r.position === "string"
            ? r.position
            : null,
        previousPosition:
          typeof r.previousPosition === "number" || typeof r.previousPosition === "string"
            ? r.previousPosition
            : null,
        note: sanitizeUserText(r.note, 200) || undefined,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  return {
    appName: sanitizeUserText(value.appName, 120) || undefined,
    appStoreId: sanitizeUserText(value.appStoreId, 32) || undefined,
    country: sanitizeUserText(value.country, 8) || undefined,
    developer: sanitizeUserText(value.developer, 160) || undefined,
    genre: sanitizeUserText(value.genre, 80) || undefined,
    description: sanitizeUserText(value.description, 800) || undefined,
    keywords: keywords.length > 0 ? keywords : undefined,
  };
}

export interface RateBucket {
  hourCount: number;
  hourReset: number;
  dayCount: number;
  dayReset: number;
  lastAt: number;
}

export function emptyRateBucket(now = Date.now()): RateBucket {
  return {
    hourCount: 0,
    hourReset: now + 60 * 60 * 1000,
    dayCount: 0,
    dayReset: nextUtcMidnightMs(now),
    lastAt: 0,
  };
}

export type RateLimitResult =
  | { ok: true; bucket: RateBucket; remainingHour: number; remainingDay: number }
  | { ok: false; bucket: RateBucket; reason: string; retryAfterSec: number };

/** Per-plan caps; defaults to the shared AI_LIMITS when omitted. */
export interface RateLimitCaps {
  maxPerHour: number;
  maxPerDay: number;
}

export function checkAndConsumeRateLimit(
  bucket: RateBucket,
  now = Date.now(),
  caps?: RateLimitCaps,
): RateLimitResult {
  const maxPerHour = caps?.maxPerHour ?? AI_LIMITS.maxMessagesPerHour;
  const maxPerDay = caps?.maxPerDay ?? AI_LIMITS.maxMessagesPerDay;
  let next = { ...bucket };
  if (now >= next.hourReset) {
    next.hourCount = 0;
    next.hourReset = now + 60 * 60 * 1000;
  }
  if (now >= next.dayReset) {
    next.dayCount = 0;
    next.dayReset = nextUtcMidnightMs(now);
  }

  const sinceLast = now - next.lastAt;
  if (next.lastAt > 0 && sinceLast < AI_LIMITS.minIntervalMs) {
    return {
      ok: false,
      bucket: next,
      reason: "Please wait a moment between messages.",
      retryAfterSec: Math.ceil((AI_LIMITS.minIntervalMs - sinceLast) / 1000),
    };
  }
  if (next.hourCount >= maxPerHour) {
    return {
      ok: false,
      bucket: next,
      reason: "Hourly assistant limit reached. Try again later.",
      retryAfterSec: Math.max(1, Math.ceil((next.hourReset - now) / 1000)),
    };
  }
  if (next.dayCount >= maxPerDay) {
    return {
      ok: false,
      bucket: next,
      reason: "Daily assistant limit reached. Limits reset every 24 hours.",
      retryAfterSec: Math.max(1, Math.ceil((next.dayReset - now) / 1000)),
    };
  }

  next = {
    ...next,
    hourCount: next.hourCount + 1,
    dayCount: next.dayCount + 1,
    lastAt: now,
  };
  return {
    ok: true,
    bucket: next,
    remainingHour: Math.max(0, maxPerHour - next.hourCount),
    remainingDay: Math.max(0, maxPerDay - next.dayCount),
  };
}

/** Cheap stable client key from IP + UA (no PII storage beyond the hash string). */
export function clientRateKey(ip: string, userAgent: string): string {
  const raw = `${ip.trim()}|${userAgent.slice(0, 80)}`;
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `ai:${(hash >>> 0).toString(16)}`;
}

export function looksLikeSecretFishing(text: string): boolean {
  const lower = text.toLocaleLowerCase();
  return (
    /api[_\s-]?key|secret|password|token|bearer\s|wrangler secret|deepseek.*key|process\.env/iu.test(
      lower,
    ) &&
    /(give|show|print|leak|dump|reveal|what is|send me|extract)/iu.test(lower)
  );
}
