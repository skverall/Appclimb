# AppClimb Product Direction

**Status:** Canonical product north star

**Last updated:** August 2, 2026

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

> AppClimb searches any App Store keyword, estimates its popularity and
> difficulty on a 0–100 scale from public iTunes data, and tracks a 30-day
> trend locally in the visitor's browser. No account, no billing, no tracking.

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
Browser queries public iTunes Search API
        ↓
Estimates computed from competition + top-result strength
        ↓
Row added: popularity / difficulty / trend / results
        ↓
Daily snapshot recorded in localStorage
        ↓
Trend grows into real history over time
```

There is no server in this loop. The tool is the site.

### Estimates

- **Popularity (0–100)** — estimated demand: competition pressure and
  top-result strength suggest how actively a term is searched. Not search
  volume.
- **Difficulty (0–100)** — estimated barrier: how many apps compete, how many
  ratings the incumbents hold, and whether mega-brands dominate the first page.
- **Trend** — 30-day chart built from daily snapshots; the first check seeds an
  estimated baseline flagged `backfilled: true`.

Both estimates are deterministic, derived from public signals, and MUST be
labeled as estimates in the UI.

---

## 4. Explicit non-goals (this product version)

Do not build:

- accounts, authentication, workspaces, or team features;
- billing or paid tiers — the tool is free, full stop;
- any third-party connector (App Store Connect, RevenueCat, PostHog, Superwall,
  Apple Ads, or others);
- a server-side backend, database, queues, or cron;
- claims of real Apple Search Ads volume — it is Apple's private data;
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

- Popularity and difficulty are estimates and MUST be visibly labeled.
- The UI shows the evidence behind every score (result count, saturation, top
  apps, ratings) — no black-box numbers.
- Trend charts that include estimated backfill MUST say so.
- Never claim "search volume", "downloads", or other Apple-private metrics.

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
- [ops/README.md](./ops/README.md) — production operations

---

## 9. Current delivery order

1. Keyword explorer UI + iTunes estimation (shipped).
2. LocalStorage history + estimated trend baseline (shipped).
3. Marketing rewrite for the ASO positioning (shipped).
4. Broader storefront coverage and localized suggestions.
5. Optional: per-app keyword tracking against App Store Connect API (requires
   founder decision; not an account system).

Do not expand into accounts, billing, connectors, or web analytics until the
founder explicitly reverses this direction.
