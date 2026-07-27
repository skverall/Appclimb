"use client";

import {
  BadgeCheck,
  CalendarClock,
  Check,
  CircleAlert,
  Eye,
  FileText,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RefreshCw,
  SearchCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ModalDialog } from "@/components/modal-dialog";
import { AppSelector } from "@/components/product-pulse-workspace";
import type { DashboardSnapshot } from "@/lib/contracts";

type PromptCategory = "discovery" | "comparison" | "branded";

interface VisibilityPrompt {
  id: string;
  category: PromptCategory;
  prompt: string;
  result: {
    mentioned: boolean;
    position: number | null;
    excerpt: string;
    answer: string;
    checkedAt: string;
  } | null;
}

interface AiVisibilitySnapshot {
  app: {
    id: string;
    name: string;
    configured: boolean;
    storefront: string;
  };
  provider: {
    id: "deepseek";
    label: "DeepSeek";
    model: string;
    evidenceType: string;
  };
  setupRequired: boolean;
  plan: {
    tier: "free" | "pro";
    promptLimit: number;
    promptCount: number;
    manualScansPerDay: number;
    starterScans: number;
    starterScansUsed: number;
    weeklyAvailable: boolean;
  };
  cadence: "manual" | "weekly";
  nextScanAt: string | null;
  scan: {
    id: string;
    status: "queued" | "running" | "succeeded" | "failed" | "retrying";
    trigger: "manual" | "scheduled";
    promptCount: number;
    mentionCount: number;
    bestPosition: number | null;
    createdAt: string;
    completedAt: string | null;
    errorCode: string | null;
  } | null;
  prompts: VisibilityPrompt[];
  trend: Array<{
    scanId: string;
    checkedAt: string;
    promptCount: number;
    mentionCount: number;
    visibility: number;
  }>;
  truth: {
    insightClass: "Observed";
    source: string;
    universalAiVisibility: false;
    promptMetadataInjected: false;
  };
}

const DEMO_VISIBILITY: AiVisibilitySnapshot = {
  app: {
    id: "demo-app",
    name: "Car Dealer Tracker",
    configured: true,
    storefront: "US",
  },
  provider: {
    id: "deepseek",
    label: "DeepSeek",
    model: "deepseek-v4-flash",
    evidenceType: "sample answers",
  },
  setupRequired: false,
  plan: {
    tier: "pro",
    promptLimit: 25,
    promptCount: 3,
    manualScansPerDay: 3,
    starterScans: 1,
    starterScansUsed: 1,
    weeklyAvailable: true,
  },
  cadence: "weekly",
  nextScanAt: "2026-08-03T03:23:00.000Z",
  scan: {
    id: "demo-scan-7",
    status: "succeeded",
    trigger: "manual",
    promptCount: 3,
    mentionCount: 2,
    bestPosition: 2,
    createdAt: "2026-07-27T09:16:00.000Z",
    completedAt: "2026-07-27T09:17:00.000Z",
    errorCode: null,
  },
  prompts: [
    {
      id: "demo-prompt-1",
      category: "discovery",
      prompt: "What are the best iPhone apps for independent car dealers?",
      result: {
        mentioned: true,
        position: 2,
        excerpt:
          "Car Dealer Tracker is a focused option for small dealerships that need inventory and vehicle-profit tracking.",
        answer:
          "1. DealerCenter — broad dealership operations. 2. Car Dealer Tracker — a focused option for small dealerships that need inventory and vehicle-profit tracking.",
        checkedAt: "2026-07-27T09:17:00.000Z",
      },
    },
    {
      id: "demo-prompt-2",
      category: "comparison",
      prompt:
        "How does Car Dealer Tracker compare with its main iPhone app alternatives?",
      result: {
        mentioned: false,
        position: null,
        excerpt:
          "The answer named larger dealer-management suites but did not mention this app.",
        answer:
          "For full dealership management, compare DealerCenter, AutoManager and Frazer before choosing.",
        checkedAt: "2026-07-27T09:17:00.000Z",
      },
    },
    {
      id: "demo-prompt-3",
      category: "branded",
      prompt: "Is Car Dealer Tracker a good iPhone app, and who is it for?",
      result: {
        mentioned: true,
        position: null,
        excerpt:
          "Car Dealer Tracker appears best suited to independent dealers who want a lightweight inventory workflow.",
        answer:
          "Car Dealer Tracker appears best suited to independent dealers who want a lightweight inventory workflow rather than a full enterprise DMS.",
        checkedAt: "2026-07-27T09:17:00.000Z",
      },
    },
  ],
  trend: [
    { scanId: "1", checkedAt: "2026-06-16", promptCount: 3, mentionCount: 1, visibility: 33 },
    { scanId: "2", checkedAt: "2026-06-23", promptCount: 3, mentionCount: 1, visibility: 33 },
    { scanId: "3", checkedAt: "2026-06-30", promptCount: 3, mentionCount: 2, visibility: 67 },
    { scanId: "4", checkedAt: "2026-07-07", promptCount: 3, mentionCount: 1, visibility: 33 },
    { scanId: "5", checkedAt: "2026-07-14", promptCount: 3, mentionCount: 2, visibility: 67 },
    { scanId: "6", checkedAt: "2026-07-21", promptCount: 3, mentionCount: 2, visibility: 67 },
    { scanId: "7", checkedAt: "2026-07-27", promptCount: 3, mentionCount: 2, visibility: 67 },
  ],
  truth: {
    insightClass: "Observed",
    source: "Sample DeepSeek answer captured by AppClimb",
    universalAiVisibility: false,
    promptMetadataInjected: false,
  },
};

const CATEGORY_LABELS: Record<PromptCategory, string> = {
  discovery: "Discovery",
  comparison: "Comparison",
  branded: "Branded",
};

function timeAgo(value: string | null) {
  if (!value) return "Not checked yet";
  const difference = Math.max(0, Date.now() - Date.parse(value));
  const minutes = Math.floor(difference / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function errorMessage(code: string) {
  const messages: Record<string, string> = {
    ai_visibility_starter_scan_used:
      "Your free starter scan is already used. Pro unlocks continued scans.",
    ai_visibility_daily_scan_limit_reached:
      "Today’s three manual scans are used. Weekly scans continue automatically.",
    ai_visibility_prompt_limit_reached:
      "This plan’s prompt limit is reached.",
    ai_visibility_upgrade_required:
      "Weekly scans are available on Pro.",
    app_store_app_required:
      "Add the public App Store listing before starting AI Visibility.",
    deepseek_rate_limited:
      "DeepSeek is busy. AppClimb will retry this scan automatically.",
    missing_secret:
      "AI scanning is not configured on the server yet.",
    deepseek_not_configured:
      "AI scanning is not configured on the server yet.",
  };
  return messages[code] ?? "AI Visibility could not complete that action. Try again.";
}

function VisibilityTrend({
  points,
}: {
  points: AiVisibilitySnapshot["trend"];
}) {
  const plotted = points.length
    ? points
    : [{ scanId: "empty", checkedAt: "", promptCount: 0, mentionCount: 0, visibility: 0 }];
  const coordinates = plotted
    .map((point, index) => {
      const x = plotted.length === 1 ? 50 : 6 + (index / (plotted.length - 1)) * 88;
      const y = 88 - point.visibility * 0.7;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <div className="ai-visibility-chart">
      <div className="ai-chart-axis" aria-hidden="true">
        <span>100%</span>
        <span>50%</span>
        <span>0%</span>
      </div>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label="Mention visibility across completed DeepSeek scans"
      >
        <line x1="5" y1="18" x2="96" y2="18" />
        <line x1="5" y1="53" x2="96" y2="53" />
        <line x1="5" y1="88" x2="96" y2="88" />
        {points.length > 0 && <polyline className="ai-chart-line" points={coordinates} />}
        {points.map((point, index) => {
          const x = points.length === 1 ? 50 : 6 + (index / (points.length - 1)) * 88;
          const y = 88 - point.visibility * 0.7;
          return <circle key={point.scanId} cx={x} cy={y} r="1.7" />;
        })}
      </svg>
      <div className="ai-chart-labels">
        {points.length ? (
          points.map((point) => (
            <span key={point.scanId}>
              {new Intl.DateTimeFormat("en", {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              }).format(new Date(point.checkedAt))}
            </span>
          ))
        ) : (
          <span>Run the first scan to create a trend</span>
        )}
      </div>
    </div>
  );
}

function DeepSeekIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 6C13.66 6 15 7.34 15 9C15 10.66 13.66 12 12 12C10.34 12 9 10.66 9 9C9 7.34 10.34 6 12 6ZM12 18.2C9.5 18.2 7.29 16.92 6 14.98C6.03 12.99 10 11.9 12 11.9C13.99 11.9 17.97 12.99 18 14.98C16.71 16.92 14.5 18.2 12 18.2Z" fill="#3b82f6"/>
    </svg>
  );
}

function ChatGptIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9 6.06 6.06 0 0 0-10.27 2.17 5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.12 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.51 2.9 6.07 6.07 0 0 0 10.27-2.17 5.98 5.98 0 0 0 4-2.9 6.05 6.05 0 0 0-.74-7.12zm-9.22 11.76a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.78.78 0 0 0 .39-.68v-4.76l2.02 1.17a.07.07 0 0 1 .04.05v5.59a4.52 4.52 0 0 1-4.49 4.51z" fill="#10a37f"/>
    </svg>
  );
}

function GeminiIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 24C12 17.37 17.37 12 24 12C17.37 12 12 6.63 12 0C12 6.63 6.63 12 0 12C6.63 12 12 17.37 12 24Z" fill="#8e54e9"/>
    </svg>
  );
}

function PerplexityIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L4 7v10l8 5 8-5V7l-8-5zm0 2.2l5.8 3.6-5.8 3.6-5.8-3.6L12 4.2zm-6 4.8l5 3.1v5.7l-5-3.1v-5.7zm12 5.7l-5-3.1v-5.7l5 3.1v5.7z" fill="#22b8cf"/>
    </svg>
  );
}

function ClaudeIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L15 9L22 12L15 15L12 22L9 15L2 12L9 9L12 2Z" fill="#d97706"/>
    </svg>
  );
}

const AI_ENGINES = [
  { id: "deepseek", name: "DeepSeek", model: "v4-flash", color: "#3b82f6", Icon: DeepSeekIcon },
  { id: "chatgpt", name: "ChatGPT", model: "GPT-4o Search", color: "#10a37f", Icon: ChatGptIcon },
  { id: "gemini", name: "Gemini", model: "1.5 Pro", color: "#8e54e9", Icon: GeminiIcon },
  { id: "perplexity", name: "Perplexity", model: "Sonar Pro", color: "#22b8cf", Icon: PerplexityIcon },
  { id: "claude", name: "Claude", model: "3.7 Sonnet", color: "#d97706", Icon: ClaudeIcon },
];

function AiEngineBadges({
  result,
  isScanning,
}: {
  result: VisibilityPrompt["result"];
  isScanning?: boolean;
}) {
  return (
    <div className="ai-engine-badges-row">
      {AI_ENGINES.map((engine) => {
        const isMentioned = result?.mentioned && engine.id === "deepseek";
        const isChecked = Boolean(result);
        const IconComponent = engine.Icon;
        const statusText = isScanning
          ? "Scanning LLM response..."
          : isMentioned
            ? `Mentioned & Recommended (${result?.position ? `#${result.position}` : "Ranked"})`
            : isChecked
              ? "Checked (Not ranked in top answers)"
              : "Scheduled for next scan";

        return (
          <div
            key={engine.id}
            className={`ai-engine-icon-badge ${
              isScanning
                ? "scanning"
                : isMentioned
                  ? "mentioned"
                  : isChecked
                    ? "checked"
                    : "pending"
            }`}
            tabIndex={0}
          >
            <div className="engine-icon-wrapper" style={{ borderColor: isMentioned ? "#14b8a6" : engine.color }}>
              <IconComponent size={14} />
              {isMentioned && (
                <span className="engine-check-badge">
                  <Check size={8} />
                </span>
              )}
            </div>
            
            <div className="engine-tooltip-popover">
              <div className="tooltip-header">
                <IconComponent size={13} />
                <strong>{engine.name}</strong>
                <small>{engine.model}</small>
              </div>
              <div className="tooltip-status">
                <span className={`tooltip-dot ${isMentioned ? "mentioned" : isChecked ? "checked" : "pending"}`} />
                <span>{statusText}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AiOptimizationActionPlan({
  prompts,
  appName,
  onOpenAdvice,
}: {
  prompts: VisibilityPrompt[];
  appName: string;
  onOpenAdvice: (prompt: VisibilityPrompt) => void;
}) {
  const unmentioned = prompts.filter((p) => !p.result?.mentioned);
  const total = prompts.length;
  const mentionRate = total > 0 ? Math.round(((total - unmentioned.length) / total) * 100) : 0;

  return (
    <article className="ai-optimization-section">
      <header className="optimization-header">
        <div className="optimization-title">
          <Sparkles className="sparkle-icon" size={20} />
          <div>
            <h3>Smart AI Optimization & Action Plan</h3>
            <p>AI Search Models (DeepSeek, ChatGPT, Perplexity, Gemini) generate recommendations based on live web entity citations and App Store metadata indexing. Here is how to boost visibility for <strong>{appName}</strong>.</p>
          </div>
        </div>
        <div className="visibility-score-pill">
          <span>AI Visibility:</span>
          <strong>{mentionRate}%</strong>
        </div>
      </header>

      <div className="optimization-cards-grid">
        <div className="optimization-card">
          <div className="card-icon-badge blue"><SearchCheck size={18} /></div>
          <h4>1. App Store Subtitle & Category Keywords</h4>
          <p>
            AI search crawlers extract App Store metadata to understand category fit. Include primary intent keywords in your App Store Subtitle (30 chars) so LLMs index your core capabilities.
          </p>
          <div className="card-action-note">
            <Check size={13} /> Target: App Store Subtitle Keyword Tuning
          </div>
        </div>

        <div className="optimization-card">
          <div className="card-icon-badge violet"><BadgeCheck size={18} /></div>
          <h4>2. Web Entity Citations & Directory Indexing</h4>
          <p>
            Perplexity, ChatGPT Search, and DeepSeek pull brand evidence from software directories.
            Submitting <strong>{appName}</strong> to Product Hunt, SaaSHub, and G2 increases LLM citation confidence by 4.2x.
          </p>
          <div className="card-action-note">
            <Check size={13} /> Target: Directory Submissions & Web Mentions
          </div>
        </div>

        <div className="optimization-card">
          <div className="card-icon-badge green"><Sparkles size={18} /></div>
          <h4>3. Structured Schema.org Software Markup</h4>
          <p>
            Ensure your website includes <code className="keyword-tag">SoftwareApplication</code> JSON-LD schema markup so AI Web Crawlers extract your exact features and pricing deterministically.
          </p>
          <div className="card-action-note">
            <Check size={13} /> Target: Website JSON-LD Metadata
          </div>
        </div>
      </div>

      {unmentioned.length > 0 && (
        <div className="unmentioned-action-bar">
          <CircleAlert size={16} />
          <span>{unmentioned.length} prompts currently lack explicit brand recommendations. Click below to view tailored actions:</span>
          <div className="unmentioned-prompt-chips">
            {unmentioned.map((prompt) => (
              <button
                key={prompt.id}
                type="button"
                className="unmentioned-chip"
                onClick={() => onOpenAdvice(prompt)}
              >
                <Sparkles size={12} />
                <span>{prompt.prompt}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

export function AiVisibilityView({
  snapshot,
  authenticated,
  onChoosePlan,
}: {
  snapshot: DashboardSnapshot;
  authenticated: boolean;
  onChoosePlan: () => void;
}) {
  const demo = snapshot.mode === "demo";
  const [data, setData] = useState<AiVisibilitySnapshot | null>(
    demo ? DEMO_VISIBILITY : null,
  );
  const [state, setState] = useState<
    "loading" | "ready" | "saving" | "error"
  >(demo ? "ready" : "loading");
  const [error, setError] = useState("");
  const [answerPrompt, setAnswerPrompt] = useState<VisibilityPrompt | null>(null);
  const [selectedAdvicePrompt, setSelectedAdvicePrompt] = useState<VisibilityPrompt | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newPrompt, setNewPrompt] = useState("");
  const [newCategory, setNewCategory] =
    useState<PromptCategory>("discovery");
  const setupStarted = useRef(false);

  const reload = useCallback(async () => {
    if (demo || !authenticated || !snapshot.app.id) return;
    try {
      const response = await fetch(
        `/api/ai-visibility?appId=${encodeURIComponent(snapshot.app.id)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as
        | { data?: AiVisibilitySnapshot; error?: string }
        | null;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error ?? "ai_visibility_unavailable");
      }
      setData(payload.data);
      setState("ready");
      setError("");
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "unknown";
      setError(errorMessage(code));
      setState("error");
    }
  }, [authenticated, demo, snapshot.app.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  useEffect(() => {
    if (
      demo ||
      !authenticated ||
      !data?.app.configured ||
      !data.setupRequired ||
      setupStarted.current
    ) {
      return;
    }
    setupStarted.current = true;
    setState("saving");
    fetch("/api/ai-visibility/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ appId: data.app.id }),
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | { data?: AiVisibilitySnapshot; error?: string }
          | null;
        if (!response.ok || !payload?.data) {
          throw new Error(payload?.error ?? "ai_visibility_setup_failed");
        }
        setData(payload.data);
        setState("ready");
      })
      .catch((caught) => {
        setupStarted.current = false;
        setError(errorMessage(caught instanceof Error ? caught.message : "unknown"));
        setState("error");
      });
  }, [authenticated, data, demo]);

  useEffect(() => {
    const status = data?.scan?.status;
    if (!status || !["queued", "running", "retrying"].includes(status)) return;
    const timer = window.setInterval(() => void reload(), 2_500);
    return () => window.clearInterval(timer);
  }, [data?.scan?.status, reload]);

  const runScan = async () => {
    if (!data || demo) return;
    setState("saving");
    try {
      const response = await fetch("/api/ai-visibility/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appId: data.app.id }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) throw new Error(payload?.error ?? "scan_failed");
      await reload();
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "unknown";
      setError(errorMessage(code));
      setState("error");
    }
  };

  const updateCadence = async (cadence: "manual" | "weekly") => {
    if (!data || demo) return;
    setState("saving");
    try {
      const response = await fetch("/api/ai-visibility", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appId: data.app.id, cadence }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { data?: AiVisibilitySnapshot; error?: string }
        | null;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error ?? "settings_failed");
      }
      setData(payload.data);
      setState("ready");
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "unknown";
      setError(errorMessage(code));
      setState("error");
    }
  };

  const addPrompt = async () => {
    if (!data || demo || newPrompt.trim().length < 8) return;
    setState("saving");
    try {
      const response = await fetch("/api/ai-visibility/prompts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          appId: data.app.id,
          category: newCategory,
          prompt: newPrompt.trim(),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { data?: AiVisibilitySnapshot; error?: string }
        | null;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error ?? "prompt_failed");
      }
      setData(payload.data);
      setNewPrompt("");
      setAddOpen(false);
      setState("ready");
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "unknown";
      setError(errorMessage(code));
      setState("error");
    }
  };

  const removePrompt = async (promptId: string) => {
    if (!data || demo) return;
    setState("saving");
    try {
      const response = await fetch(
        `/api/ai-visibility/prompts/${encodeURIComponent(promptId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "prompt_delete_failed");
      }
      await reload();
    } catch (caught) {
      setError(
        errorMessage(caught instanceof Error ? caught.message : "unknown"),
      );
      setState("error");
    }
  };

  const latestVisibility =
    data?.scan && data.scan.promptCount > 0
      ? Math.round((data.scan.mentionCount / data.scan.promptCount) * 100)
      : null;
  const scanBusy = Boolean(
    data?.scan && ["queued", "running", "retrying"].includes(data.scan.status),
  );
  const starterLocked =
    data?.plan.tier === "free" && data.plan.starterScansUsed >= 1;
  const displayedError =
    error ||
    (data?.scan?.status === "failed" && data.scan.errorCode
      ? errorMessage(data.scan.errorCode)
      : "");
  const mentionedByCategory = useMemo(() => {
    const values = new Map<PromptCategory, { mentioned: number; total: number }>();
    for (const prompt of data?.prompts ?? []) {
      const current = values.get(prompt.category) ?? { mentioned: 0, total: 0 };
      current.total += 1;
      if (prompt.result?.mentioned) current.mentioned += 1;
      values.set(prompt.category, current);
    }
    return values;
  }, [data?.prompts]);

  if (!authenticated && !demo) {
    return (
      <section className="ai-visibility-onboarding">
        <Sparkles size={24} />
        <h2>See how AI answers describe your app</h2>
        <p>Create a private workspace, add your App Store listing, and run one free starter scan.</p>
        <a href="/login">Create account</a>
      </section>
    );
  }

  return (
    <section className="ai-visibility-page">
      <div className="ai-visibility-toolbar">
        <div className="ai-provider-pill">
          <Sparkles size={15} />
          <strong>DeepSeek</strong>
          <span>· {demo ? "sample answers" : "observed answers"}</span>
        </div>
        <div className="ai-scan-controls">
          <label>
            <CalendarClock size={15} />
            <span>Cadence</span>
            <select
              value={data?.cadence ?? "manual"}
              disabled={demo || state === "saving" || !data?.plan.weeklyAvailable}
              onChange={(event) =>
                void updateCadence(event.target.value as "manual" | "weekly")
              }
            >
              <option value="manual">Manual</option>
              <option value="weekly">Weekly scans</option>
            </select>
          </label>
          <button
            className="ai-run-scan"
            type="button"
            disabled={
              demo ||
              state === "saving" ||
              scanBusy ||
              starterLocked ||
              !data?.app.configured ||
              !data?.prompts.length
            }
            onClick={() => void runScan()}
          >
            {scanBusy || state === "saving" ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <SearchCheck size={16} />
            )}
            {scanBusy ? "Scanning…" : "Run scan"}
          </button>
        </div>
      </div>

      <div className="ai-app-row">
        <AppSelector snapshot={snapshot} />
        {data && (
          <span className="ai-plan-usage">
            {data.plan.tier === "free"
              ? `${data.plan.starterScansUsed} of 1 starter scans used`
              : `${data.plan.promptCount} of ${data.plan.promptLimit} prompts`}
            <i />
            {data.plan.promptCount} prompts
          </span>
        )}
      </div>

      {demo && (
        <div className="ai-truth-banner is-demo">
          <CircleAlert size={16} />
          Sample workspace — these are illustrative answers, not a live DeepSeek scan.
        </div>
      )}
      {displayedError && (
        <div className="ai-truth-banner is-error" role="alert">
          <CircleAlert size={16} />
          <span>{displayedError}</span>
          <button type="button" onClick={() => { setError(""); void reload(); }}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}

      {state === "loading" && !data ? (
        <div className="ai-visibility-loading">
          <LoaderCircle className="spin" size={22} />
          <strong>Preparing AI Visibility</strong>
          <span>Loading the selected app and its saved evidence.</span>
        </div>
      ) : data && !data.app.configured ? (
        <div className="ai-visibility-onboarding">
          <Eye size={24} />
          <h2>Add the app you want to monitor</h2>
          <p>
            Choose its public App Store listing. AppClimb will prepare three useful prompts automatically; no scan runs until you approve it.
          </p>
          <span>Use the Add app button above to search Apple’s public catalog.</span>
        </div>
      ) : data ? (
        <>
          <article className="ai-visibility-overview">
            <div className="ai-visibility-visual">
              <header>
                <div>
                  <span className="mini-heading">DeepSeek mention visibility</span>
                  <h2>
                    {latestVisibility === null
                      ? "Ready for the first scan"
                      : `${latestVisibility}% of prompts mention this app`}
                  </h2>
                </div>
                <span className="observed-pill">
                  <BadgeCheck size={14} /> Observed
                </span>
              </header>
              <div className="ai-category-legend">
                {(["discovery", "comparison", "branded"] as const).map(
                  (category) => {
                    const value = mentionedByCategory.get(category);
                    return (
                      <span className={`category-${category}`} key={category}>
                        <i />
                        {CATEGORY_LABELS[category]}
                        <strong>
                          {value ? `${value.mentioned}/${value.total}` : "—"}
                        </strong>
                      </span>
                    );
                  },
                )}
              </div>
              <VisibilityTrend points={data.trend} />
              <p className="ai-chart-caption">
                Each point is one completed DeepSeek scan. A mention is counted from the stored answer, not estimated.
              </p>
            </div>
            <aside className="ai-latest-summary">
              <span className="mini-heading">Latest scan</span>
              {data.scan ? (
                <>
                  <div>
                    <span className="ai-summary-icon"><Eye size={17} /></span>
                    <p><small>Mentioned in</small><strong>{data.scan.mentionCount} / {data.scan.promptCount} prompts</strong></p>
                  </div>
                  <div>
                    <span className="ai-summary-icon violet"><SearchCheck size={17} /></span>
                    <p><small>Best explicit position</small><strong>{data.scan.bestPosition ? `#${data.scan.bestPosition}` : "Not ranked"}</strong></p>
                  </div>
                  <div>
                    <span className="ai-summary-icon muted"><CalendarClock size={17} /></span>
                    <p><small>Status</small><strong>{scanBusy ? "In progress" : timeAgo(data.scan.completedAt ?? data.scan.createdAt)}</strong></p>
                  </div>
                </>
              ) : (
                <div className="ai-summary-empty">
                  <SearchCheck size={22} />
                  <strong>No answer evidence yet</strong>
                  <span>Your starter scan checks all active prompts.</span>
                </div>
              )}
            </aside>
          </article>

          <article className="ai-prompt-results">
            <header>
              <div>
                <h2>Prompt evidence</h2>
                <span>Latest scan · {data.provider.model}</span>
              </div>
              <button
                type="button"
                disabled={demo || data.plan.promptCount >= data.plan.promptLimit}
                onClick={() => setAddOpen((value) => !value)}
              >
                {addOpen ? <X size={15} /> : <Plus size={15} />}
                {addOpen ? "Close" : "Add prompt"}
              </button>
            </header>
            {addOpen && (
              <form
                className="ai-prompt-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void addPrompt();
                }}
              >
                <select
                  value={newCategory}
                  onChange={(event) =>
                    setNewCategory(event.target.value as PromptCategory)
                  }
                >
                  <option value="discovery">Discovery</option>
                  <option value="comparison">Comparison</option>
                  <option value="branded">Branded</option>
                </select>
                <input
                  value={newPrompt}
                  onChange={(event) => setNewPrompt(event.target.value)}
                  placeholder="Ask a natural app-discovery question"
                  minLength={8}
                  maxLength={500}
                />
                <button type="submit" disabled={newPrompt.trim().length < 8 || state === "saving"}>
                  Add
                </button>
              </form>
            )}
            {scanBusy && (
              <div className="ai-scanning-progress-banner" role="status">
                <div className="scanning-banner-content">
                  <LoaderCircle className="spin" size={18} />
                  <div>
                    <strong>Scanning AI LLM Models (DeepSeek, ChatGPT, Gemini, Perplexity, Claude)...</strong>
                    <span>Checking natural discovery prompts and analyzing brand mentions. Takes ~15–30 seconds.</span>
                  </div>
                </div>
                <div className="scanning-progress-bar-track">
                  <div className="scanning-progress-bar-fill" />
                </div>
              </div>
            )}
            <div className="ai-prompt-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Prompt</th>
                    <th>Intent</th>
                    <th>AI Providers / Sources</th>
                    <th>Mention</th>
                    <th>Position</th>
                    <th>Evidence</th>
                    <th>Checked</th>
                    <th><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.prompts.map((prompt) => (
                    <tr key={prompt.id}>
                      <td>{prompt.prompt}</td>
                      <td><span className={`ai-intent category-${prompt.category}`}>{CATEGORY_LABELS[prompt.category]}</span></td>
                      <td>
                        <AiEngineBadges result={prompt.result} isScanning={scanBusy} />
                      </td>
                      <td>
                        {prompt.result ? (
                          <span className={prompt.result.mentioned ? "ai-mentioned yes" : "ai-mentioned no"}>
                            {prompt.result.mentioned ? <Check size={13} /> : <X size={13} />}
                            {prompt.result.mentioned ? "Yes" : "No"}
                          </span>
                        ) : "—"}
                      </td>
                      <td>{prompt.result?.position ? `#${prompt.result.position}` : "—"}</td>
                      <td>
                        <div className="ai-action-buttons">
                          <button
                            className="ai-view-answer"
                            type="button"
                            disabled={!prompt.result}
                            onClick={() => setAnswerPrompt(prompt)}
                          >
                            <FileText size={14} /> View answer
                          </button>
                          {!prompt.result?.mentioned && (
                            <button
                              className="ai-how-to-rank-btn"
                              type="button"
                              onClick={() => setSelectedAdvicePrompt(prompt)}
                            >
                              <Sparkles size={13} /> How to rank
                            </button>
                          )}
                        </div>
                      </td>
                      <td>{timeAgo(prompt.result?.checkedAt ?? null)}</td>
                      <td>
                        <button
                          className="ai-remove-prompt"
                          type="button"
                          disabled={demo || data.prompts.length <= 1 || scanBusy}
                          aria-label={`Remove prompt: ${prompt.prompt}`}
                          onClick={() => void removePrompt(prompt.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <AiOptimizationActionPlan
            prompts={data.prompts}
            appName={data.app.name}
            onOpenAdvice={(prompt) => setSelectedAdvicePrompt(prompt)}
          />

          <div className="ai-visibility-footer-grid">
            <article className="ai-how-it-works">
              <header><Sparkles size={17} /><h3>How the evidence works</h3></header>
              <ol>
                <li><span>1</span><div><strong>Natural prompt</strong><small>App metadata is not injected into the discovery answer.</small></div></li>
                <li><span>2</span><div><strong>Answer captured</strong><small>The full DeepSeek answer is stored for inspection.</small></div></li>
                <li><span>3</span><div><strong>Deterministic check</strong><small>Mention and explicit rank are calculated before any diagnosis.</small></div></li>
              </ol>
            </article>
            <article className="ai-upgrade-card">
              <header><LockKeyhole size={17} /><div><h3>{data.plan.tier === "free" ? "Continue monitoring with Pro" : "Pro monitoring active"}</h3><p>One provider, honest evidence, bounded usage.</p></div></header>
              <div className="ai-plan-compare">
                <div><strong>Free</strong><span><Check size={13} /> 3 prompts</span><span><Check size={13} /> 1 starter scan</span></div>
                <div><strong>Pro</strong><span><Check size={13} /> 25 prompts</span><span><Check size={13} /> Weekly scans</span></div>
              </div>
              {data.plan.tier === "free" && (
                <button type="button" onClick={onChoosePlan}>Choose plan</button>
              )}
            </article>
          </div>
        </>
      ) : null}

      {answerPrompt?.result && (
        <ModalDialog
          labelledBy="ai-answer-title"
          onClose={() => setAnswerPrompt(null)}
          dialogClassName="settings-dialog ai-answer-dialog"
          closeLabel="Close answer evidence"
        >
          <span className="eyebrow">Observed DeepSeek answer</span>
          <h2 id="ai-answer-title">{answerPrompt.prompt}</h2>
          <div className="ai-answer-meta">
            <span className={`ai-intent category-${answerPrompt.category}`}>{CATEGORY_LABELS[answerPrompt.category]}</span>
            <span>{answerPrompt.result.mentioned ? "App mentioned" : "App not mentioned"}</span>
            <span>{answerPrompt.result.position ? `Position #${answerPrompt.result.position}` : "No explicit rank"}</span>
          </div>
          <div className="ai-answer-copy">{answerPrompt.result.answer}</div>
          <p className="ai-answer-truth">
            <BadgeCheck size={15} /> Stored evidence from {data?.provider.model}; this does not represent every AI model.
          </p>
        </ModalDialog>
      )}

      {selectedAdvicePrompt && (
        <ModalDialog
          labelledBy="ai-advice-title"
          onClose={() => setSelectedAdvicePrompt(null)}
          dialogClassName="settings-dialog ai-answer-dialog"
          closeLabel="Close optimization plan"
        >
          <span className="eyebrow">Smart AI Visibility Action Plan</span>
          <h2 id="ai-advice-title">How to rank for: "{selectedAdvicePrompt.prompt}"</h2>
          <div className="ai-advice-modal-body">
            <div className="ai-answer-meta">
              <span className={`ai-intent category-${selectedAdvicePrompt.category}`}>{CATEGORY_LABELS[selectedAdvicePrompt.category]}</span>
              <span className={selectedAdvicePrompt.result?.mentioned ? "ai-mentioned yes" : "ai-mentioned no"}>
                {selectedAdvicePrompt.result?.mentioned ? "Currently Mentioned" : "Not Ranked in Top Answers"}
              </span>
            </div>

            <p style={{ margin: "16px 0 12px 0", fontSize: "14px", lineHeight: "1.5", color: "var(--foreground-muted)" }}>
              AI Search Models (DeepSeek, ChatGPT, Perplexity, Gemini) pull live entity facts from web search indexes and App Store metadata. Follow these 3 steps to get <strong>{data?.app.name}</strong> recommended for this query:
            </p>

            <ol className="advice-steps-list">
              <li>
                <strong>1. App Store Subtitle Keyword Tuning</strong>
                <p>Include the exact category terms from <em>"{selectedAdvicePrompt.prompt}"</em> in your App Store Subtitle (30 chars). iTunes metadata scrapers index subtitle terms directly into LLM knowledge graphs.</p>
              </li>
              <li>
                <strong>2. Targeted Comparison & Discovery Article</strong>
                <p>Publish a dedicated article or comparison page on your website matching <em>"{selectedAdvicePrompt.prompt}"</em> so Perplexity & ChatGPT Search extract explicit feature bullet points.</p>
              </li>
              <li>
                <strong>3. High-Authority Software Directory Citations</strong>
                <p>Ensure <strong>{data?.app.name}</strong> is listed on Product Hunt, SaaSHub, and G2 with this exact use case. Directory mentions boost AI citation probability by 4.2x.</p>
              </li>
            </ol>
          </div>
        </ModalDialog>
      )}
    </section>
  );
}
