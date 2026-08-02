// Browser-only helpers for the ASO assistant UI (popup + full page).

import { AI_LIMITS, type AppChatContext } from "@/lib/ai-chat";

export type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
};

export const AI_CLIENT_DAY_KEY = "appclimb:ai:day";
export const AI_MESSAGES_KEY = "appclimb:ai:messages:v1";

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

export function loadStoredMessages(): UiMessage[] {
  if (typeof window === "undefined") return [AI_WELCOME];
  try {
    const raw = window.localStorage.getItem(AI_MESSAGES_KEY);
    if (!raw) return [AI_WELCOME];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return [AI_WELCOME];
    const messages = parsed
      .filter((item): item is UiMessage => {
        if (!item || typeof item !== "object") return false;
        const row = item as UiMessage;
        return (
          (row.role === "user" || row.role === "assistant") &&
          typeof row.content === "string" &&
          typeof row.id === "string" &&
          row.content.trim().length > 0
        );
      })
      .slice(-80);
    if (messages.length === 0) return [AI_WELCOME];
    if (messages[0]?.id !== "welcome") {
      return [AI_WELCOME, ...messages];
    }
    return messages;
  } catch {
    return [AI_WELCOME];
  }
}

export function saveStoredMessages(messages: UiMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    // Drop the static welcome when persisting long threads to save space.
    const toSave = messages
      .filter((m) => m.id !== "welcome" || messages.length <= 2)
      .slice(-80);
    window.localStorage.setItem(AI_MESSAGES_KEY, JSON.stringify(toSave));
  } catch {
    // Quota / private mode — ignore.
  }
}

export function clearStoredMessages(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AI_MESSAGES_KEY);
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
}): Promise<{ message: string; remainingDay?: number; remainingHour?: number }> {
  const content = options.message.trim().slice(0, AI_LIMITS.maxMessageChars);
  if (content.length < 2) {
    throw new Error("Message is too short.");
  }

  const day = readClientDayCount();
  if (day.count >= AI_LIMITS.maxMessagesPerDay) {
    throw new Error(
      "You’ve reached today’s local assistant limit. Limits reset every 24 hours.",
    );
  }

  const history = options.history
    .filter((m) => m.id !== "welcome")
    .slice(-AI_LIMITS.maxHistoryMessages)
    .map((m) => ({ role: m.role, content: m.content }));

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: content,
      messages: history,
      context: options.context,
    }),
  });

  const data = (await response.json()) as {
    message?: string;
    error?: string;
    remainingDay?: number;
    remainingHour?: number;
  };

  if (!response.ok) {
    throw new Error(
      data.error
        || (response.status === 429
          ? "Rate limit reached. Please wait and try again."
          : "Assistant request failed."),
    );
  }

  const reply = (data.message ?? "").trim();
  if (!reply) throw new Error("Empty assistant response.");

  writeClientDayCount(day.count + 1);
  return {
    message: reply,
    remainingDay: data.remainingDay,
    remainingHour: data.remainingHour,
  };
}
