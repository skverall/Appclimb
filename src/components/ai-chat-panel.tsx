"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  X,
} from "lucide-react";

import {
  AI_LIMITS,
  type AppChatContext,
} from "@/lib/ai-chat";

type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const CLIENT_DAY_KEY = "appclimb:ai:day";

function readClientDayCount(): { day: string; count: number } {
  if (typeof window === "undefined") {
    return { day: "", count: 0 };
  }
  try {
    const raw = window.localStorage.getItem(CLIENT_DAY_KEY);
    if (!raw) return { day: new Date().toISOString().slice(0, 10), count: 0 };
    const parsed = JSON.parse(raw) as { day?: string; count?: number };
    const day = new Date().toISOString().slice(0, 10);
    if (parsed.day !== day) return { day, count: 0 };
    return { day, count: Math.max(0, Number(parsed.count) || 0) };
  } catch {
    return { day: new Date().toISOString().slice(0, 10), count: 0 };
  }
}

function writeClientDayCount(count: number) {
  if (typeof window === "undefined") return;
  const day = new Date().toISOString().slice(0, 10);
  window.localStorage.setItem(
    CLIENT_DAY_KEY,
    JSON.stringify({ day, count }),
  );
}

function loadTrackerContext(): AppChatContext | null {
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

const SUGGESTIONS = [
  "Which of my tracked keywords are worth focusing on first?",
  "Suggest long-tail keywords for my app title and subtitle.",
  "How should I interpret popularity vs difficulty estimates?",
  "My position is >200 — what should I change next?",
];

export function AiChatPanel() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingDay, setRemainingDay] = useState<number | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi — I’m the AppClimb ASO assistant (DeepSeek V4 Flash). I can suggest keywords, interpret estimated scores, and help plan title/subtitle changes for your tracked app. I won’t invent search volumes or share any secrets.",
    },
  ]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const context = useMemo(
    () => (open ? loadTrackerContext() : null),
    // Re-read when opening so latest localStorage app is used.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, messages.length],
  );

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, busy, open]);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim().slice(0, AI_LIMITS.maxMessageChars);
      if (!content || busy) return;

      const day = readClientDayCount();
      if (day.count >= AI_LIMITS.maxMessagesPerDay) {
        setError(
          "You’ve reached today’s local assistant limit. Limits reset every 24 hours.",
        );
        return;
      }

      setError(null);
      setInput("");
      const userMsg: UiMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content,
      };
      setMessages((prev) => [...prev, userMsg]);
      setBusy(true);

      try {
        const history = [...messages, userMsg]
          .filter((m) => m.id !== "welcome")
          .slice(-AI_LIMITS.maxHistoryMessages)
          .map((m) => ({ role: m.role, content: m.content }));

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content,
            messages: history,
            context: loadTrackerContext(),
          }),
        });

        const data = (await response.json()) as {
          message?: string;
          error?: string;
          remainingDay?: number;
          remainingHour?: number;
          retryAfterSec?: number;
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
        if (typeof data.remainingDay === "number") {
          setRemainingDay(data.remainingDay);
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: reply,
          },
        ]);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not reach the assistant.",
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, messages],
  );

  return (
    <>
      <button
        type="button"
        className="ai-chat-fab"
        onClick={() => setOpen(true)}
        aria-label="Open ASO assistant"
      >
        <MessageCircle size={20} aria-hidden="true" />
        <span>ASO AI</span>
      </button>

      {open && (
        <div
          className="ai-chat-backdrop"
          role="presentation"
          onClick={() => setOpen(false)}
        />
      )}

      <section
        className={`ai-chat-panel${open ? " is-open" : ""}`}
        aria-hidden={!open}
        aria-label="AppClimb ASO assistant"
      >
        <header className="ai-chat-header">
          <div>
            <strong>
              <Sparkles size={15} aria-hidden="true" /> ASO Assistant
            </strong>
            <span>
              DeepSeek V4 Flash · estimates only · no secrets
              {context?.appName ? ` · ${context.appName}` : ""}
            </span>
          </div>
          <button
            type="button"
            className="tracker-icon-button"
            onClick={() => setOpen(false)}
            aria-label="Close assistant"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="ai-chat-messages" ref={listRef}>
          {messages.map((message) => (
            <div
              key={message.id}
              className={`ai-chat-bubble ai-chat-bubble--${message.role}`}
            >
              {message.content}
            </div>
          ))}
          {busy && (
            <div className="ai-chat-bubble ai-chat-bubble--assistant is-typing">
              <Loader2 className="spin" size={14} aria-hidden="true" />
              Thinking…
            </div>
          )}
        </div>

        {messages.length <= 2 && (
          <div className="ai-chat-suggestions">
            {SUGGESTIONS.map((item) => (
              <button
                key={item}
                type="button"
                disabled={busy}
                onClick={() => void send(item)}
              >
                {item}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="ai-chat-error" role="alert">
            {error}
          </div>
        )}

        <form
          className="ai-chat-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void send(input);
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about keywords, positions, or listing copy…"
            rows={2}
            maxLength={AI_LIMITS.maxMessageChars}
            disabled={busy}
            aria-label="Message the ASO assistant"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(input);
              }
            }}
          />
          <div className="ai-chat-composer-bar">
            <small>
              {remainingDay != null
                ? `${remainingDay} server msgs left today`
                : `${AI_LIMITS.maxMessagesPerDay}/day limit`}
              {" · "}
              local only context
            </small>
            <button
              type="submit"
              className="tracker-button-primary"
              disabled={busy || input.trim().length < 2}
            >
              {busy ? (
                <Loader2 className="spin" size={15} aria-hidden="true" />
              ) : (
                <Send size={15} aria-hidden="true" />
              )}
              Send
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
