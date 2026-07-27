# AppClimb Product Direction

**Status:** Canonical product north star

**Last updated:** July 28, 2026

**Owner:** AppClimb founder

**Audience:** Product, design, engineering, marketing, and every AI agent working
on this repository

> This document describes where AppClimb is going and what is actively shipped
> as **Growth CI**. It is the source of truth for product direction, not a claim
> that every loop has been production-verified with a real customer app.

Every new contributor or AI session must read this document before proposing a
feature, changing the interface, altering positioning, or making an architecture
decision. If current code, an old document, or a previous product version
conflicts with this direction, this document wins unless the founder explicitly
changes it.

---

## 1. What AppClimb is

AppClimb is **Growth CI for AI-built iOS subscription apps**.

### Plain-language promise

> **Your agents ship. AppClimb proves whether the release helped.**

### Complete product sentence

> AppClimb connects RevenueCat and PostHog, evaluates every iOS release, creates
> one evidence-backed growth task for the coding agent the developer already
> uses, and closes that task only when real production data confirms the fix.

### One-sentence customer answer

> **AppClimb tells me whether my latest release helped or hurt subscription
> growth, gives my coding agent one task, and verifies the result.**

Customers do not pay for an LLM, a chat UI, or a prettier RevenueCat dashboard.
They pay for a durable independent truth loop:

1. Reliable read-only data collection.
2. Correct source ownership and metric definitions.
3. Release-aware cohorts and data-maturity handling.
4. Statistical noise filtering and visible confidence.
5. One prioritized growth incident instead of alert spam.
6. A structured task contract any coding agent can execute.
7. Persistent state across fresh agent sessions and vendors.
8. Verification based on real user and subscription outcomes.
9. Per-app memory of what actually worked.
10. Hosted retries, scheduling, encryption, idempotency, audit, and recovery.

RevenueCat is the money ledger. PostHog is the behavior ledger. Hermes / Codex /
Grok / Claude are the hands. **AppClimb is the referee and the memory.**

---

## 2. Initial customer profile

Build only for:

- a solo developer or small team;
- one production iOS subscription app;
- RevenueCat installed;
- PostHog installed or willing to install it;
- an explicit activation event;
- enough new-user volume to evaluate a release;
- frequent releases, often produced with AI coding agents;
- no dedicated growth analyst.

Do not optimize for low-volume pre-launch apps. If an app cannot produce a
statistically usable cohort, show an honest **not enough evidence** state rather
than fabricating advice.

---

## 3. Core product loop

```text
RevenueCat + PostHog
        ↓
Release detected
        ↓
AppClimb waits for a mature cohort
        ↓
Deterministic release verdict
        ↓
One confirmed growth incident
        ↓
One agent-ready Growth Task
        ↓
Hermes / Codex / Grok / Claude prepares a change
        ↓
Founder reviews and ships
        ↓
AppClimb observes the fix release
        ↓
Resolved / Partial / No effect / Worse / Inconclusive
        ↓
Learning stored for this app
```

A task is not done when the agent says it is done, when tests pass, or when a
PR merges. It is done only when the verification contract is satisfied by
production evidence.

### Release verdicts

- `collecting` — data has not matured or minimum sample not reached
- `healthy` — no material confirmed regression
- `improvement` — primary metric improved materially with enough evidence
- `regression` — material, statistically supported decline
- `inconclusive` — collection deadline passed without enough evidence
- `configuration_required` — required event/version mapping missing or untrusted

### Growth incident

Only a confirmed regression creates a Growth Incident. One open incident per
app. Closed outcomes: `resolved`, `partial`, `no_effect`, `worsened`,
`dismissed`, `inconclusive`.

### Agent task

One incident creates at most one current Agent Task. Claims are atomic and may
expire. Claims are not proof.

---

## 4. Core sources and measurement

### Keep and deepen

- authentication and account lifecycle;
- Paddle billing and existing entitlements;
- encrypted RevenueCat and PostHog connections;
- Cloudflare Workers, D1, Queues, R2, Email, operational safeguards;
- metric point storage and source sync jobs;
- deterministic diagnosis utilities, confidence, own-baseline comparisons,
  evidence lineage, limitations;
- audit events, retries, stale-run recovery, idempotency, workspace isolation;
- App Store public URL lookup only for app identity, icon, name, bundle metadata.

### Measurement contract (Growth Contract)

Server-owned, versioned defaults define session event, activation event,
version/build properties, activation window, minimum sample, collection window,
and practical + statistical thresholds. Exportable as portable `appclimb.yml`
for agents; repository sync is not an MVP prerequisite.

### RevenueCat

Source of truth for trials, paid subscriptions, trial-to-paid, renewal/churn,
and revenue. Supporting signals for release evaluation. Unsegmented time series
are temporal association, not release causality.

### PostHog

Source of truth for session, activation, and version-aware new-user cohorts.
Version property discovery is deterministic and requires confirmation. Unconfirmed
mapping cannot produce a confirmed regression.

---

## 5. Explicit non-goals (this product version)

Do not build:

- Android;
- web SaaS as a customer platform;
- a generic analytics dashboard or data warehouse;
- arbitrary SQL exploration;
- industry benchmarks;
- ad attribution;
- App Store Connect report ingestion as activation requirement;
- automatic GitHub OAuth / repository scanning as a blocker;
- automatic PR merging or production deployment;
- a proprietary coding agent or mandatory model subscription;
- cross-customer recommendation training;
- user-level RevenueCat/PostHog joins without an approved identity contract;
- precise “lost revenue” estimates without a defensible model.

### Retired from the active customer product

These remain in git history / legacy tables where needed, but are not active
navigation, marketing, or scheduled customer work:

- Web SaaS platform selection and customer-facing first-party web analytics UI;
- Acquisition Atlas as a product surface;
- AI Visibility and provider scans;
- keyword rank tracking, Rank Terrain, ASO, competitor intelligence;
- Voice of Customer and Retention Heatmap as standalone surfaces;
- generic Growth Replay as a separate section;
- multi-app portfolio UI;
- separate Pulse / Diagnose / Lab / AI Visibility / Sources navigation;
- App Store Connect and Superwall in first-run onboarding;
- generic AI chat;
- promises of autonomous root-cause certainty or guaranteed revenue growth.

Do not destroy legacy data. Hide/deprecate, stop new legacy records, preserve
deletion/revocation paths for existing connections.

---

## 6. Pricing posture

- **Free:** one iOS app, RevenueCat + PostHog, first complete release verdict,
  one Growth Task export/copy, limited history, bounded manual refresh.
- **Pro:** keep founding price `$12.99/month` or `$129/year` — ongoing automatic
  monitoring, Agent Bridge, verification loop, 90-day history, digests.

Replace the product-level 14-day trial concept for **new** users with **first
release verdict free**. Existing paid entitlements and active subscriptions must
not be downgraded.

---

## 7. Product truth and verification levels

Always distinguish:

| Level | Meaning |
| --- | --- |
| Code complete | Implemented in this branch |
| Locally tested | Unit/integration/E2E run in this environment |
| Staging deployed | Deployed to staging with founder permission |
| Production verified | Real customer app completed the loop on production data |

Do not invent production verification. The launch gate requires a real app
connecting RevenueCat + PostHog, a real release verdict, a real agent task claim,
a fix release, and a verification outcome — with no credentials or raw user rows
in agent payloads.

### Core activation metric (AppClimb itself)

> A real release receives its first evidence-backed verdict.

### Core paid value

> A user completes at least one incident → agent task → fix release → verification
> loop.

Account creation and demo viewing are not product activation.

---

## 8. Rollout flags

Server-side controls (non-secret vars):

- `GROWTH_CI_ENABLED` — Growth CI product surfaces and release evaluation path
- `AGENT_BRIDGE_ENABLED` — Agent Bridge HTTP API
- `LEGACY_SURFACES_ENABLED` — temporary access to retired surfaces (default off)

Staging defaults Growth CI and Agent Bridge on. Production remains gated until
the founder completes the launch checklist.

---

## 9. Agent safety rules

- Never expose RevenueCat/PostHog credentials, raw customer identifiers, source
  rows, or secrets to an LLM or agent task.
- Agents may prepare a branch or PR; the founder remains the approval gate for
  merge, deploy, pricing/paywall, and third-party mutation.
- Agent Bridge tokens are hashed at rest, scoped, rate-limited, and auditable.
- Agent “done” claims never close an incident without production evidence.

---

## 10. Archive and recovery

Before the Growth CI pivot removals, repository state was frozen as:

- branch/tag: `archive/pre-growth-ci-2026-07-28`

Git history remains the recovery path for retired surfaces and data shapes.

---

## 11. Documentation map

- [README.md](./README.md) — repository, verification, deployment map
- [docs/growth-ci.md](./docs/growth-ci.md) — Growth CI loop, objects, API
- [docs/adr/0001-growth-ci-pivot.md](./docs/adr/0001-growth-ci-pivot.md) — pivot ADR
- [docs/acquisition-atlas.md](./docs/acquisition-atlas.md) — legacy Atlas notes
  (internal first-party collection only; not the customer product)
- [ops/README.md](./ops/README.md) — production operations
- [public/pricing.md](./public/pricing.md) — machine-readable pricing/status

---

## 12. Current delivery order

1. Product contract + rollout flags (this document).
2. Data model: releases, checks, incidents, agent tokens/tasks/events.
3. Version property readiness and confirmed mapping.
4. Version-aware cohorts and release registry.
5. Pure release-impact engine.
6. Queue, checks, one incident, one task.
7. Agent Bridge HTTP API + portable skill.
8. Verification loop and learning record.
9. Single-screen UI + iOS-only onboarding.
10. Free first verdict + marketing rewrite.
11. Legacy retirement and production hardening.

Do not expand into portfolio, Android, industry benchmarks, or autonomous
merge/deploy until the closed loop is production-verified once.
