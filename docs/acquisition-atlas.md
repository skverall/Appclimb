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
- **Crawler collection:** implemented server-side in `src/proxy.ts` and relayed
  through `POST /api/track/crawler`.
- **Storage and reads:** implemented in the Go API and PostgreSQL migration
  `006_web_analytics.sql`.
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
server-side `APPCLIMB_TRACKING_TOKEN` environment variable. The root layout
loads the browser tracker and `src/proxy.ts` forwards recognized crawler
requests automatically.

Record an explicit conversion after the tracker has loaded:

```js
window.appclimbAnalytics?.track("conversion", {
  goal: "account_created",
});
```

## Data boundary

The tracking token is a signed public property identifier. It is not an account
credential. The collector validates its signature, workspace, property version
and request hostname before inserting a deduplicated event. Authenticated reads
run with the workspace PostgreSQL context and every analytics table has forced
row-level security.

The public demo uses synthetic sample data and labels it as demo traffic. A
private workspace shows an explicit setup or waiting state until real events
arrive.

## Architecture and ownership

1. The browser or Next.js proxy sends a bounded event to the same AppClimb web
   origin.
2. Next.js validates body size and forwards the request to the Go collector.
3. The Go API validates the signed property token, request hostname, event
   shape, category, and retention boundary.
4. PostgreSQL inserts a deduplicated row under the property's workspace.
5. Authenticated reads set the workspace database context before querying the
   forced-RLS tables.

AppClimb first-party analytics owns web referrer, UTM, landing-page, explicit
web conversion, and crawler evidence. App Store Connect, RevenueCat, PostHog,
and Superwall keep their existing metric ownership. Cross-source user joins
remain disabled unless a workspace explicitly confirms a shared identifier.

## Production rollout

Treat these as separate release gates:

1. Run `npm run check` on the exact commit.
2. Deploy the Hostinger backend bundle and run migration
   `006_web_analytics.sql` through the one-shot `migrate` service.
3. Confirm `GET /v1/web-analytics` returns an authentication response rather
   than `404` or `405`.
4. Create the `appclimb.app` property from an entitled owner workspace.
5. Set its returned `acwa1_...` token as the Vercel server-only
   `APPCLIMB_TRACKING_TOKEN`.
6. Deploy the Vercel frontend and verify the browser collector is present.
7. Confirm one real page view is accepted, appears in Acquisition Atlas, and is
   not labeled demo data.
8. Send a recognized crawler user agent through a public page and confirm it
   appears only in Crawler Current.
9. Add explicit conversion calls for account creation, checkout start, and
   successful paid activation before interpreting conversion rate.

Until all applicable gates pass, describe the feature as implemented or
partially deployed, not as complete live analytics.
