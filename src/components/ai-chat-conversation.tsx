"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  History,
  Lock,
  LogIn,
  Maximize2,
  PenLine,
  Search,
  Sparkles,
  Square,
  SquarePen,
  Target,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";

import { AiDataCardView } from "@/components/ai-chat-cards";
import { AiChatHistory } from "@/components/ai-chat-history";
import { ChatMarkdown } from "@/components/chat-markdown";
import { useAccount } from "@/components/account-provider";
import { canUseAssistant } from "@/lib/access";
import { AI_LIMITS, AI_MODEL_LABEL, extractFollowups, type AiDataCard } from "@/lib/ai-chat";
import { proEnabled } from "@/lib/flags";
import { trackAppEvent } from "@/lib/analytics-client";
import { explorerLink } from "@/lib/keyword-pages";
import {
  AI_CONVERSATIONS_KEY,
  AI_FOLLOWUPS,
  AI_MESSAGES_KEY,
  AI_SUGGESTIONS,
  AI_WELCOME,
  ReplyStoppedError,
  createConversation,
  deleteConversation,
  fetchAssistantUsage,
  listTrackedApps,
  loadChatState,
  loadStoredMessages,
  loadTrackerContext,
  readContextChoice,
  requestAssistantReply,
  resolveContextKey,
  saveStoredMessages,
  setActiveConversation,
  writeContextChoice,
  type AiConversationSummary,
  type TrackedAppOption,
  type UiMessage,
} from "@/lib/ai-chat-client";

type Pending = {
  status: string | null;
  text: string;
  cards: AiDataCard[];
};

type Starter = {
  icon: typeof Target;
  title: string;
  hint: string;
  prompt: string;
};

function startersFor(app: TrackedAppOption | null): Starter[] {
  if (app) {
    const count = app.keywordCount;
    return [
      {
        icon: Target,
        title: "Audit my keywords",
        hint: count > 0 ? `Which of my ${count} keywords to push, keep, or drop` : "Where to start with keywords",
        prompt: "Audit my tracked keywords: which should I focus on, keep, or drop — and why?",
      },
      {
        icon: Search,
        title: "Find new keywords",
        hint: "Ideas checked against Apple popularity",
        prompt:
          "Find 10 new keyword ideas for my app with real Apple popularity, and tell me which ones are realistic to rank for.",
      },
      {
        icon: PenLine,
        title: "Write my metadata",
        hint: "App name, subtitle, and a 100-character keyword field",
        prompt: "Write an optimized app name, subtitle, and 100-character keyword field for my app.",
      },
      {
        icon: TrendingUp,
        title: "What’s rising",
        hint: "Searches climbing in my category",
        prompt: "Which searches are rising in my category right now, and are any of them a fit for my app?",
      },
    ];
  }
  const icons = [Search, TrendingUp, Target, PenLine];
  const hints = [
    "Ideas with Apple popularity",
    "Searches climbing this month",
    "How AppClimb’s numbers work",
    "Comma-separated, no wasted characters",
  ];
  return AI_SUGGESTIONS.map((prompt, index) => ({
    icon: icons[index] ?? Sparkles,
    title: prompt,
    hint: hints[index] ?? "",
    prompt,
  }));
}

function AssistantAvatar() {
  return (
    <span className="aic-avatar" aria-hidden="true">
      <Sparkles size={14} />
    </span>
  );
}

function CopyReply({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`aic-msg-action${copied ? " is-copied" : ""}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(content);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Ignore clipboard write failures in non-secure context
        }
      }}
      title={copied ? "Copied to clipboard" : "Copy response"}
      aria-label={copied ? "Copied to clipboard" : "Copy response"}
    >
      {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

function ContextPicker({
  apps,
  selectedKey,
  onChange,
  compact,
}: {
  apps: TrackedAppOption[];
  selectedKey: string | null;
  onChange: (choice: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (apps.length === 0) {
    return (
      <Link href="/" className="aic-context aic-context--empty" title="Track an app so the assistant sees its keywords">
        <span className="aic-context-dot" aria-hidden="true" />
        {compact ? "No app" : "No app connected"}
      </Link>
    );
  }
  const selected = apps.find((app) => app.key === selectedKey) ?? null;
  return (
    <div className="aic-context-wrap" ref={ref}>
      <button
        type="button"
        className={`aic-context${selected ? " is-on" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Assistant context: ${selected ? `${selected.name} · ${selected.country}` : "no app"}`}
        onClick={() => setOpen((value) => !value)}
      >
        {selected?.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={selected.iconUrl} alt="" width={16} height={16} />
        ) : (
          <span className="aic-context-dot" aria-hidden="true" />
        )}
        <span className="aic-context-name">{selected ? selected.name : "No app"}</span>
        {selected && <span className="aic-context-country">{selected.country}</span>}
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && (
        <div className="aic-context-menu" role="menu">
          <p className="aic-context-menu-label">The assistant sees this app’s keywords</p>
          {apps.map((app) => (
            <button
              key={app.key}
              type="button"
              role="menuitemradio"
              aria-checked={app.key === selectedKey}
              onClick={() => {
                onChange(app.key);
                setOpen(false);
              }}
            >
              {app.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={app.iconUrl} alt="" width={22} height={22} />
              ) : (
                <span className="aic-context-icon" aria-hidden="true">
                  {app.name.charAt(0)}
                </span>
              )}
              <span>
                <strong>{app.name}</strong>
                <small>
                  {app.country} · {app.keywordCount} keyword{app.keywordCount === 1 ? "" : "s"}
                </small>
              </span>
              {app.key === selectedKey && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
          <button
            type="button"
            role="menuitemradio"
            aria-checked={selectedKey === null}
            onClick={() => {
              onChange("none");
              setOpen(false);
            }}
          >
            <span className="aic-context-icon aic-context-icon--none" aria-hidden="true">
              <X size={12} />
            </span>
            <span>
              <strong>No app</strong>
              <small>General ASO questions</small>
            </span>
            {selectedKey === null && <Check size={14} aria-hidden="true" />}
          </button>
        </div>
      )}
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
  // Deep link from the "Ask AI" callouts: seed the draft with the keyword
  // question (never auto-send). Lazy init reads ?ask once; the effect below
  // only strips the param from the URL (an external-system update).
  const [input, setInput] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("ask") ?? "";
  });
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remainingDay, setRemainingDay] = useState<number | null>(null);
  const [apps, setApps] = useState<TrackedAppOption[]>([]);
  const [contextChoice, setContextChoice] = useState("auto");
  const [messages, setMessages] = useState<UiMessage[]>([AI_WELCOME]);
  const [conversations, setConversations] = useState<AiConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const messagesRef = useRef(messages);
  const abortRef = useRef<AbortController | null>(null);

  const { account, signedIn, accountsLive, role, loading, openAuth, openUpgrade } =
    useAccount();
  const proOn = proEnabled();
  const limitsOn = proOn || accountsLive;
  const aiLimit = limitsOn ? account.limits.aiMessagesPerDay : AI_LIMITS.maxMessagesPerDay;
  const chatAllowed = canUseAssistant(role, accountsLive);
  const isGuest = accountsLive && !signedIn && !loading;

  const contextKey = useMemo(
    () => (hydrated ? resolveContextKey(contextChoice, apps) : null),
    [hydrated, contextChoice, apps],
  );
  const contextApp = apps.find((app) => app.key === contextKey) ?? null;
  const keywordHref = useCallback(
    (term: string) => explorerLink(term, contextApp?.country ?? "US"),
    [contextApp?.country],
  );
  // Real keywords (tracked or seen in Apple data) — single bold words link
  // only when they are one of these.
  const knownTerms = useMemo(() => {
    const terms = new Set<string>();
    if (hydrated && contextKey) {
      for (const row of loadTrackerContext(contextKey)?.keywords ?? []) {
        terms.add(row.keyword.toLocaleLowerCase());
      }
    }
    for (const message of messages) {
      for (const card of message.cards ?? []) {
        for (const row of card.rows) terms.add(row.term.toLocaleLowerCase());
      }
    }
    for (const card of pending?.cards ?? []) {
      for (const row of card.rows) terms.add(row.term.toLocaleLowerCase());
    }
    return terms;
  }, [hydrated, contextKey, messages, pending?.cards]);

  const adjustTextareaHeight = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 24), 180)}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

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
      setApps(listTrackedApps());
      setContextChoice(readContextChoice());
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Server-side allowance, so "N left today" is right before the first send.
  useEffect(() => {
    if (!hydrated || !chatAllowed || loading) return;
    let cancelled = false;
    void fetchAssistantUsage().then((usage) => {
      if (cancelled || !usage?.signedIn || usage.remaining === null) return;
      setRemainingDay(usage.remaining);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, chatAllowed, loading, signedIn]);

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
      if (event.key === "appclimb:tracker:v1") {
        setApps(listTrackedApps());
        return;
      }
      if (event.key !== AI_CONVERSATIONS_KEY && event.key !== AI_MESSAGES_KEY) return;
      if (abortRef.current) return;
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
    const el = listRef.current;
    if (!el) return;
    // An empty chat reads from the top (hero, then starters).
    if (!pending && messages.every((message) => message.id === "welcome")) {
      el.scrollTop = 0;
      return;
    }
    if (stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  useEffect(() => {
    if (variant === "page" || hydrated) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
      return () => window.clearTimeout(timer);
    }
  }, [variant, hydrated, activeId]);

  // Strip the ?ask deep-link param once the draft has been seeded.
  useEffect(() => {
    if (variant !== "page") return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("ask")) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("ask");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [variant]);

  // Abort an in-flight reply if the chat unmounts (popup closed).
  useEffect(() => () => abortRef.current?.abort(), []);

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
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
  };

  const changeContext = (choice: string) => {
    setContextChoice(choice);
    writeContextChoice(choice);
  };

  const send = useCallback(
    async (text: string) => {
      if (!canUseAssistant(role, accountsLive)) {
        openAuth("assistant");
        return;
      }
      const content = text.trim().slice(0, AI_LIMITS.maxMessageChars);
      if (content.length < 2 || busy) return;
      trackAppEvent("assistant_used", null, { oncePerDay: "default" });

      setError(null);
      const userMsg: UiMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };
      const history = [...messagesRef.current, userMsg];
      setMessages(history);
      messagesRef.current = history;
      setInput("");
      setBusy(true);
      setPending({ status: null, text: "", cards: [] });
      stickToBottom.current = true;
      const controller = new AbortController();
      abortRef.current = controller;
      // The streamed text so far; kept outside React state so a stop can
      // commit exactly what the user saw.
      let partial = "";
      const partialCards: AiDataCard[] = [];

      const commit = (reply: UiMessage) => {
        const withReply = [...messagesRef.current, reply];
        messagesRef.current = withReply;
        setMessages(withReply);
      };

      try {
        const result = await requestAssistantReply({
          message: content,
          history,
          context: loadTrackerContext(resolveContextKey(readContextChoice(), listTrackedApps())),
          maxPerDay: aiLimit,
          signal: controller.signal,
          onEvent: (event) => {
            switch (event.type) {
              case "meta":
                if (typeof event.remainingDay === "number") setRemainingDay(event.remainingDay);
                break;
              case "status":
                setPending((current) => (current ? { ...current, status: event.text } : current));
                break;
              case "reset":
                partial = "";
                setPending((current) => (current ? { ...current, text: "" } : current));
                break;
              case "delta":
                partial += event.text;
                setPending((current) =>
                  current ? { ...current, status: null, text: current.text + event.text } : current,
                );
                break;
              case "card":
                partialCards.push(event.card);
                setPending((current) =>
                  current ? { ...current, cards: [...current.cards, event.card] } : current,
                );
                break;
              default:
                break;
            }
          },
        });
        if (typeof result.remainingDay === "number") setRemainingDay(result.remainingDay);
        commit({
          id: `a-${Date.now()}`,
          role: "assistant",
          content: result.message,
          createdAt: new Date().toISOString(),
          ...(result.cards && result.cards.length > 0 ? { cards: result.cards } : {}),
          ...(result.followups && result.followups.length > 0 ? { followups: result.followups } : {}),
        });
      } catch (err) {
        const shown = extractFollowups(partial).body;
        if (err instanceof ReplyStoppedError && shown) {
          // Keep what was already written; the user chose to stop there.
          commit({
            id: `a-${Date.now()}`,
            role: "assistant",
            content: shown,
            createdAt: new Date().toISOString(),
            stopped: true,
            ...(partialCards.length > 0 ? { cards: partialCards } : {}),
          });
        } else {
          // The send failed (network, server, quota) or was stopped before any
          // text: restore the draft and drop the bubble that got no answer.
          const reverted = messagesRef.current.filter((message) => message.id !== userMsg.id);
          messagesRef.current = reverted;
          setMessages(reverted);
          setInput(content);
          if (!(err instanceof ReplyStoppedError)) {
            setError(err instanceof Error ? err.message : "Could not reach the assistant.");
          }
        }
      } finally {
        abortRef.current = null;
        setPending(null);
        setBusy(false);
      }
    },
    [busy, aiLimit, role, accountsLive, openAuth],
  );

  const stop = () => abortRef.current?.abort();

  // History lives in an overlay (popup popover, mobile drawer) or a persistent
  // sidebar; only the overlays should close after picking a chat.
  const closeOverlayHistory = () => {
    if (
      variant === "panel" ||
      (typeof window !== "undefined" && window.matchMedia("(max-width: 899px)").matches)
    ) {
      setHistoryOpen(false);
    }
  };

  const refreshHistory = () => {
    const state = loadChatState();
    setActiveId(state.activeId);
    setConversations(state.conversations);
  };

  const showStored = () => {
    const stored = loadStoredMessages();
    messagesRef.current = stored;
    setMessages(stored);
    setError(null);
    stickToBottom.current = true;
    refreshHistory();
  };

  const switchTo = (id: string) => {
    if (busy) return;
    closeOverlayHistory();
    if (id === activeId) return;
    setActiveConversation(id);
    showStored();
  };

  const startNewChat = () => {
    if (busy) return;
    closeOverlayHistory();
    createConversation();
    showStored();
  };

  const deleteChat = (id: string) => {
    if (busy) return;
    if (!window.confirm("Delete this conversation on this device?")) return;
    closeOverlayHistory();
    deleteConversation(id);
    showStored();
  };

  const visible = messages.filter((m) => m.id !== "welcome");
  const isThreadEmpty = visible.length === 0;
  const lastAssistant = [...visible].reverse().find((m) => m.role === "assistant") ?? null;
  const followups =
    !busy && lastAssistant && visible[visible.length - 1]?.id === lastAssistant.id
      ? lastAssistant.followups && lastAssistant.followups.length > 0
        ? lastAssistant.followups
        : [...AI_FOLLOWUPS]
      : [];
  const starters = startersFor(contextApp);
  const pendingText = pending ? extractFollowups(pending.text).body : "";
  const usageLabel =
    aiLimit === null
      ? "Pro · unlimited today"
      : remainingDay != null
        ? `${remainingDay} of ${aiLimit} messages left today`
        : `${aiLimit}/day ${proOn ? "free " : ""}limit`;

  const historyList = (
    <AiChatHistory
      conversations={conversations}
      activeId={activeId}
      disabled={busy}
      onSelect={switchTo}
      onNew={startNewChat}
      onDelete={deleteChat}
    />
  );

  return (
    <div
      className={
        variant === "page"
          ? `ai-chat-shell ai-chat-shell--page${historyOpen ? " has-sidebar-open" : " has-sidebar-closed"}`
          : "ai-chat-shell ai-chat-shell--panel"
      }
    >
      {variant === "page" && historyOpen && (
        <>
          <button
            type="button"
            className="ai-chat-history-scrim"
            aria-label="Close chat history"
            onClick={() => setHistoryOpen(false)}
          />
          <aside className="ai-chat-history-sidebar is-open" aria-label="Chat history">
            <button
              type="button"
              className="ai-chat-history-close"
              onClick={() => setHistoryOpen(false)}
              aria-label="Close chat history"
            >
              <X size={16} aria-hidden="true" />
            </button>
            {historyList}
          </aside>
        </>
      )}

      <div className="ai-chat-shell-main">
        <header className="ai-chat-header">
          <div className="ai-chat-header-left">
            {variant === "page" && (
              <button
                type="button"
                className={`ai-chat-icon-link ai-chat-history-btn${historyOpen ? " is-active" : ""}`}
                onClick={() => setHistoryOpen((open) => !open)}
                aria-label="Toggle chat history"
                aria-pressed={historyOpen}
                title="Chat history"
              >
                <History size={16} aria-hidden="true" />
              </button>
            )}
            <strong className="ai-chat-title">
              <Sparkles size={15} className="ai-chat-title-icon" aria-hidden="true" />
              <span>ASO Assistant</span>
            </strong>
            {hydrated && (
              <ContextPicker
                apps={apps}
                selectedKey={contextKey}
                onChange={changeContext}
                compact={variant === "panel"}
              />
            )}
          </div>

          <div className="ai-chat-header-actions">
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
                className={`ai-chat-icon-link${historyOpen ? " is-active" : ""}`}
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
            {!isThreadEmpty && activeId && (
              <button
                type="button"
                className="ai-chat-icon-link"
                onClick={() => deleteChat(activeId)}
                disabled={busy}
                aria-label="Delete this chat"
                title="Delete this chat"
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            )}
            {variant === "panel" && onClose && (
              <button
                type="button"
                className="ai-chat-icon-link"
                onClick={onClose}
                aria-label="Close assistant"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
            {variant === "page" && (
              <Link href="/" className="ai-chat-text-link">
                Back to tool
              </Link>
            )}
          </div>
        </header>

        <div className="ai-chat-messages-wrap">
          <div
            className="ai-chat-messages"
            ref={listRef}
            onScroll={onScroll}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
            {isThreadEmpty && (
              <div className="aic-hero">
                <span className="aic-hero-badge" aria-hidden="true">
                  <Sparkles size={22} />
                </span>
                <h1 className="aic-hero-title">Your ASO co-pilot</h1>
                <p className="aic-hero-sub">
                  Keyword advice grounded in Apple’s own popularity data — plus titles, subtitles, and
                  keyword fields that fit App Store limits. Ask in any language.
                </p>
                {contextApp ? (
                  <p className="aic-hero-context">
                    Working on <strong>{contextApp.name}</strong> · {contextApp.country} ·{" "}
                    {contextApp.keywordCount} tracked keyword{contextApp.keywordCount === 1 ? "" : "s"}
                  </p>
                ) : (
                  hydrated && (
                    <p className="aic-hero-context aic-hero-context--muted">
                      <Link href="/">Track your app</Link> and the assistant will see its keywords and
                      ranks.
                    </p>
                  )
                )}
                <div className="aic-starters">
                  {starters.map((starter) => {
                    const Icon = starter.icon;
                    return (
                      <button
                        key={starter.title}
                        type="button"
                        className="aic-starter"
                        disabled={busy}
                        onClick={() => void send(starter.prompt)}
                        title={starter.prompt}
                      >
                        <span className="aic-starter-icon" aria-hidden="true">
                          <Icon size={16} />
                        </span>
                        <span className="aic-starter-text">
                          <strong>{starter.title}</strong>
                          {starter.hint && starter.hint !== starter.title && <small>{starter.hint}</small>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {visible.map((message) =>
              message.role === "assistant" ? (
                <article key={message.id} className="aic-msg aic-msg--assistant">
                  <AssistantAvatar />
                  <div className="aic-msg-body">
                    {message.cards?.map((card, index) => (
                      <AiDataCardView key={index} card={card} />
                    ))}
                    <div className="ai-chat-bubble ai-chat-bubble--assistant">
                      <ChatMarkdown
                        text={message.content}
                        keywordHref={keywordHref}
                        knownTerms={knownTerms}
                        appName={contextApp?.name}
                      />
                    </div>
                    <div className="aic-msg-actions">
                      <CopyReply content={message.content} />
                      {message.stopped && <span className="aic-msg-note">Stopped</span>}
                    </div>
                  </div>
                </article>
              ) : (
                <div key={message.id} className="ai-chat-bubble ai-chat-bubble--user">
                  {message.content}
                </div>
              ),
            )}

            {pending && (
              <article className="aic-msg aic-msg--assistant is-pending" aria-busy="true">
                <AssistantAvatar />
                <div className="aic-msg-body">
                  {pending.cards.map((card, index) => (
                    <AiDataCardView key={index} card={card} />
                  ))}
                  {pending.status && !pendingText ? (
                    <p className="aic-status">
                      <span className="aic-status-dots" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                      {pending.status}…
                    </p>
                  ) : null}
                  {!pending.status && !pendingText && pending.cards.length === 0 && (
                    <p className="aic-status">
                      <span className="aic-status-dots" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                      Thinking…
                    </p>
                  )}
                  {pendingText && (
                    <div className="ai-chat-bubble ai-chat-bubble--assistant is-streaming">
                      <ChatMarkdown
                        text={pendingText}
                        keywordHref={keywordHref}
                        knownTerms={knownTerms}
                        appName={contextApp?.name}
                      />
                    </div>
                  )}
                </div>
              </article>
            )}

            {followups.length > 0 && chatAllowed && (
              <div className="aic-followups" aria-label="Suggested follow-up questions">
                {followups.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="ai-chat-followup-chip"
                    onClick={() => void send(item)}
                  >
                    {item}
                  </button>
                ))}
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

        {error && (
          <div className="ai-chat-error-container">
            <div className="ai-chat-error" role="alert">
              {error}
            </div>
          </div>
        )}

        <div className="ai-chat-composer-container">
          {loading ? null : isGuest ? (
            <div className="ai-chat-auth-gate" role="region" aria-label="Sign in required">
              <span className="guest-lock-icon" aria-hidden="true">
                <Lock size={16} />
              </span>
              <div>
                <strong>Sign in to chat</strong>
                <p>
                  The ASO assistant is part of a free account (5 messages/day). Keyword search on the
                  home page works without signing in.
                </p>
              </div>
              <button type="button" className="tracker-button-primary" onClick={() => openAuth("assistant")}>
                <LogIn size={15} aria-hidden="true" />
                Sign in free
              </button>
            </div>
          ) : aiLimit !== null && remainingDay === 0 && !busy ? (
            <div className="ai-chat-auth-gate" role="region" aria-label="Daily limit reached">
              <span className="guest-lock-icon" aria-hidden="true">
                <Lock size={16} />
              </span>
              <div>
                <strong>Today&rsquo;s messages are used up</strong>
                <p>
                  You&rsquo;ve used all {aiLimit} assistant messages for today. The limit resets at
                  midnight UTC.
                </p>
              </div>
              {proOn && (
                <button type="button" className="tracker-button-primary" onClick={openUpgrade}>
                  Upgrade for more
                </button>
              )}
            </div>
          ) : (
            <form
              className="ai-chat-composer"
              onSubmit={(event) => {
                event.preventDefault();
                if (busy) stop();
                else void send(input);
              }}
            >
              <div className="ai-chat-composer-box">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask about keywords, ranks, or App Store metadata…"
                  rows={1}
                  maxLength={AI_LIMITS.maxMessageChars}
                  aria-label="Message the ASO assistant"
                  onKeyDown={(event) => {
                    // Enter confirms the IME composition (CJK input); it must
                    // not send a half-composed message.
                    if (event.nativeEvent.isComposing) return;
                    if (event.key === "Escape" && busy) {
                      event.preventDefault();
                      stop();
                      return;
                    }
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (!busy) void send(input);
                    }
                  }}
                />
                {busy ? (
                  <button
                    type="submit"
                    className="ai-chat-send-btn is-stop"
                    aria-label="Stop"
                    title="Stop (Esc)"
                  >
                    <Square size={12} fill="currentColor" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="ai-chat-send-btn"
                    disabled={input.trim().length < 2}
                    aria-label="Send"
                    title="Send (Enter)"
                  >
                    <ArrowUp size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="ai-chat-composer-bar">
                <small>
                  <span className="aic-usage">{usageLabel}</span>
                  <span>Saved in this browser</span>
                  <span title="Answers come from the model; popularity numbers come from Apple Ads">
                    {AI_MODEL_LABEL} + Apple Ads data
                  </span>
                  {proOn && aiLimit !== null && remainingDay !== null && remainingDay <= 1 && (
                    <button type="button" className="ai-chat-upgrade-link" onClick={openUpgrade}>
                      Upgrade for more
                    </button>
                  )}
                  {variant === "panel" && (
                    <Link href="/assistant" onClick={onClose}>
                      Full page <ExternalLink size={11} aria-hidden="true" />
                    </Link>
                  )}
                </small>
              </div>
            </form>
          )}
        </div>
      </div>

      {variant === "panel" && historyOpen && (
        <div className="ai-chat-history-popover" aria-label="Chat history">
          {historyList}
        </div>
      )}
    </div>
  );
}
