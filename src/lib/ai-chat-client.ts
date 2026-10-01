// Browser-only helpers for the ASO assistant UI (popup + full page).
// Conversations live in localStorage under `appclimb:ai:conversations:v1`;
// the pre-history single-thread key (`appclimb:ai:messages:v1`) is migrated
// once into the new store on first load and then removed.

import {
  AI_LIMITS,
  AI_TOOL_NAMES,
  type AiDataCard,
  type AiStreamEvent,
  type AppChatContext,
} from "@/lib/ai-chat";

export type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  /** Apple data the reply was grounded in. */
  cards?: AiDataCard[];
  /** Next questions the model suggested. */
  followups?: string[];
  /** The user stopped the reply before it finished. */
  stopped?: boolean;
};

export type AiConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: UiMessage[];
};

export type AiConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export type AiChatStore = {
  version: 1;
  activeId: string | null;
  conversations: AiConversation[];
};

export const AI_CLIENT_DAY_KEY = "appclimb:ai:day";
export const AI_CONVERSATIONS_KEY = "appclimb:ai:conversations:v1";
/** Legacy single-thread key; migrated into the conversations store on first load. */
export const AI_MESSAGES_KEY = "appclimb:ai:messages:v1";

export const AI_CONVERSATION_LIMIT = 50;
export const AI_TITLE_MAX_CHARS = 48;

export const AI_WELCOME: UiMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi — I’m AppClimb’s ASO assistant. I check Apple’s own popularity data before I suggest keywords, and I write titles, subtitles, and keyword fields that fit App Store limits.",
  createdAt: "welcome",
};

/** Starter prompts when no app is connected. */
export const AI_SUGGESTIONS = [
  "Find keyword ideas for a habit tracker app",
  "What's rising in Health & Fitness searches this month?",
  "How should I read popularity vs difficulty?",
  "Write a 100-character keyword field for a budgeting app",
] as const;

/** Fallback follow-ups when the model offers none. */
export const AI_FOLLOWUPS = [
  "Find more keyword ideas",
  "Write my keyword field",
  "What should I change first?",
] as const;

export function readClientDayCount(): { day: string; count: number } {
  if (typeof window === "undefined") {
    return { day: "", count: 0 };
  }
  try {
    const raw = window.localStorage.getItem(AI_CLIENT_DAY_KEY);
    const day = new Date().toISOString().slice(0, 10);
    if (!raw) return { day, count: 0 };
    const parsed = JSON.parse(raw) as { day?: string; count?: number };
    if (parsed.day !== day) return { day, count: 0 };
    return { day, count: Math.max(0, Number(parsed.count) || 0) };
  } catch {
    return { day: new Date().toISOString().slice(0, 10), count: 0 };
  }
}

export function writeClientDayCount(count: number): void {
  if (typeof window === "undefined") return;
  const day = new Date().toISOString().slice(0, 10);
  window.localStorage.setItem(
    AI_CLIENT_DAY_KEY,
    JSON.stringify({ day, count }),
  );
}

function emptyStore(): AiChatStore {
  return { version: 1, activeId: null, conversations: [] };
}

function freshConversation(): AiConversation {
  const now = new Date().toISOString();
  return {
    id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    messages: [AI_WELCOME],
  };
}

/** Derived title: the first user message, whitespace-collapsed and truncated. */
export function conversationTitleFromMessages(messages: UiMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  const text = (first?.content ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "New chat";
  return text.length > AI_TITLE_MAX_CHARS
    ? `${text.slice(0, AI_TITLE_MAX_CHARS)}…`
    : text;
}

// --- sanitizing (shared by the live store and the legacy migration) ---

function isStoredMessage(value: unknown): value is UiMessage {
  if (!value || typeof value !== "object") return false;
  const row = value as UiMessage;
  return (
    (row.role === "user" || row.role === "assistant") &&
    typeof row.content === "string" &&
    typeof row.id === "string" &&
    row.content.trim().length > 0
  );
}

const TOOL_NAMES = new Set<string>(AI_TOOL_NAMES);

function sanitizeCards(raw: unknown): AiDataCard[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const cards: AiDataCard[] = [];
  for (const item of raw.slice(0, 4)) {
    if (!item || typeof item !== "object") continue;
    const card = item as AiDataCard;
    if (!TOOL_NAMES.has(card.tool) || typeof card.title !== "string" || !Array.isArray(card.rows)) {
      continue;
    }
    const rows = card.rows
      .filter(
        (row) =>
          row &&
          typeof row.term === "string" &&
          typeof row.popularity === "number" &&
          Number.isFinite(row.popularity),
      )
      .slice(0, 30);
    if (rows.length === 0) continue;
    cards.push({
      tool: card.tool,
      title: card.title.slice(0, 120),
      country: typeof card.country === "string" ? card.country.slice(0, 4) : "US",
      week: typeof card.week === "string" ? card.week.slice(0, 10) : null,
      rows,
    });
  }
  return cards.length > 0 ? cards : undefined;
}

function sanitizeMessage(row: UiMessage): UiMessage {
  const message: UiMessage = {
    id: row.id,
    role: row.role,
    content: row.content,
    ...(typeof row.createdAt === "string" ? { createdAt: row.createdAt } : {}),
  };
  if (row.role === "assistant") {
    const cards = sanitizeCards(row.cards);
    if (cards) message.cards = cards;
    if (Array.isArray(row.followups)) {
      const followups = row.followups
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.slice(0, 90))
        .slice(0, 3);
      if (followups.length > 0) message.followups = followups;
    }
    if (row.stopped === true) message.stopped = true;
  }
  return message;
}

function sanitizeMessages(raw: unknown): UiMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isStoredMessage).slice(-80).map(sanitizeMessage);
}

function sanitizeConversations(raw: unknown): AiConversation[] {
  if (!Array.isArray(raw)) return [];
  const conversations: AiConversation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as AiConversation;
    if (
      typeof row.id !== "string" ||
      typeof row.title !== "string" ||
      typeof row.createdAt !== "string" ||
      typeof row.updatedAt !== "string"
    ) {
      continue;
    }
    const messages = sanitizeMessages(row.messages);
    if (messages.length === 0) continue;
    conversations.push({
      id: row.id,
      title: row.title.slice(0, AI_TITLE_MAX_CHARS),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      messages,
    });
  }
  conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return conversations.slice(0, AI_CONVERSATION_LIMIT);
}

function sanitizeStore(raw: unknown): AiChatStore | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as {
    activeId?: unknown;
    conversations?: unknown;
  };
  if (!Array.isArray(row.conversations)) return null;
  const conversations = sanitizeConversations(row.conversations);
  const activeId =
    typeof row.activeId === "string" &&
    conversations.some((c) => c.id === row.activeId)
      ? row.activeId
      : null;
  return { version: 1, activeId, conversations };
}

function ensureActive(store: AiChatStore): AiChatStore {
  if (store.conversations.some((c) => c.id === store.activeId)) {
    return store;
  }
  const next: AiChatStore = { ...store };
  if (next.conversations.length === 0) {
    next.conversations = [freshConversation()];
  }
  next.activeId = next.conversations.reduce((a, b) =>
    b.updatedAt > a.updatedAt ? b : a,
  ).id;
  return next;
}

export function loadAiChatStore(): AiChatStore {
  if (typeof window === "undefined") return emptyStore();
  let store: AiChatStore = emptyStore();
  try {
    const raw = window.localStorage.getItem(AI_CONVERSATIONS_KEY);
    if (raw) {
      try {
        const parsed = sanitizeStore(JSON.parse(raw));
        if (parsed) store = parsed;
      } catch {
        // Corrupt store — start fresh and drop the bad key below.
      }
      if (store.conversations.length === 0) {
        window.localStorage.removeItem(AI_CONVERSATIONS_KEY);
      }
    }
    // One-time migration: the pre-history thread becomes the first
    // conversation, titled from its first user message.
    if (store.conversations.length === 0) {
      const legacyRaw = window.localStorage.getItem(AI_MESSAGES_KEY);
      if (legacyRaw) {
        const legacy = sanitizeMessages(JSON.parse(legacyRaw));
        if (legacy.length > 0) {
          const now = new Date().toISOString();
          const conversation: AiConversation = {
            id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title: conversationTitleFromMessages(legacy),
            createdAt: now,
            updatedAt: now,
            messages: legacy,
          };
          store.conversations = [conversation];
          store.activeId = conversation.id;
        }
      }
    }
    // The legacy key is obsolete once the conversations store exists.
    window.localStorage.removeItem(AI_MESSAGES_KEY);
  } catch {
    store = emptyStore();
  }
  const finalized = ensureActive(store);
  // Persist migration/fresh-store results so they survive even when the
  // caller only reads (no component save follows).
  saveAiChatStore(finalized);
  return finalized;
}

export function saveAiChatStore(store: AiChatStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AI_CONVERSATIONS_KEY, JSON.stringify(store));
  } catch {
    // Quota / private mode — ignore.
  }
}

// --- active-thread helpers (same contract as the legacy single-thread API) ---

function storedMessages(store: AiChatStore): UiMessage[] {
  const active = store.conversations.find((c) => c.id === store.activeId);
  return active?.messages ?? [];
}

export function loadStoredMessages(): UiMessage[] {
  const stored = storedMessages(loadAiChatStore());
  if (stored.length === 0) return [AI_WELCOME];
  if (stored[0]?.id !== "welcome") return [AI_WELCOME, ...stored];
  return stored;
}

export function saveStoredMessages(messages: UiMessage[]): void {
  if (typeof window === "undefined") return;
  const store = loadAiChatStore();
  // Drop the static welcome when persisting long threads to save space.
  const toSave = messages
    .filter((m) => m.id !== "welcome" || messages.length <= 2)
    .slice(-80);
  const now = new Date().toISOString();
  saveAiChatStore({
    ...store,
    conversations: store.conversations.map((c) =>
      c.id === store.activeId
        ? {
            ...c,
            messages: toSave,
            title: conversationTitleFromMessages(messages),
            updatedAt: now,
          }
        : c,
    ),
  });
}

export function clearStoredMessages(): void {
  if (typeof window === "undefined") return;
  const store = loadAiChatStore();
  const now = new Date().toISOString();
  saveAiChatStore({
    ...store,
    conversations: store.conversations.map((c) =>
      c.id === store.activeId
        ? { ...c, messages: [AI_WELCOME], title: "New chat", updatedAt: now }
        : c,
    ),
  });
}

// --- conversation history ---

export function loadChatState(): {
  activeId: string | null;
  conversations: AiConversationSummary[];
} {
  const store = loadAiChatStore();
  const conversations = store.conversations.map((c) => ({
    id: c.id,
    title: c.title,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    messageCount: c.messages.filter((m) => m.id !== "welcome").length,
  }));
  conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { activeId: store.activeId, conversations };
}

export function createConversation(): void {
  if (typeof window === "undefined") return;
  const store = loadAiChatStore();
  const conversation = freshConversation();
  saveAiChatStore({
    ...store,
    activeId: conversation.id,
    conversations: [conversation, ...store.conversations],
  });
}

export function setActiveConversation(id: string): boolean {
  if (typeof window === "undefined") return false;
  const store = loadAiChatStore();
  if (!store.conversations.some((c) => c.id === id)) return false;
  saveAiChatStore({ ...store, activeId: id });
  return true;
}

export function deleteConversation(id: string): boolean {
  if (typeof window === "undefined") return false;
  const store = loadAiChatStore();
  const conversations = store.conversations.filter((c) => c.id !== id);
  if (conversations.length === store.conversations.length) return false;
  const next = ensureActive({
    ...store,
    activeId: store.activeId === id ? null : store.activeId,
    conversations,
  });
  saveAiChatStore(next);
  return true;
}

const TRACKER_KEY = "appclimb:tracker:v1";
/** Which tracked app the assistant reads: "auto" (the active one), "none", or an app key. */
export const AI_CONTEXT_KEY = "appclimb:ai:context";

type RawTrackerStore = {
  activeAppKey?: string | null;
  apps?: Array<{
    appStoreId: string;
    name: string;
    developer?: string;
    genre?: string;
    country: string;
    iconUrl?: string;
    description?: string;
  }>;
  keywords?: Record<
    string,
    {
      appStoreId: string;
      country: string;
      keyword: string;
      note?: string;
      currentMetrics?: {
        popularity?: number;
        popularitySource?: "official" | "longtail" | "estimated";
        difficulty?: number;
        position?: number | null;
        unavailable?: boolean;
      } | null;
    }
  >;
  snapshots?: Record<string, Array<{ date?: string; position?: number | null }>>;
};

function readTrackerStore(): RawTrackerStore | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TRACKER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RawTrackerStore;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export interface TrackedAppOption {
  key: string;
  name: string;
  country: string;
  iconUrl?: string;
  keywordCount: number;
}

/** Tracked apps the assistant can use as context. */
export function listTrackedApps(): TrackedAppOption[] {
  const store = readTrackerStore();
  if (!store?.apps) return [];
  const keywords = Object.values(store.keywords ?? {});
  return store.apps
    .filter((app) => app && typeof app.appStoreId === "string" && typeof app.name === "string")
    .map((app) => ({
      key: `${app.appStoreId}:${app.country}`,
      name: app.name,
      country: app.country,
      iconUrl: app.iconUrl || undefined,
      keywordCount: keywords.filter(
        (row) => row.appStoreId === app.appStoreId && row.country === app.country,
      ).length,
    }));
}

export function readContextChoice(): string {
  if (typeof window === "undefined") return "auto";
  try {
    return window.localStorage.getItem(AI_CONTEXT_KEY) || "auto";
  } catch {
    return "auto";
  }
}

export function writeContextChoice(choice: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AI_CONTEXT_KEY, choice);
  } catch {
    // Private mode — the choice simply isn't remembered.
  }
}

/** Resolve a stored choice to the app key it means right now (null = none). */
export function resolveContextKey(choice: string, apps: TrackedAppOption[]): string | null {
  if (choice === "none" || apps.length === 0) return null;
  if (choice !== "auto" && apps.some((app) => app.key === choice)) return choice;
  const active = readTrackerStore()?.activeAppKey;
  return apps.find((app) => app.key === active)?.key ?? apps[0].key;
}

function localDate(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * The tracked app (the active one unless `appKey` names another) with its
 * keywords, metrics, and 30-day rank movement, for the assistant prompt.
 */
export function loadTrackerContext(appKey?: string | null): AppChatContext | null {
  if (appKey === null) return null;
  const store = readTrackerStore();
  if (!store) return null;
  try {
    const wanted = appKey ?? store.activeAppKey;
    const app =
      store.apps?.find((item) => `${item.appStoreId}:${item.country}` === wanted) ??
      store.apps?.[0];
    if (!app) return null;
    const since = localDate(-29);
    const keywords = Object.entries(store.keywords ?? {})
      .filter(([, row]) => row.appStoreId === app.appStoreId && row.country === app.country)
      .slice(0, 40)
      .map(([key, row]) => {
        const window30 = (store.snapshots?.[key] ?? [])
          .filter((snap) => typeof snap?.date === "string" && snap.date >= since)
          .sort((left, right) => String(left.date).localeCompare(String(right.date)));
        const first = window30.length >= 2 ? window30[0] : null;
        return {
          keyword: row.keyword,
          note: row.note,
          popularity: row.currentMetrics?.unavailable
            ? null
            : row.currentMetrics?.popularity ?? null,
          popularitySource: row.currentMetrics?.popularitySource,
          difficulty: row.currentMetrics?.unavailable
            ? null
            : row.currentMetrics?.difficulty ?? null,
          position: row.currentMetrics?.unavailable
            ? "Unavailable"
            : row.currentMetrics?.position === null
              ? ">200"
              : row.currentMetrics?.position ?? null,
          ...(first
            ? { previousPosition: typeof first.position === "number" ? first.position : ">200" }
            : {}),
        };
      });
    return {
      appName: app.name,
      appStoreId: app.appStoreId,
      country: app.country,
      developer: app.developer,
      genre: app.genre,
      description: typeof app.description === "string" ? app.description.slice(0, 800) : undefined,
      keywords,
    };
  } catch {
    return null;
  }
}

export interface AssistantUsage {
  configured: boolean;
  signedIn: boolean;
  limit: number | null;
  used: number | null;
  remaining: number | null;
  tools: boolean;
}

/** Today's server-side allowance (null when the server can't tell). */
export async function fetchAssistantUsage(): Promise<AssistantUsage | null> {
  try {
    const response = await fetch("/api/chat/usage", { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    return (await response.json()) as AssistantUsage;
  } catch {
    return null;
  }
}

/** Thrown when the user stops a reply. */
export class ReplyStoppedError extends Error {
  constructor() {
    super("Stopped.");
    this.name = "ReplyStoppedError";
  }
}

export interface AssistantReply {
  message: string;
  followups?: string[];
  cards?: AiDataCard[];
  remainingDay?: number;
  remainingHour?: number;
}

function failureMessage(status: number, error?: string): string {
  return (
    error ||
    (status === 401
      ? "Sign in to use the ASO assistant."
      : status === 429
        ? "Rate limit reached. Please wait and try again."
        : "Assistant request failed. Try again in a moment.")
  );
}

/** Read the NDJSON reply stream, forwarding events as they arrive. */
async function readReplyStream(
  response: Response,
  onEvent: (event: AiStreamEvent) => void,
): Promise<AssistantReply> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const cards: AiDataCard[] = [];
  let meta: { remainingDay?: number; remainingHour?: number } = {};
  const handle = (line: string): AssistantReply | null => {
    if (!line.trim()) return null;
    let event: AiStreamEvent;
    try {
      event = JSON.parse(line) as AiStreamEvent;
    } catch {
      return null;
    }
    if (event.type === "error") throw new Error(event.error || "Assistant request failed.");
    if (event.type === "meta") meta = { remainingDay: event.remainingDay, remainingHour: event.remainingHour };
    if (event.type === "card") cards.push(event.card);
    onEvent(event);
    if (event.type === "done") {
      return {
        message: event.message,
        followups: event.followups,
        cards,
        ...meta,
      };
    }
    return null;
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      const reply = handle(line);
      if (reply) return reply;
    }
  }
  const reply = handle(buffer);
  if (reply) return reply;
  throw new Error("The answer was cut off. Try again.");
}

export async function requestAssistantReply(options: {
  message: string;
  history: UiMessage[];
  context: AppChatContext | null;
  /**
   * Plan-aware daily cap. Falls back to the shared AI_LIMITS when omitted.
   * `null` means unlimited (Pro).
   */
  maxPerDay?: number | null;
  /** Stream the reply; events arrive here as they happen. */
  onEvent?: (event: AiStreamEvent) => void;
  signal?: AbortSignal;
}): Promise<AssistantReply> {
  const content = options.message.trim().slice(0, AI_LIMITS.maxMessageChars);
  if (content.length < 2) {
    throw new Error("Message is too short.");
  }

  const effectiveMax =
    options.maxPerDay === undefined ? AI_LIMITS.maxMessagesPerDay : options.maxPerDay;
  if (effectiveMax !== null) {
    const day = readClientDayCount();
    if (day.count >= effectiveMax) {
      throw new Error(
        "You’ve reached today’s assistant limit. Limits reset every 24 hours — upgrade to Pro for more.",
      );
    }
  }

  const history = options.history
    .filter((m) => m.id !== "welcome")
    .slice(-AI_LIMITS.maxHistoryMessages)
    .map((m) => ({ role: m.role, content: m.content }));

  let response: Response;
  try {
    response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: content,
        messages: history,
        context: options.context,
        ...(options.onEvent ? { stream: true } : {}),
      }),
      signal: options.signal,
    });
  } catch {
    if (options.signal?.aborted) throw new ReplyStoppedError();
    // Network failure (offline, aborted connection) — never leak the
    // browser's raw "Failed to fetch" into the composer.
    throw new Error("Could not reach the assistant. Check your connection.");
  }

  const type = response.headers.get("content-type") ?? "";
  if (response.ok && options.onEvent && type.includes("ndjson") && response.body) {
    let reply: AssistantReply;
    try {
      reply = await readReplyStream(response, options.onEvent);
    } catch (error) {
      if (options.signal?.aborted) throw new ReplyStoppedError();
      throw error instanceof Error ? error : new Error("Assistant request failed.");
    }
    writeClientDayCount(readClientDayCount().count + 1);
    return reply;
  }

  let data: {
    message?: string;
    error?: string;
    followups?: unknown;
    cards?: unknown;
    remainingDay?: number;
    remainingHour?: number;
  } = {};
  try {
    data = (await response.json()) as typeof data;
  } catch {
    // Non-JSON failure body (proxy error page, truncated response, abort) —
    // fall back to status-based messaging instead of leaking a parse error.
  }

  if (!response.ok) {
    throw new Error(failureMessage(response.status, data.error));
  }

  const reply = (data.message ?? "").trim();
  if (!reply) throw new Error("Empty assistant response.");

  writeClientDayCount(readClientDayCount().count + 1);
  const followups = Array.isArray(data.followups)
    ? data.followups.filter((item): item is string => typeof item === "string").slice(0, 3)
    : [];
  const cards = sanitizeCards(data.cards);
  return {
    message: reply,
    ...(followups.length > 0 ? { followups } : {}),
    ...(cards ? { cards } : {}),
    remainingDay: data.remainingDay,
    remainingHour: data.remainingHour,
  };
}
