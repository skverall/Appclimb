# AppClimb Product Direction

**Status:** Canonical product north star

**Last updated:** August 17, 2026

**Owner:** AppClimb founder

**Audience:** Product, design, engineering, marketing, and every AI agent working
on this repository

> This document describes what AppClimb is and what is actively shipped as the
> **freemium App Store keyword explorer**. It is the source of truth for product
> direction, not a claim that the estimates are exact search volumes.

Every new contributor or AI session must read this document before proposing a
feature, changing the interface, altering positioning, or making an architecture
decision. If current code, an old document, or a previous product version
conflicts with this direction, this document wins unless the founder explicitly
changes it.

---

## 1. What AppClimb is

AppClimb is a **freemium App Store keyword tool**. The lead feature is official
Apple Ads popularity — not a competitor model with no source.

### Plain-language promise

> **Popularity from Apple. Not a black box.**

### Complete product sentence

> AppClimb searches any App Store keyword and shows Apple's official Ads
> popularity (relative 1–100) when the term is in that storefront and genre,
> estimates difficulty from public iTunes data, and tracks a 30-day trend.
> Guests can search immediately. A free account unlocks app tracking and the
> ASO assistant. Pro at $8/month ($64/year) lifts the limits and adds cloud
> sync.

### One-sentence customer answer

> **I get Apple's official popularity score, labeled as such — not a mystery
> “search volume” from a paid ASO tool.**

Competitors sell unexplained volumes. AppClimb leads with the Apple Ads
source, labels every score (`Apple Ads` vs `Est.`), and still shows the
evidence behind difficulty (result count, top apps, ratings). Popularity is
never claimed as monthly search volume.

---

## 2. Who may do what

The product has three visible states. They must stay obvious in the UI: a
**Guest** chip, a **Free** chip, or a **Pro** chip. Do not let a guest appear
to have a full workspace.

| Surface | Guest (not signed in) | Free account | Pro |
| --- | --- | --- | --- |
| Keyword Explorer | Open. 8 new checks / day | Same 8 / day | Unlimited |
| Official popularity overlay | 30 lookups / day (IP) | 30 / day (account) | 500 / day |
| Track an app (My Apps) | Locked — sign in | 1 app · 25 keywords | Unlimited |
| ASO assistant | Locked — sign in | 5 messages / day | 200 / day |
| History | Local, 30 days | Local, 30 days | Cloud + 90 days |
| Cloud sync | No | No | Yes |

### Rules that must stay true

1. **No login wall on Keyword Explorer.** Open the site, type a keyword, read
   the scores. That is the lead magnet and the product promise.
2. **Tracking and the assistant require a free account.** The Add App button,
   sample-app bootstrap, and assistant composer appear only after sign-in
   (or they open the sign-in dialog with a reason). Guests must not be able
   to add apps or send chat messages.
3. **Sign-in is free and passwordless** (Google or email magic link). It is
   not a paywall. The paywall is Pro, after an account exists.
4. **Pro is optional** at $8/month or $64/year. It never exceeds the $10/month
   founder cap. Checkout requires a signed-in user.
5. **Anonymous keyword data never leaves the browser.** Only a signed-in Pro
   user's own explorer/tracker blobs may be synced to D1.
6. When accounts are not configured (`GET /api/me` → `configured:false` and
   `NEXT_PUBLIC_PRO_ENABLED` is off), the tool keeps the pre-monetization
   shape so local/CI environments stay usable without D1.

Copy that implies “use the whole product without an account” is wrong. Copy
that implies “you must sign in to search” is also wrong.

---

## 3. Customer profile

Anyone who ships an iOS app and cares about App Store search:

- a solo developer or small team with one or a few apps;
- a marketer or ASO freelancer working across client apps;
- a founder evaluating keywords before launch;
- a user who refuses to pay $100+/month for data they cannot verify.

First value is still zero-setup search. The account exists so tracking,
assistant limits, and later Pro sync have an identity.

---

## 4. Core product loop

```text
Visitor types a keyword (no account)
        ↓
Browser queries public iTunes Search API (difficulty, top apps, position)
        ↓
Browser asks POST /api/popularity (founder-owned Apple Ads Insights)
        ↓
Official searchPopularity1to100 when Apple has the term; else iTunes estimate
        ↓
Row added: popularity / difficulty / trend / results
        ↓
Daily snapshot recorded in localStorage
        ↓
Optional: visitor signs in free → tracks one app + uses the assistant
        ↓
Optional: visitor upgrades to Pro → limits lift, cloud sync on
```

### Scores

- **Popularity (1–100)** — Apple Ads official relative score
  (`searchPopularity1to100`) when Platform API v1 returns the term for that
  country + inferred genre. Otherwise the existing iTunes estimate
  (competition + top-result strength). Always labeled with its source. Not
  search volume.
- **Difficulty (0–100)** — estimated barrier: how many apps compete, how many
  ratings the incumbents hold, and whether mega-brands dominate the first page.
  Always an estimate.
- **Trend** — 30-day chart (90 on Pro) built from daily snapshots; the first
  check seeds an estimated baseline flagged `backfilled: true`.

Difficulty MUST stay labeled as an estimate. Popularity MUST say `Apple Ads`
or `Est.` — never unlabeled, never "search volume".

---

## 5. Plans and pricing

| | Guest | Free | Pro |
| --- | --- | --- | --- |
| Price | $0 | $0 | $8/month or $64/year |
| Account | No | Yes (Google or magic link) | Yes + Paddle |
| Explorer checks / day | 8 | 8 | Unlimited |
| Tracked apps | — | 1 | Unlimited |
| Keywords / app | — | 25 | Unlimited |
| Assistant / day | — | 5 | 200 |
| Popularity lookups / day | 30 | 30 | 500 |
| History | 30 days, local | 30 days, local | 90 days, synced |
| Cloud sync | No | No | Yes |

Paddle is the merchant of record. AppClimb never stores card details. A
canceled Pro subscription stays entitled until `current_period_end`.

Do not invent a third paid tier, per-seat pricing, or a monthly price above
$10.

---

## 6. Architecture (what is actually running)

- Single Next.js app deployed as a Cloudflare Worker (OpenNext) at
  `https://appclimb.app`.
- Browser → public iTunes Search API for difficulty and catalog (Apple allows
  CORS `*` but blocks Worker IPs).
- Worker routes: `POST /api/popularity`, `POST /api/chat`, auth
  (`/api/auth/*`), `GET /api/me`, `GET|PUT /api/sync`, Paddle webhook + portal.
- D1: `appclimb-db` (production), `appclimb-db-staging` (staging).
- No queues. No cron. No separate Go/Docker backend in the live path.
- `worker/`, `deploy/`, and `compose.yml` are frozen rollback artifacts from
  earlier architectures. Never treat them as the current backend.

A push to `main` builds the OpenNext Worker, applies D1 migrations, and
deploys `appclimb-web`. There is no feature-flag matrix beyond
`PRO_ENABLED` / `NEXT_PUBLIC_PRO_ENABLED` (server quotas vs client limits).
Accounts also become a live UI surface when `/api/me` reports
`configured: true`.

---

## 7. Explicit non-goals

Do not build:

- a login wall on Keyword Explorer;
- workspaces, teams, seats, or roles;
- visitor-facing connectors (App Store Connect, RevenueCat, PostHog,
  Superwall, or a user-connected Apple Ads account);
- a separate backend, database product, queues, or cron;
- claims of real Apple Search Ads *volume* — official popularity is a
  relative 1–100 score, not impression or query counts;
- synthetic data presented as real (demo values are only acceptable when
  clearly labeled);
- third-party analytics cookies or fingerprinting;
- server-side storage of *guest* keyword history;
- an API product or public data endpoints;
- pricing above $10/month.

### Retired from the active product

The previous Growth CI product (release verdicts, agent tasks, connectors,
billing) and the River Atlas / Acquisition Atlas prototypes are removed from
the active product. Git history is the recovery path:

- branch/tag: `archive/pre-growth-ci-2026-07-28`
- branch/tag: `archive/pre-aso-tool-2026-08-02`

The August 2026 “no accounts, no billing” wording in earlier revisions of
this file is retired. Accounts, Paddle, and Pro sync shipped as ADR 0004
and are the current product.

---

## 8. Data truth and verification levels

Always distinguish:

| Level | Meaning |
| --- | --- |
| Code complete | Implemented in this branch |
| Locally tested | Unit/integration/E2E run in this environment |
| Staging deployed | Deployed to staging with founder permission |
| Production verified | Deployed to `appclimb.app` and checked with founder approval |

Do not invent production verification. Live-data claims about the deployed
site must be verified against the deployed site, not just unit tests: the
estimation logic runs in the browser and depends on Apple's public API
behavior.

### Data honesty rules

- Popularity is official Apple Ads (relative 1–100) or an estimate, and MUST
  be visibly labeled as such. Difficulty is always an estimate.
- The UI shows the evidence behind every score (result count, saturation, top
  apps, ratings) — no black-box numbers.
- Trend charts that include estimated backfill MUST say so.
- Never claim "search volume", "downloads", or other Apple-private counts.

---

## 9. Agent safety rules

- Never send guest keyword data to a server. Pro sync is only the signed-in
  subscriber's own blobs.
- Never relabel estimates as real metrics, and never remove the "estimated"
  labeling from the UI.
- Never reintroduce a login wall on search, team features, user-connected
  connectors, or pricing above $10/month.
- Agents may prepare changes; the founder remains the approval gate for push
  when the founder has not already asked to ship.

---

## 10. Documentation map

- [README.md](./README.md) — repository, verification, deployment, monetization
- [docs/adr/0002-aso-tool-pivot.md](./docs/adr/0002-aso-tool-pivot.md) — pivot ADR
- [docs/adr/0003-apple-ads-popularity.md](./docs/adr/0003-apple-ads-popularity.md) — official popularity
- [ops/README.md](./ops/README.md) — production operations
- [src/lib/access.ts](./src/lib/access.ts) — guest / free / Pro gates

---

## 11. Current delivery order

1. Keyword explorer UI + iTunes estimation (shipped).
2. LocalStorage history + estimated trend baseline (shipped).
3. Marketing rewrite for the ASO positioning (shipped).
4. Official Apple Ads popularity via founder-owned Platform API v1 (shipped).
5. Optional accounts, Free vs Pro limits, Paddle, cloud sync (shipped).
6. Obvious guest vs signed-in vs Pro access (this revision).
7. Broader storefront coverage and localized suggestions.

Do not expand into user-connected Ads, team workspaces, or third-party
analytics unless the founder explicitly reverses this direction.
