# ADR 0004 — Monetization: optional accounts, Paddle billing, Pro plan

**Status:** Accepted (2026-08-16, founder-directed pivot)

**Context**

AppClimb shipped as a free, account-less, fully client-side keyword tool
(ADR 0002). The founder decided to monetize it: a paid plan capped at
**$10/month**, Paddle as the payment provider, and a Cloudflare backend for
accounts, entitlements, and cloud sync. This explicitly reverses the
"no accounts, no billing, no backend" non-goals of the free-tool version;
`PRODUCT_DIRECTION.md` is updated in the same change to stay canonical.

The positioning that made the tool credible does not change: official Apple
Ads popularity labeled as such, difficulty labeled as an estimate, and no
invented "search volume" claims.

**Decision**

- **Plans.** Free + one paid plan, **Pro at $8/month or $64/year** (≈ $5.33/
  month). Nothing above $10/month. Free stays a real product: 8 keyword
  checks/day, AI assistant 5 messages/day, 30 official popularity lookups/day,
  1 tracked app with 25 keywords, 30-day history, all data local. Pro lifts
  the limits (unlimited checks, AI 200/day, popularity 500/day, unlimited
  apps/keywords), extends history to 90 days, and adds cloud sync.
- **Accounts are optional and lazy.** The first screen is the tool, never a
  login. Sign-in is offered when it becomes useful (hitting a limit, enabling
  sync). Methods: Google OAuth and email magic link.
- **Backend.** Same OpenNext Worker (`appclimb-web`), no separate API worker:
  new Next.js route handlers (`/api/auth/*`, `/api/me`, `/api/sync`,
  `/api/billing/webhook`) plus a **D1** database (`users`, `sessions`,
  `magic_links`, `subscriptions`, `sync_blobs`). Sessions are random tokens
  stored hashed in D1, delivered as an HttpOnly cookie. Staging gets its own
  D1 database (bindings are not inherited by named wrangler environments).
- **Billing.** Paddle Billing with the Paddle.js overlay checkout (CSP already
  allows Paddle domains) and a signed webhook that maintains subscription
  state server-side. Paddle is the merchant of record; refunds are handled per
  Paddle policy and documented on `/refunds`.
- **Data privacy boundary.** Anonymous visitors and free users keep 100% of
  their keyword data in localStorage, exactly as before. Only signed-in Pro
  users get their own data synced to D1 (`sync_blobs`, last-write-wins by
  revision). No analytics, tracking, or fingerprinting is introduced; Paddle
  is the only third party and only inside the billing flow.
- **Quota enforcement.** Server-side for `/api/chat` and `/api/popularity`
  (per user when signed in, per IP otherwise); client-side daily counters for
  the browser-only flows (Explorer checks), mirroring the existing
  `appclimb:ai:day` pattern.
- **Rollout.** Behind a `NEXT_PUBLIC_PRO_ENABLED` flag so phases can ship
  incrementally; the pricing/marketing copy changes land together with the
  final enablement.

**Consequences**

- The repo gains its first stateful backend: D1 migrations become part of CI
  and operations; backups/restore now matter (D1 export procedure in
  `ops/README.md`).
- Marketing and legal pages that claimed "free forever, no account" must be
  rewritten in the same change; the AI assistant system prompt is updated.
- Free users lose nothing they had; the explorer itself stays unlimited for
  browsing, and every score keeps its source label.
- Revenue risk stays bounded by the price cap; the honest-data positioning is
  the moat and is untouched by this ADR.
