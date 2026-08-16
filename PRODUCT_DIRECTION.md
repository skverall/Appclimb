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

AppClimb is a **free App Store keyword tool** built on public data.

### Plain-language promise

> **Find keywords worth ranking for — without paying for data you cannot verify.**

### Complete product sentence

> AppClimb searches any App Store keyword, shows official Apple Ads
> popularity (relative 1–100) when the term is in that storefront and genre,
> estimates difficulty from public iTunes data, and tracks a 30-day trend
> locally in the visitor's browser. No visitor account, no billing, no tracking.

### One-sentence customer answer

> **AppClimb tells me whether a keyword is worth chasing — and shows me the
> evidence behind the answer.**

Customers trust the tool because every number is labeled as an estimate and
comes with the underlying evidence (result count, top apps, ratings), instead
of a mysterious "search volume" with no source.

---

## 2. Customer profile

Anyone who ships an iOS app and cares about App Store search:

- a solo developer or small team with one or a few apps;
- a marketer or ASO freelancer working across client apps;
- a founder evaluating keywords before launch;
- a user who refuses to pay $100+/month for data they cannot verify.

The tool must remain usable with zero setup: open the site, type a keyword,
read the scores.

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

Visitors still have no account. The only server hop is the Worker popularity
overlay (and the optional ASO assistant).

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

- accounts, authentication, workspaces, or team features;
- billing or paid tiers — the tool is free, full stop;
- visitor-facing connectors (App Store Connect, RevenueCat, PostHog, Superwall,
  or a user-connected Apple Ads account);
- a separate backend, database, queues, or cron — Worker route handlers for
  `/api/chat` and `/api/popularity` are the only server code;
- claims of real Apple Search Ads *volume* — official popularity is a relative
  1–100 score, not impression or query counts;
- synthetic data presented as real (demo values are only acceptable when
  clearly labeled, and there is currently no demo mode);
- user tracking, analytics cookies, or fingerprinting of any kind;
- server-side storage of visitor keyword history — it lives in localStorage;
- an API product or public data endpoints.

### Retired from the active product

The previous Growth CI product (release verdicts, agent tasks, connectors,
billing) and the River Atlas / Acquisition Atlas prototypes are removed from
the active product. Git history is the recovery path:

- branch/tag: `archive/pre-growth-ci-2026-07-28`
- branch/tag: `archive/pre-aso-tool-2026-08-02`

---

## 5. Data truth and verification levels

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

## 6. Rollout and deployment

- Single web Worker (`appclimb-web`) via OpenNext; production at
  `https://appclimb.app`.
- Pushes to `main` deploy production automatically after typecheck/build.
- No feature flags, no backend environment, no rollout matrix — the product is
  one public page plus marketing.

---

## 7. Agent safety rules

- Never introduce code that collects, stores, or transmits visitor data to a
  server.
- Never relabel estimates as real metrics, and never remove the "estimated"
  labeling from the UI.
- Agents may prepare changes; the founder remains the approval gate for push,
  deploy, and any marketing copy changes.

---

## 8. Documentation map

- [README.md](./README.md) — repository, verification, deployment map
- [docs/adr/0002-aso-tool-pivot.md](./docs/adr/0002-aso-tool-pivot.md) — pivot ADR
- [docs/adr/0003-apple-ads-popularity.md](./docs/adr/0003-apple-ads-popularity.md) — official popularity
- [ops/README.md](./ops/README.md) — production operations

---

## 9. Current delivery order

1. Keyword explorer UI + iTunes estimation (shipped).
2. LocalStorage history + estimated trend baseline (shipped).
3. Marketing rewrite for the ASO positioning (shipped).
4. Broader storefront coverage and localized suggestions.
5. Official Apple Ads popularity via founder-owned Platform API v1 (this ADR
   0003). Suggestions / impression share are out of scope until asked.
6. Optional: per-app keyword tracking against App Store Connect API (requires
   founder decision; not an account system).

Do not expand into visitor accounts, billing, user-connected Ads, or web
analytics until the founder explicitly reverses this direction.
