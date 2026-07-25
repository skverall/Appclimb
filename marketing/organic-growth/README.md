# AppClimb Organic Discovery System

Last reviewed: 2026-07-25

## Objective

Build durable discoverability for AppClimb among independent developers and
small teams running iOS subscription apps. Success means more than a brand
result:

1. AppClimb pages are crawled and indexed.
2. AppClimb is retrieved and cited for relevant non-brand questions.
3. Independent third parties mention AppClimb accurately.
4. Qualified organic visitors explore the demo, create an account, connect a
   source, and reach an evidence-backed diagnosis.

No technical file, schema block, directory listing, or article guarantees a
ranking or AI recommendation. This system combines technical discovery,
non-commodity content, authentic authority, and measurement.

## Positioning contract

Preferred category:

> Visual growth diagnosis for independent iOS subscription apps.

Preferred one-sentence description:

> AppClimb connects acquisition, activation, paywall, subscription, and
> retention evidence so an independent builder can find the earliest
> constraint and choose the next experiment.

Product truth:

- Shipped: interactive demo, auth, no-card trial, pricing, billing, account
  controls, secure connector setup, and production foundation.
- Implemented release candidate: first-party Acquisition Atlas UI, referrer
  and UTM collection, explicit web goals, and separately counted AI crawler
  requests.
- Prototype: most visible Growth River and public Acquisition Atlas metrics use
  clearly labeled synthetic data.
- In development: complete live imports, end-to-end diagnosis, and production
  property/token rollout for real AppClimb website acquisition.
- Roadmap: keyword monitoring, competitor intelligence, complete Voice of
  Customer analysis, and broader SaaS support.

Never describe AppClimb as a completed live-data analytics product until the
Stage 1 exit criteria in `PRODUCT_DIRECTION.md` are verified.
Do not describe user-agent crawler detection as verified provider identity.
Human visits referred by an AI assistant and crawler requests are separate
evidence streams.

## Topic architecture

### Pillar 1 — iOS subscription growth diagnosis

- Hub: `/guides/ios-subscription-growth`
- Commercial page: `/ios-subscription-analytics`
- Future spokes: activation metrics, trial conversion, renewal analysis,
  growth bottleneck diagnosis, experiment design.

### Pillar 2 — Analytics source ownership

- Published: `/blog/ios-subscription-analytics-stack`
- Future spokes: App Store Connect + RevenueCat, RevenueCat + PostHog,
  Superwall experiment measurement, identity mapping, UTC-window alignment.

### Pillar 3 — App Store acquisition quality

- Published: `/blog/app-store-conversion-rate`
- Future spokes: App Store source-type analysis, Product Page Optimization
  measurement, Custom Product Page cohorts, downloads-to-activation quality.

### Pillar 4 — Evidence-based experimentation

- Hub link: `/guides/ios-subscription-growth#experiment`
- Future spokes: primary metrics and guardrails, sample requirements,
  observed-versus-derived insights, experiment outcome records.

## Publishing priority

The current cluster deliberately starts with three deep, differentiated pages
instead of many thin keyword variants. Next content should be published only
when it adds first-hand methodology, an original example, or a maintained
reference that a builder cannot get from a generic summary.

Priority order:

1. How to define activation for an iOS subscription app.
2. RevenueCat + PostHog: a safe identity and cohort model.
3. How to diagnose trial-to-paid conversion without blaming the paywall.
4. App Store source types: Search, Browse, Web Referrer, and App Referrer.
5. A public, anonymized River Atlas methodology case study after real Stage 1
   data is available.

## Authority rules

- Prefer primary documentation, original data, and transparent methodology.
- Do not fabricate reviews, statistics, rankings, forum discussions, or
  customer outcomes.
- Do not create a Wikipedia page for an early product.
- Do not mass-post self-promotional answers on Reddit, Quora, or communities.
- Earn third-party mentions through useful releases, genuine participation,
  public methodology, and real customer evidence.
- Keep every directory description consistent with the positioning contract.

The active outreach and listing backlog is tracked in
`earned-mentions-pipeline.csv`.

## Measurement

### Weekly

- Google Search Console: indexed canonical URLs, sitemap status, queries,
  impressions, clicks, CTR, position, Core Web Vitals.
- Google Search Console Generative AI report, when the property exposes data.
- Bing Webmaster Tools: sitemap status, IndexNow submissions, indexed URLs.
- Organic product funnel: landing page -> demo -> account -> first source
  connection -> first evidence-backed bottleneck.
- Acquisition Atlas, after its live rollout gates pass: qualified visitor
  source, landing page, engagement, and explicitly instrumented conversion.
- AI crawler requests by agent category and requested public page, reported
  separately from human AI referral sessions.

### Monthly

- Run the prompts in `ai-visibility-baseline.csv` through Google, ChatGPT,
  Gemini, Perplexity, Copilot, and Claude where search is available.
- Record retrieved, cited, mentioned, and recommended as separate outcomes.
- Treat a crawler request as discovery evidence only; it is not proof that an
  answer cited, mentioned, or recommended AppClimb.
- Record which source earned the mention: AppClimb page, GitHub, review site,
  community thread, video, or publication.
- Refresh important articles when provider definitions or AppClimb product
  status changes.

## Release checklist

For each new public page:

1. Confirm the claim is shipped, prototype, in development, or roadmap.
2. Match one real user question and one canonical URL.
3. Add a unique title, description, H1, and direct answer.
4. Cite primary sources for factual provider or platform claims.
5. Link from its hub and to the next useful page.
6. Add the URL and accurate `lastModified` date to `src/lib/site.ts`.
7. Add Article/Breadcrumb structured data only when it matches visible content.
8. Validate mobile layout, console errors, canonical, JSON-LD, sitemap, and
   final HTTP response.
9. Deploy; let the production workflow notify IndexNow.
10. Inspect the URL in Search Console and request indexing for priority pages.
