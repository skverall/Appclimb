# ADR 0008 — Agent access: a remote MCP server at /mcp

**Status:** Accepted (2026-11-03)

**Context**

Users increasingly hand keyword research to AI agents (ChatGPT, Claude,
Claude Code, Codex, Cursor) instead of signing in and clicking through the
explorer. AppClimb had no machine interface: the explorer's difficulty and
rank checks run in the browser, because Apple's iTunes Search API rejects
Cloudflare Worker IPs, and the assistant's tools only work inside our own
chat.

**Decision**

- `POST /mcp` is a stateless, dual-era MCP server (`src/lib/mcp-server.ts`).
  Modern clients (revision 2026-07-28: per-request `_meta`, mirrored into
  `MCP-Protocol-Version` / `Mcp-Method` / `Mcp-Name` headers, `server/discover`)
  and legacy clients (2025-03-26 … 2025-11-25 `initialize` handshake) share
  the endpoint. No sessions, no SSE, one JSON response per POST; GET/DELETE
  answer 405 (a browser GET with `Accept: text/html` goes to `/connect`).
- Ten read-only tools (`src/lib/agent-tools.ts`), all annotated
  `readOnlyHint: true`: `analyze_keywords` (Apple popularity + difficulty with
  evidence + verdict + top apps + optional app rank), `get_keyword_popularity`,
  `find_related_keywords`, `autocomplete_keywords`, `get_trending_keywords`,
  `search_apps`, `get_app_keyword_ideas`, `check_app_rankings`,
  `build_keyword_field`, `get_account`. The Apple-data tools reuse the
  assistant's store code (ADR 0006); the scoring reuses `aso.ts`, so agents
  and the explorer give the same numbers and the same honesty labels.
- Live App Store searches go through `ops/itunes-proxy` on the Hostinger VPS
  (`ITUNES_PROXY_URL` / `ITUNES_PROXY_SECRET` Worker secrets). It forwards
  only `/search` and `/lookup`, trims results, caches 6 h, and paces calls to
  Apple's ~20/min. The browser explorer still calls Apple directly.
- Auth is our own OAuth 2.1 authorization server in the same Worker
  (`src/lib/agent-auth.ts`, migration 0007): RFC 9728 protected-resource
  metadata (root and `/mcp`-suffixed), RFC 8414 server metadata, Client ID
  Metadata Documents and Dynamic Client Registration, public clients only
  (`token_endpoint_auth_method: none`), PKCE S256, `resource` bound to
  `https://appclimb.app/mcp`, `iss` on every authorization response, 1-hour
  access tokens, 90-day rotating refresh tokens (reuse revokes the client's
  grant). Consent happens on `/oauth/consent`, which signs the user in with the
  existing Google / magic-link flow. Headless agents can use personal API
  keys created on `/connect`. Only SHA-256 hashes of codes and tokens are
  stored.
- App-directory reviewers (Claude, ChatGPT) must sign in with a password and
  no email link, so one reviewer account can sign in with a password on
  `/oauth/consent` (`src/lib/review-login.ts`). It exists only while the
  `REVIEW_LOGIN_EMAIL` / `REVIEW_LOGIN_PASSWORD_HASH` secrets are set, is Pro
  while configured, and is never email-verified (no weekly email).
- Quotas: an App Store check (one keyword analyzed or rank-checked, or one
  app read) draws on a durable per-user daily counter (`agent_usage`):
  the plan's explorer allowance (30/day free) and a 1,000/day fair-use cap on
  Pro. Apple-data lookups are free. Failed checks are refunded.

**Consequences**

- Agents need a free account; this is not a login wall on the site's search.
- The VPS proxy is a new runtime dependency for agent checks only. If it is
  down, the App Store tools return a clear tool error and the Apple-data
  tools keep working.
- One proxy IP serves all agents: heavy simultaneous use can hit Apple's rate
  limit; tools then report which keywords were not checked and refund them.
