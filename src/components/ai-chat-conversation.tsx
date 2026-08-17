"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  History,
  Loader2,
  Maximize2,
  Send,
  Sparkles,
  SquarePen,
  Trash2,
} from "lucide-react";

import { AiChatHistory } from "@/components/ai-chat-history";
import { ChatMarkdown } from "@/components/chat-markdown";
import { useAccount } from "@/components/account-provider";
import { AI_LIMITS } from "@/lib/ai-chat";
import { proEnabled } from "@/lib/flags";
import {
  AI_CONVERSATIONS_KEY,
  AI_FOLLOWUPS,
  AI_MESSAGES_KEY,
  AI_SUGGESTIONS,
  AI_WELCOME,
  clearStoredMessages,
  createConversation,
  deleteConversation,
  loadChatState,
  loadStoredMessages,
  loadTrackerContext,
  requestAssistantReply,
  saveStoredMessages,
  setActiveConversation,
  type AiConversationSummary,
  type UiMessage,
} from "@/lib/ai-chat-client";

function AssistantBubble({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard write failures in non-secure context
    }
  };

  return (
    <div className="ai-chat-bubble ai-chat-bubble--assistant">
      <ChatMarkdown text={content} />
      <div className="ai-chat-bubble-actions">
        <button
          type="button"
          className={`ai-chat-bubble-action-btn${copied ? " is-copied" : ""}`}
          onClick={onCopy}
          title={copied ? "Copied to clipboard" : "Copy response"}
          aria-label={copied ? "Copied to clipboard" : "Copy response"}
        >
          {copied ? (
            <>
              <Check size={12} aria-hidden="true" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} aria-hidden="true" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

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
  const [contextLabel, setContextLabel] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([AI_WELCOME]);
  const [conversations, setConversations] = useState<AiConversationSummary[]>(
    [],
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const messagesRef = useRef(messages);

  const { account, openUpgrade } = useAccount();
  const proOn = proEnabled();
  const aiLimit = proOn ? account.limits.aiMessagesPerDay : AI_LIMITS.maxMessagesPerDay;

  // On wide screens the history sidebar starts open; smaller screens start
  // with it closed so it never covers the chat on first visit.
  useEffect(() => {
    if (variant !== "page") return;
    void (async () => {
      await Promise.resolve();
      if (window.matchMedia("(min-width: 900px)").matches) {
        setHistoryOpen(true);
      }
    })();
  }, [variant]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const stored = loadStoredMessages();
      setMessages(stored);
      messagesRef.current = stored;
      const state = loadChatState();
      setActiveId(state.activeId);
      setConversations(state.conversations);
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
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const state = loadChatState();
      setActiveId(state.activeId);
      setConversations(state.conversations);
    })();
    return () => {
      cancelled = true;
    };
  }, [messages, hydrated]);

  // Keep the sidebar/popup in sync when another tab writes the same store.
  useEffect(() => {
    if (!hydrated) return;
    const onStorage = (event: StorageEvent) => {
      if (
        event.key !== AI_CONVERSATIONS_KEY &&
        event.key !== AI_MESSAGES_KEY
      ) {
        return;
      }
      const state = loadChatState();
      const stored = loadStoredMessages();
      messagesRef.current = stored;
      setActiveId(state.activeId);
      setConversations(state.conversations);
      setMessages(stored);
      setError(null);
      stickToBottom.current = true;
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [hydrated]);

  useEffect(() => {
    if (!historyOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHistoryOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [historyOpen]);

  useEffect(() => {
    if (!listRef.current || !stickToBottom.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    if (variant === "page" || hydrated) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
      return () => window.clearTimeout(timer);
    }
  }, [variant, hydrated, activeId]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distance < 80;
    setShowJump(!stickToBottom.current);
  };

  const jumpToBottom = () => {
    const el = listRef.current;
    if (!el) return;
    stickToBottom.current = true;
    setShowJump(false);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
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
          maxPerDay: aiLimit,
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
    [busy, aiLimit],
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
    const stored = [AI_WELCOME];
    messagesRef.current = stored;
    setMessages(stored);
    setError(null);
  };

  // History lives in an overlay (popup popover, mobile drawer) or a persistent
  // sidebar; only the overlays should close after picking a chat.
  const closeOverlayHistory = () => {
    if (
      variant === "panel" ||
      (typeof window !== "undefined" &&
        window.matchMedia("(max-width: 899px)").matches)
    ) {
      setHistoryOpen(false);
    }
  };

  const refreshHistory = () => {
    const state = loadChatState();
    setActiveId(state.activeId);
    setConversations(state.conversations);
  };

  const switchTo = (id: string) => {
    if (busy) return;
    closeOverlayHistory();
    if (id === activeId) return;
    setActiveConversation(id);
    const stored = loadStoredMessages();
    messagesRef.current = stored;
    setMessages(stored);
    setError(null);
    stickToBottom.current = true;
    refreshHistory();
  };

  const startNewChat = () => {
    if (busy) return;
    closeOverlayHistory();
    createConversation();
    const stored = [AI_WELCOME];
    messagesRef.current = stored;
    setMessages(stored);
    setError(null);
    stickToBottom.current = true;
    refreshHistory();
  };

  const deleteChat = (id: string) => {
    if (busy) return;
    if (!window.confirm("Delete this conversation on this device?")) return;
    closeOverlayHistory();
    deleteConversation(id);
    const stored = loadStoredMessages();
    messagesRef.current = stored;
    setMessages(stored);
    setError(null);
    stickToBottom.current = true;
    refreshHistory();
  };

  const showSuggestions =
    messages.filter((m) => m.id !== "welcome").length === 0;

  return (
    <div
      className={
        variant === "page"
          ? `ai-chat-shell ai-chat-shell--page${historyOpen ? " has-sidebar-open" : " has-sidebar-closed"}`
          : "ai-chat-shell ai-chat-shell--panel"
      }
    >
      {variant === "page" && historyOpen && (
        <aside
          className="ai-chat-history-sidebar is-open"
          aria-label="Chat history"
        >
          <AiChatHistory
            conversations={conversations}
            activeId={activeId}
            disabled={busy}
            onSelect={switchTo}
            onNew={startNewChat}
            onDelete={deleteChat}
          />
        </aside>
      )}

      <div className="ai-chat-shell-main">
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
            {variant === "page" && (
              <button
                type="button"
                className={`ai-chat-icon-link${
                  historyOpen ? " is-active" : ""
                }`}
                onClick={() => setHistoryOpen((open) => !open)}
                aria-label="Toggle chat history"
                aria-pressed={historyOpen}
                title="Chat history"
              >
                <History size={16} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              className="ai-chat-icon-link"
              onClick={startNewChat}
              disabled={busy}
              aria-label="New chat"
              title="New chat"
            >
              <SquarePen size={16} aria-hidden="true" />
            </button>
            {variant === "panel" && (
              <button
                type="button"
                className={`ai-chat-icon-link${
                  historyOpen ? " is-active" : ""
                }`}
                onClick={() => setHistoryOpen((open) => !open)}
                aria-label="Chat history"
                aria-pressed={historyOpen}
                title="Chat history"
              >
                <History size={16} aria-hidden="true" />
              </button>
            )}
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
              This chat and your history are saved in this browser only and stay
              in sync with the popup. Context comes from your active{" "}
              <strong>My Apps</strong> tracker when present.
            </p>
            {!contextLabel && (
              <p className="ai-chat-page-banner-hint">
                Tip: add an app on the home page so the assistant can see your
                keywords and positions.
              </p>
            )}
          </div>
        )}

        <div className="ai-chat-messages-wrap">
          <div
            className="ai-chat-messages"
            ref={listRef}
            onScroll={onScroll}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
            {messages.map((message) => (
              message.role === "assistant" ? (
                <AssistantBubble key={message.id} content={message.content} />
              ) : (
                <div
                  key={message.id}
                  className="ai-chat-bubble ai-chat-bubble--user"
                >
                  {message.content}
                </div>
              )
            ))}
            {busy && (
              <div className="ai-chat-bubble ai-chat-bubble--assistant is-typing">
                <Loader2 className="spin" size={14} aria-hidden="true" />
                Thinking…
              </div>
            )}
          </div>
          {showJump && (
            <button
              type="button"
              className="ai-chat-jump"
              onClick={jumpToBottom}
              aria-label="Scroll to latest message"
              title="Scroll to latest message"
            >
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        {showSuggestions ? (
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
        ) : (
          <div className="ai-chat-followups" aria-label="Suggested follow-up actions">
            {AI_FOLLOWUPS.slice(0, variant === "page" ? 6 : 4).map((item) => (
              <button
                key={item}
                type="button"
                disabled={busy}
                onClick={() => void send(item)}
                className="ai-chat-followup-chip"
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
              {aiLimit === null
                ? "Pro · unlimited assistant today"
                : remainingDay != null
                  ? `${remainingDay} of ${aiLimit} messages left today`
                  : `${aiLimit}/day ${proOn ? "free " : ""}limit`}
              {" · "}
              saved in this browser
              {proOn && aiLimit !== null && remainingDay === 0 && (
                <>
                  {" · "}
                  <button type="button" className="ai-chat-upgrade-link" onClick={openUpgrade}>
                    Upgrade for more
                  </button>
                </>
              )}
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

      {variant === "panel" && historyOpen && (
        <div className="ai-chat-history-popover" aria-label="Chat history">
          <AiChatHistory
            conversations={conversations}
            activeId={activeId}
            disabled={busy}
            onSelect={switchTo}
            onNew={startNewChat}
            onDelete={deleteChat}
          />
        </div>
      )}
    </div>
  );
}
