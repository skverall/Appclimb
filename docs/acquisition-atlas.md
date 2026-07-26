# Acquisition Atlas

Acquisition Atlas is AppClimb's first-party web acquisition analytics surface.
It does not use DataFast or send traffic data to a third-party analytics
provider.

The founder-approved visual direction is preserved in
[`docs/design/acquisition-atlas-approved.png`](./design/acquisition-atlas-approved.png).
It is a design reference, not evidence of production data.

## Product status

- **Interface:** implemented as a second projection inside Pulse; the public
  workspace uses clearly labeled synthetic demo data.
- **Browser collection:** implemented in `public/appclimb-analytics.js` and
  relayed through `POST /api/track`.
- **Crawler collection:** implemented at the Cloudflare edge in
  `src/middleware.ts` and sent through the private API service binding.
- **Storage and reads:** implemented in the Hono API Worker and production D1.
  Historical migration `006_web_analytics.sql` was losslessly converted during
  the PostgreSQL-to-D1 cutover.
- **AppClimb production property:** live since 2026-07-25; its full dataset,
  signed Worker secret, collector, and categorized crawler path were verified
  on Cloudflare on 2026-07-26.
- **Live workspace gate:** backend migration and API deployed, property
  created, signed token installed on the tracked domain, and a real event
  accepted and visible.

Frontend deployment alone does not satisfy the live workspace gate. The
initial product wedge remains iOS subscription apps; this view is a reusable
acquisition primitive, not completion of the general SaaS roadmap.

## What the view answers

- Which channel, referrer, campaign, or AI assistant brought a human visitor?
- Which landing page did that visitor enter through?
- Did the session become engaged or reach an explicit conversion goal?
- Which known crawler user agents requested public pages, and for what declared
  purpose category?

Human referrals from ChatGPT, Perplexity, Claude, Gemini, or Copilot are normal
visitor sessions. AI crawler requests are server events. They are displayed
and counted separately.

## What is collected

Browser events:

- anonymous visitor and session UUIDs;
- page path and timestamp;
- referrer hostname and classified source/channel;
- UTM source, medium, campaign, term and content;
- country code supplied by the trusted edge;
- browser, operating system and device family;
- engagement duration and explicitly named conversions.

Crawler events are collected separately on the server and never count as human
visitors. The current classifier recognizes answer retrieval, search indexing
and model-training agents. User-agent detection is labelled as such in the UI;
the product does not claim IP verification until a provider-range verification
pipeline exists.

Current human channel classification includes:

- Direct;
- Organic Search, including Google, Bing, DuckDuckGo, Brave, Yahoo, Yandex,
  and Baidu;
- Social, including X, Instagram, Facebook, LinkedIn, Reddit, Threads, TikTok,
  and YouTube;
- AI Referral, including ChatGPT, Perplexity, Claude, Gemini, Copilot, and
  You.com;
- paid, email, newsletter, affiliate, SMS, and other tagged campaigns;
- other referrals.

Current crawler categories include answer retrieval, search indexing, and model
training. A provider label means the request user agent matched a maintained
rule; it is not yet proof that the source IP belongs to that provider.

The category tabs scope the headline count, the daily chart, and the provider
and requested-page rollups. Provider share is relative to the selected
category, not to all crawler traffic, and each category is ranked
independently so a busy category cannot crowd the others out of a shared row
limit.

The Cloudflare API always returns `category` on those two rollups. The frontend
still handles a missing field as an explicit historical compatibility state:
it shows rows unfiltered and labels both sections "all categories" rather than
inventing a scope. Do not reintroduce an active legacy API dependency for this
fallback.

AppClimb does not persist visitor IP addresses. The browser tracker respects Do
Not Track and uses session storage by default. Persistent storage is available
only when a site deliberately changes `data-storage` after handling consent.
URL query strings are not stored as page paths; only the named UTM fields are
retained.

## Install a website

Create the web property in **Pulse → Acquisition Atlas** and copy the generated
snippet before `</body>`:

```html
<script
  src="https://appclimb.app/appclimb-analytics.js"
  data-token="acwa1_..."
  data-storage="session"
  defer
></script>
```

For AppClimb's own Next.js deployment, set the generated token as the
server-side `APPCLIMB_TRACKING_TOKEN` Worker secret. The root layout loads the
browser tracker and `src/middleware.ts` forwards recognized crawler requests
automatically.

Record an explicit conversion after the tracker has loaded:

```js
window.appclimbAnalytics?.track("conversion", {
  goal: "account_created",
});
```

The AppClimb website currently emits:

- `account_created` after a successful account signup;
- `checkout_started` after Paddle successfully opens the checkout;
- `paid_activated` only when the checkout success page receives a
  server-confirmed active paid entitlement.

## Data boundary

The tracking token is a signed public property identifier. It is not an account
credential. The collector validates its signature, workspace, property version
and request hostname before inserting a deduplicated D1 event. Authenticated
reads bind every query to the workspace ID from the verified access token.

The public demo uses synthetic sample data and labels it as demo traffic. A
private workspace shows an explicit setup or waiting state until real events
arrive.

The seven-day demo snapshot in `src/lib/acquisition-demo.ts` is the authored
baseline; `demoAcquisitionSnapshotForWindow` derives the 30- and 90-day windows
from a deterministic daily series so the window selector moves every total,
breakdown and crawler figure together. It must stay deterministic — the public
Atlas is server-rendered on `?atlas=1`, so any wall-clock or random input would
break hydration. For the same reason demo rows age against the snapshot's own
frozen `generatedAt` rather than the current time.

## Architecture and ownership

1. The browser or Next.js proxy sends a bounded event to the same AppClimb web
   origin.
2. The OpenNext web Worker validates body size and reaches the Hono API through
   the private `APPCLIMB_API` service binding.
3. The API Worker validates the signed property token, request hostname, event
   shape, category, and retention boundary.
4. D1 inserts a deduplicated row under the property's workspace.
5. Authenticated reads scope every D1 query to the workspace from the verified
   access token.

AppClimb first-party analytics owns web referrer, UTM, landing-page, explicit
web conversion, and crawler evidence. App Store Connect, RevenueCat, PostHog,
and Superwall keep their existing metric ownership. Cross-source user joins
remain disabled unless a workspace explicitly confirms a shared identifier.

## Production rollout

Treat these as separate release gates:

1. Run `npm run check` on the exact commit.
2. Apply committed D1 migrations and deploy `appclimb-api`.
3. Confirm `GET /v1/web-analytics` returns an authentication response rather
   than `404` or `405`.
4. Create the `appclimb.app` property from an entitled owner workspace.
5. Set its returned `acwa1_...` token as the Cloudflare Worker
   `APPCLIMB_TRACKING_TOKEN`.
6. Deploy `appclimb-web` and verify the private API service binding plus browser
   collector.
7. Confirm one real page view is accepted, appears in Acquisition Atlas, and is
   not labeled demo data.
8. Send a recognized crawler user agent through a public page and confirm it
   appears only in Crawler Current.
9. Add explicit conversion calls for account creation, checkout start, and
   successful paid activation before interpreting conversion rate.

All nine original live-property gates passed on 2026-07-25. Cloudflare
migration proof on 2026-07-26 additionally included exact D1 reconciliation,
healthy API and private service-binding checks, the complete production account
lifecycle, and a new GPTBot event stored only in the model-training crawler
category. The public `?demo=1&atlas=1` workspace intentionally remains
synthetic and labeled; it is not evidence from the production property.

For every other property, apply the same gates independently. Until its
applicable gates pass, describe that property as implemented or partially
deployed, not as complete live analytics.
