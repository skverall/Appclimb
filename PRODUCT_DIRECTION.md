# AppClimb Product Direction

**Status:** Canonical product north star

**Last updated:** August 16, 2026

**Owner:** AppClimb founder

**Audience:** Product, design, engineering, marketing, and every AI agent working
on this repository

> This document describes what AppClimb is and what is actively shipped as the
> **App Store keyword explorer**. It is the source of truth for product
> direction, not a claim that the estimates are exact search volumes.

Every new contributor or AI session must read this document before proposing a
feature, changing the interface, altering positioning, or making an architecture
decision. If current code, an old document, or a previous product version
conflicts with this direction, this document wins unless the founder explicitly
changes it.

---

## 1. What AppClimb is

AppClimb is a **freemium App Store keyword tool**: a genuinely useful free
tier plus an optional Pro plan capped at $10/month. The lead feature is
official Apple Ads popularity — not a competitor model with no source.

### Plain-language promise

> **Popularity from Apple. Not a black box.**

### Complete product sentence

> AppClimb searches any App Store keyword and shows Apple's official Ads
> popularity (relative 1–100) when the term is in that storefront and genre,
> and estimates difficulty from public iTunes data. Everything works without
> an account, on generous daily limits, with all data staying in the visitor's
> browser. The optional Pro plan ($8/month, $64/year) lifts the limits,
> extends history to 90 days, and syncs the user's own keyword data between
> devices. No login wall, no tracking.

### One-sentence customer answer

> **I get Apple's official popularity score, labeled as such — not a mystery
> “search volume” from a paid ASO tool.**

Competitors sell unexplained volumes. AppClimb leads with the Apple Ads
source, labels every score (`Apple Ads` vs `Est.`), and still shows the
evidence behind difficulty (result count, top apps, ratings). Popularity is
never claimed as monthly search volume.

---

## 2. Customer profile

Anyone who ships an iOS app and cares about App Store search:

- a solo developer or small team with one or a few apps;
- a marketer or ASO freelancer working across client apps;
- a founder evaluating keywords before launch;
- a user who refuses to pay $100+/month for data they cannot verify.

The tool must remain usable with zero setup: open the site, type a keyword,
read the scores. Accounts are offered lazily — when a visitor hits a free-tier
limit or wants cloud sync — never as a gate in front of the core loop.

---

## 3. Core product loop

```text
Visitor types a keyword
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
Trend grows into real history over time
```

The loop works with no account. The only server hops are the Worker
popularity overlay, the optional ASO assistant, and — for signed-in users —
the account, entitlement, and sync endpoints added by ADR 0004.

### Scores

- **Popularity (1–100)** — Apple Ads official relative score
  (`searchPopularity1to100`) when Platform API v1 returns the term for that
  country + inferred genre. Otherwise the existing iTunes estimate
  (competition + top-result strength). Always labeled with its source. Not
  search volume.
- **Difficulty (0–100)** — estimated barrier: how many apps compete, how many
  ratings the incumbents hold, and whether mega-brands dominate the first page.
  Always an estimate.
- **Trend** — 30-day chart built from daily snapshots; the first check seeds an
  estimated baseline flagged `backfilled: true`.

Difficulty MUST stay labeled as an estimate. Popularity MUST say `Apple Ads`
or `Est.` — never unlabeled, never "search volume".

---

## 4. Explicit non-goals (this product version)

Do not build:

- login walls or any gate in front of the free core loop — sign-in stays
  lazy, offered only when a limit is hit or sync is requested;
- paid pricing above **$10/month** (founder cap, ADR 0004);
- visitor-facing connectors (App Store Connect, RevenueCat, PostHog, Superwall,
  or a user-connected Apple Ads account);
- queues, cron pipelines, or a separate API worker — server code stays in the
  single OpenNext Worker's route handlers;
- claims of real Apple Search Ads *volume* — official popularity is a relative
  1–100 score, not impression or query counts;
- synthetic data presented as real (demo values are only acceptable when
  clearly labeled, and there is currently no demo mode);
- user tracking, analytics cookies, advertising scripts, or fingerprinting of
  any kind — Paddle is the only third party, confined to the billing flow;
- server-side storage of anonymous or free-tier keyword history — it lives in
  localStorage; only signed-in users may sync their own data;
- team features or shared workspaces (one account = one workspace in v1);
- an API product or public data endpoints.

### Retired from the active product

The previous Growth CI product (release verdicts, agent tasks, connectors,
billing) and the River Atlas / Acquisition Atlas prototypes are removed from
the active product. Git history is the recovery path:

- branch/tag: `archive/pre-growth-ci-2026-07-28`
- branch/tag: `archive/pre-aso-tool-2026-08-02`

---

## 5. Plans, billing, and accounts (ADR 0004)

AppClimb is freemium. The free tier is a real product, not a demo; Pro is a
convenience upgrade under the founder's $10/month cap.

| | Free ($0) | Pro ($8/month, $64/year) |
| --- | --- | --- |
| Keyword Explorer checks | 8 per day | unlimited |
| AI assistant messages | 5 per day | 200 per day |
| Official popularity lookups | 30 per day | 500 per day |
| My Apps | 1 app, 25 keywords | unlimited |
| History and charts | 30 days | 90 days |
| Data location | browser localStorage only | cloud sync across devices |

Rules:

- **Zero-setup first.** The first screen is the tool. Accounts (Google OAuth
  or email magic link) are offered lazily and never block the free loop.
- **Local-first privacy.** Anonymous and free users keep 100% of keyword data
  in localStorage. Cloud sync stores only a signed-in user's own data in our
  D1 database (`sync_blobs`), last-write-wins by revision.
- **Paddle is the merchant of record.** Checkout uses the Paddle.js overlay;
  a signed webhook maintains subscription state. Cancelling keeps Pro active
  until the period ends, then limits revert to Free and synced data stays
  available to the account.
- **Minimal account data.** Email, display name, Google subject id, session
  hashes, subscription state. Nothing else; no marketing tracking.
- **Honest copy.** Every marketing page must state the free limits truthfully
  ("8 checks/day free", not "unlimited") and keep all data-honesty labels.

---

## 6. Data truth and verification levels

Always distinguish:

| Level | Meaning |
| --- | --- |
| Code complete | Implemented in this branch |
| Locally tested | Unit/integration/E2E run in this environment |
| Staging deployed | Deployed to staging with founder permission |
| Production verified | Deployed to `appclimb.app` and checked with founder approval |

Do not invent production verification. Live-data claims about the deployed site
must be verified against the deployed site, not just unit tests: the estimation
logic runs in the browser and depends on Apple's public API behavior.

### Data honesty rules

- Popularity is official Apple Ads (relative 1–100) or an estimate, and MUST
  be visibly labeled as such. Difficulty is always an estimate.
- The UI shows the evidence behind every score (result count, saturation, top
  apps, ratings) — no black-box numbers.
- Trend charts that include estimated backfill MUST say so.
- Never claim "search volume", "downloads", or other Apple-private counts.

---

## 7. Rollout and deployment

- Single web Worker (`appclimb-web`) via OpenNext; production at
  `https://appclimb.app`. Account/entitlement/sync/billing route handlers run
  in the same Worker; a D1 database (`appclimb-db`) backs them.
- Pushes to `main` deploy production automatically after typecheck/build. D1
  migrations are applied in the deploy pipeline before the Worker is swapped.
- A `NEXT_PUBLIC_PRO_ENABLED` flag gates billing UI so phases can ship
  incrementally; the staging Worker (`appclimb-web-staging`) has its own D1
  database.

---

## 8. Agent safety rules

- Never introduce code that collects, stores, or transmits the keyword data of
  anonymous or free-tier visitors to a server; only a signed-in user's own
  sync data and minimal account records may live in D1 (ADR 0004).
- Never place an account or payment wall in front of the free core loop.
- Never relabel estimates as real metrics, and never remove the "estimated"
  labeling from the UI.
- Never raise Pro pricing above the $10/month founder cap.
- Agents may prepare changes; the founder remains the approval gate for push,
  deploy, and any marketing copy changes.

---

## 9. Documentation map

- [README.md](./README.md) — repository, verification, deployment map
- [docs/adr/0002-aso-tool-pivot.md](./docs/adr/0002-aso-tool-pivot.md) — pivot ADR
- [docs/adr/0003-apple-ads-popularity.md](./docs/adr/0003-apple-ads-popularity.md) — official popularity
- [docs/adr/0004-monetization-accounts-billing.md](./docs/adr/0004-monetization-accounts-billing.md) — accounts, Paddle billing, Pro plan
- [ops/README.md](./ops/README.md) — production operations

---

## 10. Current delivery order

1. Keyword explorer UI + iTunes estimation (shipped).
2. LocalStorage history + estimated trend baseline (shipped).
3. Marketing rewrite for the ASO positioning (shipped).
4. Official Apple Ads popularity via founder-owned Platform API v1 (ADR 0003,
   shipped). Suggestions / impression share are out of scope until asked.
5. Monetization (ADR 0004, in progress): optional accounts (Google OAuth +
   email magic link), Paddle billing with the Free/Pro plans above, Pro
   limits and cloud sync, and an onboarding flow.
6. Broader storefront coverage and localized suggestions.

User-connected Ads, team workspaces, and web analytics remain out of scope;
reintroducing any of them needs a new founder decision and ADR.
