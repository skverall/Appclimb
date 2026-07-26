# AppClimb Product Direction

**Status:** Canonical product north star

**Last updated:** July 26, 2026

**Owner:** AppClimb founder

**Audience:** Product, design, engineering, marketing, and every AI agent working
on this repository

> This document describes where AppClimb is going. It is the source of truth
> for product direction, not a claim that every described capability already
> exists.

Every new contributor or AI session must read this document before proposing a
feature, changing the interface, altering positioning, or making an
architecture decision. If current code, an old document, or a previous product
version conflicts with this direction, this document wins unless the founder
explicitly changes it.

---

## 1. The destination

AppClimb is becoming the **visual growth operating system for independent
builders**.

The long-term audience is millions of:

- solo developers;
- indie hackers;
- small product studios;
- bootstrapped mobile-app teams;
- SaaS and web-service founders;
- small teams that need answers but cannot hire separate analytics, ASO, SEO,
  monetization, and growth specialists.

These builders already have data, but it is fragmented across stores,
analytics, billing, paywalls, search tools, reviews, advertising platforms, and
spreadsheets. Their problem is not simply “no data.” Their problem is that the
data does not tell one coherent story:

- Where does growth stop?
- What changed?
- Is the problem acquisition, conversion, activation, monetization, or
  retention?
- Which keyword, market, competitor, release, price, screenshot, paywall, or
  product behavior explains the change?
- What is the next experiment worth running?
- Did the experiment actually improve the business?

AppClimb must turn scattered signals into a visual map of the business and a
clear next action.

### End-state promise

> **See where your product stops growing — understand why — and know what to
> test next.**

The wording may evolve, but the promise must keep all three parts:

1. See the system.
2. Diagnose the constraint.
3. Improve it through learning.

---

## 2. Product truth today

The current River Atlas website is a **high-fidelity interactive product
prototype and technical foundation**, not the completed AppClimb product.

Production-verified foundation:

- the River Atlas visual language and four-part navigation;
- an interactive, clearly labeled demo workspace;
- authentication, trial, pricing, Paddle checkout, and account deletion;
- the Cloudflare Workers/D1/Queues backend, encrypted source credentials,
  health checks, backups, and rollback support;
- connector scaffolding, recurring-sync foundations, and deterministic
  evidence and diagnosis contracts.

Implemented in the current repository:

- **Acquisition Atlas**, a second Pulse projection for the path from traffic
  source to engaged visitor to explicit conversion;
- first-party referral, UTM, landing-page, device, and anonymous journey
  collection;
- separate server-side AI crawler visibility for answer retrieval, search
  indexing, and model training;
- signed property tokens, hostname validation, duplicate protection,
  rate-limiting, forced workspace RLS, and no stored visitor IP address.

AppClimb's own `appclimb.app` property passed the live workspace gate on
2026-07-25. On 2026-07-26 its complete production dataset was reconciled into
Cloudflare D1, the Cloudflare collector accepted a new categorized crawler
event, and the isolated production account lifecycle passed against the
Cloudflare API. The public demo remains an explicitly labeled synthetic view;
authenticated workspace data and public demo data must not be confused.

Any other workspace is only **live** after the backend API is available, a web
property is created, its token is installed on the tracked domain, and a real
event is observed. User-agent crawler detection must not be described as
provider identity verification; provider IP-range verification is future work.

What must not be misrepresented as complete:

- most of the visible River Atlas data is still sample data;
- a connected source does not yet guarantee a complete real-world funnel;
- Apple report-segment ingestion is not complete;
- keyword rank collection, smart metadata suggestions, and Keyword Terrain are
  in development for normal workspaces; production code exists, but the first
  accepted real rank observation still needs release verification;
- automatic PostHog event mapping and Product Pulse charts are in development;
  they are not shipped until the bounded import is verified against a real
  connected project after deployment;
- competitor intelligence is not implemented;
- Voice of Customer clustering is not yet a complete ingestion and analysis
  system;
- AI explanations are not yet the final evidence-grounded intelligence layer;
- SaaS and general web-product support are future expansion stages.

Future sessions must clearly distinguish:

- **Shipped:** implemented and verified in production.
- **Prototype:** interactive, but powered partly or entirely by sample data.
- **In development:** code exists, but the full production workflow is not
  verified.
- **Roadmap:** intended direction, not implemented.

Visual polish must never be used as evidence that the underlying product
capability is finished.

### Current delivery order

Acquisition Atlas is a bounded acquisition primitive, not a pivot away from
the iOS wedge and not evidence that Stage 3 is complete. The delivery sequence
is:

1. finish one truthful iOS subscription journey and its source reliability;
2. use the production first-party acquisition stream and explicit account,
   checkout, and paid-activation goals to establish a trustworthy baseline;
3. connect website-to-app evidence only through a documented attribution and
   identity contract;
4. expand acquisition intelligence and SaaS journeys after the Stage 1 proof.

The next highest-leverage product gap remains a new workspace reaching its
first trusted, evidence-backed bottleneck from real source data.

---

## 3. The initial wedge and the wider market

### Initial wedge

AppClimb begins with independent developers and micro-teams running **iOS
subscription apps**.

This is the right starting point because:

- their growth journey has a clear sequence;
- App Store, product behavior, paywall, and subscription data are naturally
  fragmented;
- small teams feel the pain acutely;
- improvements can be measured through conversion, activation, trials,
  revenue, renewal, and churn;
- AppClimb can deliver value without becoming a generic business-intelligence
  tool.

The first complete product must work exceptionally well for one real iOS
subscription app before broadening into every platform.

### Expansion market

The product must be architected and described so the underlying model can later
support:

- Android apps;
- web SaaS;
- AI products;
- browser-based services;
- developer tools;
- subscription and usage-based businesses;
- products monetized through one-time purchases, advertising, or leads.

Expansion does not mean placing unrelated dashboards beside each other. The
same core model must survive:

**Acquisition → Consideration → Conversion → Activation → Monetization →
Retention → Expansion or Renewal**

For an iOS app, this currently appears as:

**Discover → Store → Install → Activate → Paywall → Trial → Paid → Renew**

For a SaaS product, the labels may become:

**Search/Referral → Landing → Signup → Activate → Upgrade → Paid → Retain →
Expand**

The stage labels can change by business model. The product logic cannot.

---

## 4. The core product loop

Every major feature must strengthen the same loop:

## Observe → Diagnose → Experiment → Learn

### Observe

Show the product as a connected system rather than a collection of unrelated
metrics.

The user should immediately see:

- volume moving through the growth journey;
- healthy and unhealthy stages;
- changes over time;
- confidence and data freshness;
- the effect of releases, pricing, metadata, campaigns, and experiments.

### Diagnose

Identify the earliest meaningful constraint supported by evidence.

AppClimb should answer:

- where the loss begins;
- why it matters;
- which sources support the conclusion;
- what changed before the problem appeared;
- whether the conclusion is observed, derived, or only a hypothesis;
- how confident the system is.

### Experiment

Turn the diagnosis into one focused learning step:

- hypothesis;
- proposed change;
- primary metric;
- guardrail metric;
- target segment;
- expected direction;
- duration or sample requirement;
- owner and status.

AppClimb begins read-only. It can prepare an experiment, but it must not
silently change metadata, ads, prices, paywalls, or external systems.

### Learn

Connect the outcome back to the visual system:

- what changed;
- what improved or regressed;
- whether the result was conclusive;
- how confidence changed;
- what the next constraint is.

The product is not complete if it only finds problems. It must build a memory
of actions and outcomes so the user gets smarter over time.

---

## 5. Visual-first is a product rule

AppClimb’s defining advantage is not simply that it has charts. The advantage
is that complex product data becomes understandable **visually before it
becomes textual**.

### The governing rule

> Use the least text necessary to make the visual accurate, understandable,
> and actionable.

### Visual grammar

AppClimb should use a consistent visual language:

- **Width** shows volume or magnitude.
- **Position** shows stage, sequence, or time.
- **Color** shows health, type, or state.
- **Shape** shows category or relationship.
- **Density** shows concentration.
- **Distance** shows similarity or separation.
- **Motion** shows change, causality, replay, or flow.
- **Annotations** show the minimum evidence needed to explain a visual.

The user should be able to understand the central insight in a few seconds,
then inspect the evidence progressively.

### River Atlas

River Atlas is the primary mental model:

- the river represents people, accounts, or revenue moving through the growth
  journey;
- river width represents volume;
- a narrowing represents loss;
- a coral constriction represents a confirmed problem;
- branches can represent channels, countries, plans, platforms, cohorts, or
  segments;
- the timeline explains what changed around the river;
- replay shows the product journey before and after meaningful events.

River Atlas is not a decorative chart. It must eventually be computed from real
normalized data and evidence.

### Supporting visual families

Future visualizations should feel like parts of one atlas, not unrelated chart
widgets:

- **Keyword Terrain:** positions, search volume, difficulty, intent, movement,
  and opportunity as a navigable landscape.
- **Competitor Constellation:** product similarity, keyword overlap, growth
  movement, pricing, positioning, and market distance.
- **Retention Heatmap:** cohort behavior and lifecycle decay.
- **Revenue Current:** trials, paid conversion, renewals, churn, MRR, and
  revenue movement.
- **Voice Clusters:** review and support themes sized by mentions and colored by
  sentiment or urgency.
- **Growth Replay:** releases, screenshots, metadata, prices, paywalls,
  campaigns, and experiments aligned with metric changes.
- **Experiment Map:** active hypotheses, confidence, dependencies, and results.

### Visual restraint

“More visual” does not mean “more decoration.”

Avoid:

- giant vanity scores;
- walls of KPI cards;
- chart grids with no narrative;
- arbitrary rainbow colors;
- decorative 3D;
- animation that does not explain change;
- large text reports;
- a chat window as the primary product;
- unsupported revenue forecasts;
- fake precision;
- red/coral used for ordinary UI decoration.

The interface should feel calm, premium, precise, and alive.

---

## 6. Information architecture

The primary navigation remains intentionally small:

### Pulse

The live visual state of the product:

- **Growth River:** the product journey from discovery through renewal;
- **Acquisition Atlas:** channels, referrers, campaigns, landing pages,
  anonymous journeys, and a separately counted crawler current;
- current bottleneck;
- data confidence;
- key changes;
- retention;
- Voice of Customer;
- Growth Replay.

Pulse answers: **What is happening now?**

### Diagnose

Evidence, comparisons, segments, change events, causal clues, and confidence.

Diagnose answers: **Why is this happening?**

### Lab

Hypotheses, experiment drafts, running tests, guardrails, and learned outcomes.

Lab answers: **What should we test, and what did we learn?**

### Sources

Connections, freshness, coverage, identity policy, data quality, and source
ownership.

Sources answers: **Can this conclusion be trusted?**

New top-level sections require strong justification. Prefer deeper visual
views inside this model over continually expanding navigation.

---

## 7. Data and evidence principles

### Named sources of truth

Each metric must have an explicit owner. For the initial iOS wedge:

- App Store Connect owns store discovery, engagement, downloads, sales, usage,
  and performance where available.
- RevenueCat owns subscription lifecycle, trials, paid conversion, renewals,
  churn, and subscription revenue.
- PostHog owns product behavior, activation, funnels, features, and retention.
- Superwall owns paywall exposure, variants, experiments, and paywall
  conversion.
- AppClimb’s rank monitor will own collected keyword-position history.
- AppClimb first-party web analytics owns web referrals, UTM attribution,
  landing-page journeys, explicit web conversions, and crawler requests.

Human visits and crawler requests are different evidence streams. They must
never be added together as visitors or conversions.

When sources disagree, AppClimb must show the discrepancy or apply a documented
precedence rule. It must not quietly blend incompatible values.

### Identity policy

User-level joins are allowed only when the customer explicitly confirms a
shared identifier across sources. Otherwise:

- use aggregates;
- align UTC time windows;
- compare cohorts;
- compare before/after periods;
- explain limitations.

AppClimb must never invent identity relationships.

### Insight classes

Every insight is one of:

- **Observed:** directly visible in the source data.
- **Derived:** calculated from aligned evidence and documented rules.
- **Hypothesis:** plausible, but not yet confirmed.

Every insight must carry:

- evidence IDs;
- source ownership;
- time window;
- sample or volume context;
- freshness;
- confidence;
- known limitations.

### AI’s role

AI is an intelligence layer behind the visuals, not the product’s main
interface.

AI may:

- summarize evidence;
- connect related changes;
- explain a visualization;
- generate a testable hypothesis;
- propose an experiment;
- identify missing data;
- translate complex findings into plain language.

AI must not:

- receive source credentials;
- receive unnecessary raw user rows;
- invent benchmarks;
- fabricate causality;
- present a hypothesis as an observation;
- produce precise revenue projections without a defensible model;
- replace the visual workspace with generic chat.

Deterministic calculations and evidence lineage come before AI explanation.

---

## 8. Data-source universe

The roadmap should expand by completing user journeys, not by collecting logos.

### Mobile-app growth

- App Store Connect
- Google Play Console
- RevenueCat
- Superwall
- Adapty
- PostHog
- Firebase Analytics
- Mixpanel
- Amplitude
- Apple Ads
- Google Ads
- Meta Ads
- App Store reviews
- keyword and category rankings

### SaaS and web growth

- AppClimb first-party web analytics
- Paddle
- Stripe
- RevenueCat Web
- PostHog
- Google Analytics
- Search Console
- Mixpanel
- Amplitude
- product databases or event warehouses through safe, bounded contracts
- support and feedback systems
- SEO keyword and ranking data
- landing-page and conversion experiments

### Competitor intelligence

Competitor intelligence should eventually combine:

- keyword overlap;
- rank movement;
- category position;
- pricing and packaging;
- screenshots and positioning;
- landing-page changes;
- review themes;
- release cadence;
- feature and messaging differences;
- discoverability and share of voice.

The goal is not to copy competitors. The goal is to reveal where the market is
moving and where the customer has a differentiated opportunity.

---

## 9. The path from prototype to millions

Roadmap stages are ordered by proof. Dates may change; the sequence should not
be skipped without an explicit founder decision.

### Stage 0 — Visual product prototype

**Current stage.**

Purpose:

- establish the River Atlas language;
- prove that the product can make complex data immediately understandable;
- build the production foundation;
- demonstrate the complete conceptual loop.
- validate bounded future primitives, such as Acquisition Atlas, without
  pretending the broader SaaS stage has been reached.

Exit criteria:

- the prototype is clearly labeled and never mistaken for live analytics;
- the main flows are interactive;
- the architecture can support real imports safely;
- prospective users understand the promise without a long explanation.

### Stage 1 — One truthful iOS growth journey

Purpose:

- make AppClimb genuinely useful for a real iOS subscription app.

Required:

- complete and reliable App Store Connect imports;
- complete RevenueCat, PostHog, and Superwall imports;
- real freshness and completeness;
- real River Atlas computation;
- evidence-backed earliest-bottleneck selection;
- real Growth Replay;
- connector retries, corrections, revocation, and reconciliation;
- clear empty, low-volume, delayed-data, and disagreement states.

Exit criteria:

- a new user connects a source and reaches a real evidence-backed bottleneck;
- at least one full app can use AppClimb weekly without sample data;
- design partners trust the numbers enough to make an experiment decision.

### Stage 2 — Indie mobile growth system

Purpose:

- expand from funnel diagnosis into acquisition and market intelligence.

Required:

- daily keyword monitoring;
- storefront and country comparisons;
- keyword opportunity visuals;
- competitor discovery and comparison;
- review ingestion and Voice Clusters;
- experiment outcome tracking;
- notifications or digests based on meaningful changes, not metric noise.

Exit criteria:

- users repeatedly return to monitor changes and experiments;
- AppClimb can explain both product-funnel and discoverability constraints;
- the product has a repeatable paid self-serve acquisition loop.

### Stage 3 — SaaS and web products

Purpose:

- apply the same visual growth model beyond app stores.

Required:

- configurable SaaS growth stages;
- web acquisition and SEO inputs;
- signup, activation, billing, retention, and expansion journeys;
- Paddle/Stripe and web-analytics source precedence;
- SaaS-specific replay events and experiment templates.

Exit criteria:

- River Atlas remains understandable across mobile and SaaS without becoming a
  generic dashboard builder;
- both audiences share the same Observe → Diagnose → Experiment → Learn loop.

### Stage 4 — Scalable global platform

Purpose:

- serve a very large global indie audience with self-service onboarding.

Required:

- reliable connector platform;
- reusable business-model templates;
- privacy-safe benchmarks where defensible;
- localization;
- fast demo-to-value onboarding;
- durable billing and entitlements;
- scalable ingestion and reconciliation;
- strong education, community, and template ecosystems;
- team collaboration without enterprise complexity.

Exit criteria:

- product value does not depend on founder-led setup;
- infrastructure and support scale with large numbers of small customers;
- visual clarity survives increasing data depth;
- the product remains affordable and useful to independent builders.

---

## 10. Success metrics

### Activation

The first meaningful activation event is:

> A user connects the first real source and opens the first evidence-backed
> bottleneck.

Creating an account or viewing the demo is not sufficient activation.

### Core recurring value

The product should measure:

- workspaces with fresh source data;
- workspaces that open a diagnosis;
- experiments created from evidence;
- experiments with recorded outcomes;
- users who return after a new change event or sync;
- time from first source connection to first trusted insight;
- percentage of insights users accept, dismiss, or convert into experiments.

For Acquisition Atlas, supporting operational metrics are:

- qualified visitors by channel and referrer;
- visitor-to-engaged and visitor-to-explicit-conversion rates;
- time from property installation to the first accepted event;
- human referral traffic from AI assistants, reported separately from crawler
  requests;
- crawler requests by declared agent category and requested public page.

These supporting metrics do not replace the activation definition above.

### North-star direction

A useful long-term north-star metric is:

> **Weekly builders who review an evidence-backed constraint and advance one
> learning loop.**

Revenue matters, but product usage must reflect better decisions rather than
passive dashboard views.

---

## 11. Business model

AppClimb should be a globally accessible, self-serve product for independent
builders.

Current launch contract:

- demo workspace;
- 14-day trial without a card;
- `$12.99/month`;
- `$129/year`;
- billing and tax handling through Paddle.

This pricing is the current contract, not a permanent limit on future packaging.

Future packaging may introduce:

- a limited free visibility layer;
- Pro for active products;
- higher source, history, keyword, or workspace limits;
- small-team collaboration;
- portfolio features later.

Do not optimize early product decisions for enterprise sales, custom consulting,
agency reporting, or bespoke dashboards. The business must be capable of
serving many small customers efficiently.

---

## 12. Prioritization filter

Before building a feature, ask:

1. Does it help the user see the growth system more clearly?
2. Does it improve Observe → Diagnose → Experiment → Learn?
3. Can it be represented visually rather than as another report?
4. Is it grounded in trustworthy evidence?
5. Does it reduce time to the next good decision?
6. Will it still make sense when AppClimb expands from iOS to SaaS?
7. Does it support a scalable self-serve product?

A feature should usually be postponed if it is mainly:

- a custom dashboard request;
- raw SQL or unrestricted data exploration;
- another vanity metric;
- a text-heavy AI report;
- an enterprise-only permission system;
- agency portfolio management before the single-product loop works;
- automatic external mutation before trust and approvals are proven;
- decorative visualization without a decision attached;
- a new integration that does not complete a real workflow.

Finish depth before adding breadth.

---

## 13. Non-goals

AppClimb is not:

- a generic BI platform;
- a collection of disconnected analytics dashboards;
- a data warehouse;
- a raw event explorer;
- a ChatGPT wrapper;
- an automated growth agency;
- an autopilot that changes customer systems without approval;
- a competitor-copying tool;
- an enterprise reporting suite;
- a promise of guaranteed growth.

AppClimb helps a builder see, reason, test, and learn. The builder remains in
control.

---

## 14. Product and design invariants

Future implementations must preserve these invariants:

1. **Visual first.** Text supports the visual; it does not replace it.
2. **One coherent journey.** Metrics belong to a growth stage and decision.
3. **Evidence before advice.** Every recommendation has visible lineage.
4. **Uncertainty is visible.** Low volume, stale data, and hypotheses are
   labeled.
5. **Earliest constraint first.** Do not blame downstream stages before the
   upstream loss is understood.
6. **Read-only before automation.** Trust is earned before mutations.
7. **Progressive disclosure.** A quick answer first, depth on demand.
8. **Calm, consistent color.** Color has semantic meaning.
9. **Motion explains change.** Animation is functional.
10. **No fake completeness.** Prototype, live, and roadmap states remain
    explicit.
11. **Self-serve scale.** Avoid workflows that require AppClimb staff to operate
    them for every customer.
12. **Founder control.** A major change to audience, core loop, River Atlas, or
    visual-first positioning requires an explicit founder decision.

---

## 15. Instructions for future AI agents and contributors

Before doing product work:

1. Read this document completely.
2. Inspect the current repository and production state.
3. Identify the current roadmap stage.
4. State whether the relevant capability is shipped, prototype, in development,
   or roadmap.
5. Evaluate the requested change against the prioritization filter.

While working:

- do not infer that polished UI means real data exists;
- do not replace River Atlas with a KPI dashboard;
- do not add text simply because it is easier than designing a visual;
- do not add a generic AI chat surface as the main experience;
- do not fabricate metrics, benchmarks, projections, integrations, or customer
  proof;
- preserve source ownership and insight classification;
- prefer one end-to-end working journey over many incomplete integrations;
- validate desktop, mobile, reduced motion, empty data, low volume, stale data,
  and source-error states;
- keep secrets out of the browser, logs, AI prompts, and repository;
- keep external actions read-only unless the founder explicitly expands scope.

When handing off:

- explain what is actually working;
- explain what still uses sample data;
- distinguish repository implementation, frontend deployment, backend
  migration, site-token installation, and first real event as separate proof;
- list the next highest-leverage product gap;
- show evidence from tests or production;
- update this document only when the founder changes product direction, not for
  ordinary implementation details.

If a request conflicts with this document, stop and surface the conflict rather
than silently changing course.

---

## 16. Current durable decisions

The following decisions are intentional:

- River Atlas is the primary visual concept.
- AppClimb is visual-first: less text, more meaningful visual explanation.
- The initial wedge is iOS subscription apps.
- The long-term market includes mobile apps, SaaS products, and web services.
- The core loop is Observe → Diagnose → Experiment → Learn.
- The first product is read-only.
- Insights are Observed, Derived, or Hypothesis.
- AI receives aggregates and evidence references, not credentials.
- Pulse, Diagnose, Lab, and Sources are the primary navigation.
- Pulse may contain multiple coherent projections; Growth River and
  Acquisition Atlas are the current pair.
- Cloudflare Workers hosts the Next.js web frontend and Hono API.
- Cloudflare D1 is the production database, Queues runs source imports, R2
  retains operational exports, and Cloudflare Email Service sends password
  recovery messages.
- The stopped Hostinger Go/PostgreSQL project and temporary Vercel deployment
  are rollback artifacts only, not active architecture or deployment targets.
- Web acquisition analytics is first-party AppClimb infrastructure. Do not add
  DataFast or another paid analytics dependency for this capability without an
  explicit founder decision.
- Human AI referrals and AI crawler requests remain separate datasets.
- Current crawler attribution is user-agent detected, not IP verified.
- Paddle handles the current trial and subscription billing contract.
- The product should remain accessible to independent builders and scalable to
  a very large self-serve audience.

These decisions can change, but only through an explicit product decision from
the founder. A future agent must not reinterpret an implementation detail as a
change in product strategy.
