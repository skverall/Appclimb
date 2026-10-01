# ADR 0006 — An assistant grounded in Apple's data

**Status:** Accepted (2026-10-01)

**Context**

The ASO assistant sent one request to DeepSeek with the tracked app's
keywords in the system prompt and waited for the whole answer. It had no
way to look anything up, so "find keyword ideas" produced generic advice and
any popularity number outside the tracked list was the model's guess. The
daily message cap lived in each Worker isolate's memory, so a free user's
5/day reset whenever a request hit a fresh isolate. Answers arrived after
10–30 s of a spinner.

**Decision**

- `POST /api/chat` runs a tool loop (OpenAI-style function calling, which
  DeepSeek supports). Four server-side tools read the same D1 search-term
  store as the explorer (ADR 0005): `lookup_keywords` (exact terms, with
  4/12-week change; unpublished terms come back as long tail ≤ the category
  floor), `related_keywords`, `autocomplete_terms`, `trending_keywords`.
  At most three tool rounds; the last round keeps the tools declared with
  `tool_choice: "none"` so the model must answer (dropping `tools` makes it
  print raw tool syntax). An empty answer gets one retry with a bigger
  token budget.
- With `stream: true` the route answers with NDJSON events (`meta`,
  `status`, `reset`, `delta`, `card`, `done`, `error`); without it, the same
  loop returns one JSON body. Every tool result also yields a data card the
  chat renders under the answer, so the numbers the user sees come from
  Apple, not from the model's prose.
- The prompt states AppClimb's verdict thresholds, App Store field limits,
  and output conventions: bold lowercase keywords become explorer links,
  ` ```title ` / ` ```subtitle ` / ` ```keywords ` blocks become cards with
  a live character count and waste checks, and a trailing ` ```followups `
  block becomes one-click next questions.
- Daily usage is durable: `ai_usage (subject, day)` in D1, charged with one
  atomic upsert before the model runs and refunded if no answer arrives.
  The in-isolate bucket remains only as a burst guard.
  `GET /api/chat/usage` reports today's allowance.
- Difficulty and rank still need iTunes search, which Apple blocks from
  Worker IPs, so the assistant never computes difficulty for new terms; it
  points the user at the explorer instead.

**Consequences**

- A reply can cost up to four model calls; flash-model pricing keeps that
  well inside the free tier's budget, and quotas are now real.
- Chats stay in the browser (localStorage), including their data cards.
