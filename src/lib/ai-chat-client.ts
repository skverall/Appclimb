// Browser-only helpers for the ASO assistant UI (popup + full page).
// Conversations live in localStorage under `appclimb:ai:conversations:v1`;
// the pre-history single-thread key (`appclimb:ai:messages:v1`) is migrated
// once into the new store on first load and then removed.

import { AI_LIMITS, type AppChatContext } from "@/lib/ai-chat";

export type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
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
    "Hi — I’m the AppClimb ASO assistant (DeepSeek V4 Flash). I can suggest keywords, interpret estimated scores, and help plan title/subtitle changes for your tracked app. I won’t invent search volumes or share any secrets.",
  createdAt: "welcome",
};

export const AI_SUGGESTIONS = [
  "Which of my tracked keywords are worth focusing on first?",
  "Suggest long-tail keywords for my app title and subtitle.",
  "How should I interpret popularity vs difficulty estimates?",
  "My position is >200 — what should I change next?",
  "Rewrite my App Store subtitle for better discoverability.",
  "Give me a 7-day keyword research plan for my app.",
] as const;

export const AI_FOLLOWUPS = [
  "Suggest 5 more related keywords",
  "Generate 100-character keyword field",
  "Rewrite subtitle for better reach",
  "How do I improve conversion rate?",
  "Analyze competitor keyword gaps",
  "Give me next action steps",
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

function sanitizeMessages(raw: unknown): UiMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isStoredMessage).slice(-80);
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

export function loadTrackerContext(): AppChatContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("appclimb:tracker:v1");
    if (!raw) return null;
    const store = JSON.parse(raw) as {
      activeAppKey?: string | null;
      apps?: Array<{
        appStoreId: string;
        name: string;
        developer?: string;
        genre?: string;
        country: string;
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
            difficulty?: number;
            position?: number | null;
            unavailable?: boolean;
          } | null;
        }
      >;
    };
    const app =
      store.apps?.find(
        (item) => `${item.appStoreId}:${item.country}` === store.activeAppKey,
      ) ?? store.apps?.[0];
    if (!app) return null;
    const keywords = Object.values(store.keywords ?? {})
      .filter(
        (row) =>
          row.appStoreId === app.appStoreId && row.country === app.country,
      )
      .slice(0, 30)
      .map((row) => ({
        keyword: row.keyword,
        note: row.note,
        popularity: row.currentMetrics?.unavailable
          ? null
          : row.currentMetrics?.popularity ?? null,
        difficulty: row.currentMetrics?.unavailable
          ? null
          : row.currentMetrics?.difficulty ?? null,
        position: row.currentMetrics?.unavailable
          ? "Unavailable"
          : row.currentMetrics?.position === null
            ? ">200"
            : row.currentMetrics?.position ?? null,
      }));
    return {
      appName: app.name,
      appStoreId: app.appStoreId,
      country: app.country,
      developer: app.developer,
      genre: app.genre,
      keywords,
    };
  } catch {
    return null;
  }
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
}): Promise<{ message: string; remainingDay?: number; remainingHour?: number }> {
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
      }),
    });
  } catch {
    // Network failure (offline, aborted connection) — never leak the
    // browser's raw "Failed to fetch" into the composer.
    throw new Error("Could not reach the assistant. Check your connection.");
  }

  let data: {
    message?: string;
    error?: string;
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
    throw new Error(
      data.error
        || (response.status === 401
          ? "Sign in to use the ASO assistant."
          : response.status === 429
            ? "Rate limit reached. Please wait and try again."
            : "Assistant request failed."),
    );
  }

  const reply = (data.message ?? "").trim();
  if (!reply) throw new Error("Empty assistant response.");

  writeClientDayCount(readClientDayCount().count + 1);
  return {
    message: reply,
    remainingDay: data.remainingDay,
    remainingHour: data.remainingHour,
  };
}
