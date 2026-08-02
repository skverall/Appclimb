"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Loader2,
  Maximize2,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";

import { AI_LIMITS } from "@/lib/ai-chat";
import {
  AI_SUGGESTIONS,
  AI_WELCOME,
  clearStoredMessages,
  loadStoredMessages,
  loadTrackerContext,
  requestAssistantReply,
  saveStoredMessages,
  type UiMessage,
} from "@/lib/ai-chat-client";

export function AiChatConversation({
  variant,
  onClose,
}: {
  variant: "panel" | "page";
  onClose?: () => void;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingDay, setRemainingDay] = useState<number | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([AI_WELCOME]);
  const [contextLabel, setContextLabel] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const messagesRef = useRef(messages);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const stored = loadStoredMessages();
      setMessages(stored);
      messagesRef.current = stored;
      const ctx = loadTrackerContext();
      setContextLabel(
        ctx?.appName
          ? `${ctx.appName}${ctx.country ? ` · ${ctx.country}` : ""}`
          : null,
      );
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    messagesRef.current = messages;
    saveStoredMessages(messages);
  }, [messages, hydrated]);

  useEffect(() => {
    if (!listRef.current || !stickToBottom.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    if (variant === "page" || hydrated) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
      return () => window.clearTimeout(timer);
    }
  }, [variant, hydrated]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distance < 80;
  };

  const send = useCallback(
    async (text: string) => {
      const content = text.trim().slice(0, AI_LIMITS.maxMessageChars);
      if (!content || busy) return;

      setError(null);
      setInput("");
      const userMsg: UiMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };
      const history = [...messagesRef.current, userMsg];
      setMessages(history);
      messagesRef.current = history;
      setBusy(true);
      stickToBottom.current = true;

      try {
        const result = await requestAssistantReply({
          message: content,
          history,
          context: loadTrackerContext(),
        });
        if (typeof result.remainingDay === "number") {
          setRemainingDay(result.remainingDay);
        }
        const withReply: UiMessage[] = [
          ...messagesRef.current,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: result.message,
            createdAt: new Date().toISOString(),
          },
        ];
        messagesRef.current = withReply;
        setMessages(withReply);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not reach the assistant.",
        );
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  const clearChat = () => {
    if (
      !window.confirm(
        "Clear this assistant conversation on this device? Limits are unchanged.",
      )
    ) {
      return;
    }
    clearStoredMessages();
    setMessages([AI_WELCOME]);
    setError(null);
  };

  const showSuggestions =
    messages.filter((m) => m.id !== "welcome").length === 0;

  return (
    <div
      className={
        variant === "page"
          ? "ai-chat-shell ai-chat-shell--page"
          : "ai-chat-shell ai-chat-shell--panel"
      }
    >
      <header className="ai-chat-header">
        <div>
          <strong>
            <Sparkles size={15} aria-hidden="true" /> ASO Assistant
          </strong>
          <span>
            DeepSeek V4 Flash · estimates only · no secrets
            {contextLabel ? ` · ${contextLabel}` : ""}
          </span>
        </div>
        <div className="ai-chat-header-actions">
          {variant === "panel" && (
            <Link
              href="/assistant"
              className="ai-chat-icon-link"
              aria-label="Open full-page chat"
              title="Open full-page chat"
              onClick={onClose}
            >
              <Maximize2 size={16} aria-hidden="true" />
            </Link>
          )}
          <button
            type="button"
            className="ai-chat-icon-link"
            onClick={clearChat}
            aria-label="Clear conversation"
            title="Clear conversation"
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
          {variant === "panel" && onClose && (
            <button
              type="button"
              className="tracker-icon-button"
              onClick={onClose}
              aria-label="Close assistant"
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
          {variant === "page" && (
            <Link href="/" className="ai-chat-text-link">
              Back to tool
            </Link>
          )}
        </div>
      </header>

      {variant === "page" && (
        <div className="ai-chat-page-banner">
          <p>
            Full-screen chat with the same ASO assistant. Conversation is saved
            in this browser only and stays in sync with the popup. Context comes
            from your active <strong>My Apps</strong> tracker when present.
          </p>
          {!contextLabel && (
            <p className="ai-chat-page-banner-hint">
              Tip: add an app on the home page so the assistant can see your
              keywords and positions.
            </p>
          )}
        </div>
      )}

      <div
        className="ai-chat-messages"
        ref={listRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
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

      {showSuggestions && (
        <div className="ai-chat-suggestions">
          {AI_SUGGESTIONS.slice(0, variant === "page" ? 6 : 4).map((item) => (
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
          placeholder="Ask about keywords, positions, listing copy, or a research plan…"
          rows={variant === "page" ? 3 : 2}
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
            saved in this browser
            {variant === "panel" && (
              <>
                {" · "}
                <Link href="/assistant" onClick={onClose}>
                  Full page <ExternalLink size={11} aria-hidden="true" />
                </Link>
              </>
            )}
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
    </div>
  );
}
