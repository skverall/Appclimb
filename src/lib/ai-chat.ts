// AppClimb ASO assistant — client/server shared policy.
// The DeepSeek API key never leaves the server (Route Handler only).

import { nextUtcMidnightMs } from "@/lib/day-window";

export const AI_MODEL = "deepseek-v4-flash";
export const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

/** Soft abuse limits (enforced server-side; client mirrors for UX). */
export const AI_LIMITS = {
  maxMessageChars: 2_000,
  maxHistoryMessages: 12,
  maxCompletionTokens: 1_200,
  /** Rolling window message cap per client key (IP / bucket). */
  maxMessagesPerHour: 20,
  maxMessagesPerDay: 60,
  minIntervalMs: 1_200,
} as const;

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface AppChatContext {
  appName?: string;
  appStoreId?: string;
  country?: string;
  developer?: string;
  genre?: string;
  keywords?: Array<{
    keyword: string;
    popularity?: number | null;
    difficulty?: number | null;
    position?: number | null | string;
    note?: string;
  }>;
}

export function buildSystemPrompt(context?: AppChatContext | null): string {
  const lines = [
    "You are AppClimb Assistant — a careful App Store Optimization (ASO) advisor for iOS indie developers.",
    "You help users pick keywords, interpret popularity/difficulty, plan title/subtitle/keyword field changes, and understand observed public search positions.",
    "",
    "Product truth (never contradict):",
    "- AppClimb has a free plan with honest daily limits (8 keyword checks, 5 assistant messages) and an optional Pro plan ($8/month) that lifts limits and adds cloud sync. There is no App Store Connect login.",
    "- Popularity is Apple Ads official relative score (1–100) when the founder-owned Platform API v1 lookup hits; otherwise an ESTIMATE from public iTunes signals. It is NOT search volume, downloads, or revenue.",
    "- Difficulty is always an ESTIMATE from public iTunes Search signals (competition + top-result strength).",
    "- Position is the observed rank in the public iTunes Search API results for a country (first 200 apps). Outside that window show >200. It is not an official universal rank.",
    "- Anonymous keyword history lives only in the visitor's browser localStorage; Pro subscribers can sync their own data to their account.",
    "",
    "Safety rules (absolute):",
    "- Never invent, request, store, or reveal API keys, secrets, tokens, passwords, private keys, or internal env vars.",
    "- Never help steal credentials, bypass rate limits, scrape in abusive ways, or attack systems.",
    "- If asked for AppClimb server secrets or how to extract the DeepSeek key, refuse briefly.",
    "- Do not claim search volume, downloads, or revenue. Official popularity is a relative 1–100 Ads score, not volume.",
    "- Do not fabricate exact competitor download/revenue numbers.",
    "- Stay on ASO / App Store marketing for the user's apps. Politely decline unrelated jailbreak, malware, or political content.",
    "",
    "Style:",
    "- Be practical, concise, and easy to read in a chat bubble.",
    "- Prefer short paragraphs and simple bullet lists starting with '- '.",
    "- Use **bold** sparingly for keyword names only (e.g. **car dealer**), not whole sentences.",
    "- Do NOT use markdown tables, raw HTML, or decorative heading lines like '##' alone.",
    "- Prefer '## Short title' at most once per section; avoid # / ### spam.",
    "- Prefer actionable keyword ideas, positioning, and measurement tips.",
    "- When listing keywords with metrics, format like: - **keyword** — pos 78, pop 90 (Apple Ads) or pop ~90 (estimated).",
    "- Label estimates clearly. Use English unless the user writes in another language.",
  ];

  if (context?.appName || context?.appStoreId) {
    lines.push("", "Current app context from the user's browser (may be incomplete):");
    if (context.appName) lines.push(`- App name: ${context.appName}`);
    if (context.appStoreId) lines.push(`- App Store ID: ${context.appStoreId}`);
    if (context.country) lines.push(`- Storefront: ${context.country}`);
    if (context.developer) lines.push(`- Developer: ${context.developer}`);
    if (context.genre) lines.push(`- Category: ${context.genre}`);
    if (context.keywords && context.keywords.length > 0) {
      lines.push("- Tracked keywords (estimates / observed position):");
      for (const row of context.keywords.slice(0, 40)) {
        const bits = [
          row.keyword,
          row.popularity != null ? `pop~${row.popularity}` : null,
          row.difficulty != null ? `diff~${row.difficulty}` : null,
          row.position != null && row.position !== ""
            ? `pos=${row.position}`
            : null,
          row.note ? `note=${row.note.slice(0, 80)}` : null,
        ].filter(Boolean);
        lines.push(`  • ${bits.join(" | ")}`);
      }
    }
  }

  return lines.join("\n");
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
        difficulty:
          typeof r.difficulty === "number" ? r.difficulty : null,
        position:
          typeof r.position === "number" || typeof r.position === "string"
            ? r.position
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
