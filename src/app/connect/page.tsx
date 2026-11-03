import type { Metadata } from "next";
import Link from "next/link";
import { Bot, KeyRound, Search, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";

import { AgentAccessPanel, CopyButton } from "@/components/agent-access-panel";
import { JsonLd } from "@/components/json-ld";
import { MarketingShell } from "@/components/marketing-shell";
import { AGENT_PRO_DAILY_CHECKS } from "@/lib/agent-usage";
import { PLAN_LIMITS } from "@/lib/plan";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Connect AppClimb to ChatGPT, Claude, Codex and Cursor (MCP)",
  description:
    "Give your AI agent AppClimb's App Store keyword data over MCP: Apple's official popularity, difficulty with evidence, verdicts, rankings and the 100-character keyword field. One URL, sign in once.",
  alternates: { canonical: "/connect" },
  openGraph: {
    title: "AppClimb MCP server for AI agents",
    description:
      "Connect ChatGPT, Claude, Claude Code, Codex or Cursor to AppClimb and let your agent research App Store keywords.",
    url: "/connect",
  },
};

const MCP_URL = absoluteUrl("/mcp");

interface ClientGuide {
  id: string;
  name: string;
  steps: React.ReactNode[];
  code?: string;
}

const CLIENTS: ClientGuide[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    steps: [
      <>
        Open <b>chatgpt.com/plugins</b>, press <b>+</b> and choose <b>Add custom MCP server</b>.
      </>,
      <>
        Name it <b>AppClimb</b>, paste the server URL, choose <b>OAuth</b>, confirm, and pick <b>Create as a plugin</b>.
      </>,
      <>
        Sign in to AppClimb in the window that opens and choose Allow. In a chat, type <b>@AppClimb</b>. Custom MCP
        servers are available on ChatGPT Pro, Business and Enterprise.
      </>,
    ],
  },
  {
    id: "claude",
    name: "Claude (web & desktop)",
    steps: [
      <>
        Open <b>Customize → Connectors</b> and choose <b>Add custom connector</b> (on Team and Enterprise, an owner
        adds it under Organization settings first).
      </>,
      <>
        Paste the server URL, choose <b>Add</b>, then <b>Connect</b>.
      </>,
      <>Sign in to AppClimb and choose Allow. Turn AppClimb on from the tools menu in a chat.</>,
    ],
  },
  {
    id: "claude-code",
    name: "Claude Code",
    code: `claude mcp add --transport http appclimb ${MCP_URL}`,
    steps: [
      <>Run the command below in your terminal.</>,
      <>
        In Claude Code, run <code>/mcp</code>, pick <b>appclimb</b> and choose <b>Authenticate</b> (or run{" "}
        <code>claude mcp login appclimb</code>). Your browser opens AppClimb; sign in and choose Allow.
      </>,
    ],
  },
  {
    id: "codex",
    name: "Codex",
    code: `codex mcp add appclimb --url ${MCP_URL}\ncodex mcp login appclimb`,
    steps: [
      <>Run the two commands below. The second opens AppClimb in your browser; sign in and choose Allow.</>,
      <>
        In the Codex IDE extension: gear menu → <b>MCP servers</b> → <b>Add server</b> → <b>Streamable HTTP</b>, paste
        the URL, restart the extension and choose <b>Authenticate</b>.
      </>,
    ],
  },
  {
    id: "cursor",
    name: "Cursor",
    code: `{\n  "mcpServers": {\n    "appclimb": { "url": "${MCP_URL}" }\n  }\n}`,
    steps: [
      <>
        Add this to <code>~/.cursor/mcp.json</code> (or <b>Settings → MCP → Add new server</b>).
      </>,
      <>
        Cursor shows AppClimb as <b>Needs login</b>. Click it, sign in to AppClimb and choose Allow.
      </>,
    ],
  },
  {
    id: "api-key",
    name: "Headless agents (API key)",
    code: `Authorization: Bearer <your AppClimb API key>`,
    steps: [
      <>
        For agents that can’t open a browser — CI, cloud agents, scripts — create an API key below and send it as a
        header to <code>{MCP_URL}</code>.
      </>,
      <>
        Claude Code: <code>claude mcp add --transport http appclimb {MCP_URL} --header &quot;Authorization: Bearer $APPCLIMB_API_KEY&quot;</code>.
        Codex: add <code>bearer_token_env_var = &quot;APPCLIMB_API_KEY&quot;</code> under <code>[mcp_servers.appclimb]</code>.
      </>,
    ],
  },
];

const TOOLS = [
  {
    icon: Search,
    name: "analyze_keywords",
    text: "Apple's popularity, an explained difficulty, a verdict and the apps ranking now — plus your app's rank.",
  },
  {
    icon: Sparkles,
    name: "get_app_keyword_ideas",
    text: "Reads your App Store listing and proposes keywords, each with Apple popularity.",
  },
  {
    icon: TrendingUp,
    name: "find_related_keywords · get_trending_keywords · autocomplete_keywords",
    text: "Ideas backed by Apple's published searches: related terms, risers and prefixes.",
  },
  {
    icon: Bot,
    name: "check_app_rankings · search_apps",
    text: "Find any app and see where it ranks for up to 25 keywords.",
  },
  {
    icon: KeyRound,
    name: "build_keyword_field · get_keyword_popularity · get_account",
    text: "Pack the 100-character keyword field, read Apple's weekly history, see your limits.",
  },
];

const PROMPTS = [
  "Find 10 App Store keywords my app “Habit Loop” can realistically rank for in the US, then write my 100-character keyword field.",
  "Which of these keywords are worth targeting: budget planner, expense tracker, money manager?",
  "Where does app 1438388363 rank for habit tracker, daily habits and routine planner?",
  "What's trending in Health & Fitness searches this month?",
];

export default function ConnectPage() {
  const free = PLAN_LIMITS.free;
  return (
    <MarketingShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Connect AppClimb to your AI agent",
          url: absoluteUrl("/connect"),
        }}
      />
      <main id="main-content" className="marketing-container connect">
        <header className="connect-hero">
          <p className="connect-eyebrow">MCP server</p>
          <h1>Let your AI agent do the keyword research</h1>
          <p>
            Connect AppClimb to ChatGPT, Claude, Claude Code, Codex or Cursor and ask in plain words. Your agent gets
            Apple’s official popularity, difficulty with its evidence, verdicts and live rankings — the same data as the
            explorer, without clicking through it.
          </p>
          <div className="connect-url">
            <span>Server URL</span>
            <code>{MCP_URL}</code>
            <CopyButton text={MCP_URL} />
          </div>
          <p className="connect-muted">
            You sign in once with your AppClimb account (free works). No API key to copy unless you want one.
          </p>
        </header>

        <section className="connect-section" aria-labelledby="connect-setup">
          <h2 id="connect-setup">Set it up</h2>
          <div className="connect-clients">
            {CLIENTS.map((client) => (
              <article key={client.id} id={client.id} className="connect-client">
                <h3>{client.name}</h3>
                <ol>
                  {client.steps.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
                {client.code && (
                  <div className="connect-code">
                    <pre>
                      <code>{client.code}</code>
                    </pre>
                    <CopyButton text={client.code} />
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="connect-section" aria-labelledby="connect-try">
          <h2 id="connect-try">Then just ask</h2>
          <ul className="connect-prompts">
            {PROMPTS.map((prompt) => (
              <li key={prompt}>“{prompt}”</li>
            ))}
          </ul>
        </section>

        <section className="connect-section" aria-labelledby="connect-tools">
          <h2 id="connect-tools">What your agent can use</h2>
          <ul className="connect-tools">
            {TOOLS.map((tool) => (
              <li key={tool.name}>
                <tool.icon size={18} aria-hidden="true" />
                <div>
                  <code>{tool.name}</code>
                  <span>{tool.text}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="connect-muted">
            Popularity is Apple’s relative 1–100 score from Apple Ads, never search volume. Terms below Apple’s top
            lists show only a ceiling. Difficulty is AppClimb’s estimate and always comes with its evidence.
          </p>
        </section>

        <section className="connect-section" aria-labelledby="connect-limits">
          <h2 id="connect-limits">Limits</h2>
          <p>
            Apple popularity, related, trending and autocomplete lookups are free. Live App Store checks (analyze,
            rankings, app ideas) count against a daily allowance: {free.explorerChecksPerDay} a day on the free plan,
            the same as the explorer. On <Link href="/pricing">Pro</Link>, agents get up to{" "}
            {AGENT_PRO_DAILY_CHECKS.toLocaleString("en-US")} checks a day and 52 weeks of Apple history.
          </p>
        </section>

        <section className="connect-section" aria-labelledby="connect-manage">
          <h2 id="connect-manage">
            <ShieldCheck size={20} aria-hidden="true" /> Your connections
          </h2>
          <AgentAccessPanel />
        </section>
      </main>
    </MarketingShell>
  );
}
