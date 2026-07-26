<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Canonical product direction

Before any product, design, roadmap, positioning, data-model, integration, or
architecture work, read `PRODUCT_DIRECTION.md` completely.

Treat it as the product north star. Do not infer that the polished River Atlas
prototype represents completed live-data functionality. Explicitly distinguish
shipped, prototype, in-development, and roadmap capabilities. If a request
conflicts with the document, surface the conflict instead of silently changing
direction.

# Current handoff map

- Read `README.md` for the repository, verification, and deployment map.
- Read `docs/acquisition-atlas.md` before changing web attribution, visitor
  journeys, tracking, privacy, or crawler handling.
- Read `ops/README.md` before production backend or database work.
- A push to `main` runs `.github/workflows/cloudflare-deploy.yml`, applies D1
  migrations, and deploys both the API and OpenNext web Workers.
- Production is Cloudflare Workers + D1 + Queues + R2 + Email Service. The
  stopped Hostinger Go/PostgreSQL project and Vercel deployment are rollback
  artifacts only; never treat them as the current backend or release path.
- For any live-data claim, verify repository code, frontend deployment,
  backend route/migration, property configuration, and first accepted real
  event separately.
- Current production checkpoint (2026-07-26): the final frozen PostgreSQL
  snapshot matches all 24 production D1 table counts; Cloudflare auth lifecycle
  passed; the PostHog connection re-synced through Queues with the truthful
  `no_data_in_window` state; a new categorized crawler event reached D1; the
  authoritative custom domain uses the private API binding; and Cloudflare
  Email Sending accepted the first password-recovery message. Reverify mutable
  production state before relying on this checkpoint in a new release.
- Acquisition Atlas is a Pulse projection and a bounded acquisition primitive.
  It does not change the initial iOS subscription-app wedge or make the broader
  SaaS roadmap complete.
- Do not add DataFast for AppClimb's first-party acquisition analytics unless
  the founder explicitly reverses that product decision.
- PostHog OAuth uses PKCE and a URL-form CIMD client ID at
  `https://appclimb.app/api/oauth/posthog/client`. Preserve the canonical
  `appclimb.app` host redirect, the exact callback URI, PostHog's nested
  `"com.posthog": { "scopes": [...] }` metadata shape, and the allow-listed
  US/EU host validation when changing this flow.
