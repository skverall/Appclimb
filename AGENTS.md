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
- A push to `main` deploys the Vercel frontend after checks; it does not deploy
  the Hostinger Go API or PostgreSQL migrations.
- For any live-data claim, verify repository code, frontend deployment,
  backend route/migration, property configuration, and first accepted real
  event separately.
- Acquisition Atlas is a Pulse projection and a bounded acquisition primitive.
  It does not change the initial iOS subscription-app wedge or make the broader
  SaaS roadmap complete.
- Do not add DataFast for AppClimb's first-party acquisition analytics unless
  the founder explicitly reverses that product decision.
