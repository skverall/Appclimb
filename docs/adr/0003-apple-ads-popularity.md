# ADR 0003 — Official Apple Ads popularity via founder key

**Status:** Accepted (2026-08-16)

**Context**

Apple shipped Ads Platform API v1 (base `https://api.ads.apple.com/v1/`)
with a first-class Search Term Popularity report. Campaign Management API v5
sunsets 26 January 2027. The founder decided official relative popularity is
must-have for AppClimb.

`PRODUCT_DIRECTION.md` previously forbade any Apple Ads connector and any
server-side backend. Visitors must still need no account.

**Decision**

- Use **one founder-owned Apple Ads account** as a server-side Insights
  source. Visitors do not connect Ads, do not log in, and do not send
  credentials.
- Add `POST /api/popularity` on the existing OpenNext Worker (same pattern as
  `POST /api/chat`). Secrets stay in Worker env / `.env.local`.
- Popularity is Apple's `searchPopularity1to100` when the term appears in that
  country + genre week. Otherwise keep the existing iTunes estimate.
- Difficulty, top apps, observed position, and local history stay as they are.
- Never label official popularity as search volume. UI must show the source
  (`Apple Ads` vs `Est.`).
- Do not build campaign management, user-connected Ads, impression-share
  dashboards, or visitor accounts.

**Consequences**

- Zero-setup UX is preserved.
- The tool now depends on founder Ads credentials and Apple's weekly Insights
  coverage. Long-tail terms still fall back to the estimate.
- Redistributing Ads Insights through a public tool is a terms-of-use risk the
  founder accepted.
