# ADR 0002 — Pivot to a free App Store keyword tool

**Status:** Accepted (2026-08-02)

**Context**

The previous product, Growth CI, connected RevenueCat and PostHog, evaluated
iOS releases, and closed agent tasks from production evidence. It required
accounts, billing, connectors, a Hono API worker, and D1 persistence. The
founder decided the connectors, billing, and workspace product were unnecessary
and requested a simple public tool resembling an AppTweak-style keyword
explorer: keyword popularity, difficulty, and trend charts.

**Decision**

- Remove the entire Growth CI product surface and its backend: connectors,
  auth, Paddle billing, the `cloudflare/api` Hono worker, D1, queues, cron,
  R2, and Email bindings.
- Ship a single free, account-less App Store keyword explorer:
  - queries Apple's public iTunes Search API directly from the browser
    (Apple blocks Cloudflare Worker IPs);
  - estimates popularity and difficulty (0–100) from public signals
    (competition pressure, top-result ratings, mega-brand presence);
  - stores one daily snapshot per keyword per country in `localStorage` with
    an estimated, flagged backfill for the 30-day trend;
  - labels every score as an estimate and never claims Apple Search Ads volume.
- Keep the marketing pages (blog, about, pricing) with copy rewritten for the
  ASO positioning. Keep frozen rollback artifacts (`worker/` Go, `deploy/`,
  `compose.yml`) untouched.
- Deployment is a single OpenNext web Worker; pushes to `main` deploy it.

**Consequences**

- Visitors get instant, verifiable keyword intelligence with zero friction and
  no privacy cost.
- Honest estimates replace "search volume" claims; the UI shows the evidence
  behind each score.
- The previous architecture remains recoverable from git history:
  `archive/pre-growth-ci-2026-07-28` and `archive/pre-aso-tool-2026-08-02`.

**Follow-ups**

- Broader storefront coverage and localized suggestions.
- Optional per-app keyword tracking via the App Store Connect API (requires an
  explicit founder decision; deliberately not an account system).
