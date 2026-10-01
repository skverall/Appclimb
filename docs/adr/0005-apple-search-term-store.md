# ADR 0005 — Apple's published search terms as the data backbone

**Status:** Accepted (2026-10-01)

**Context**

ADR 0003 added official popularity by asking Apple Ads for the top 500 terms
of one *inferred* genre and scanning them for the keyword. Probing the
Platform API showed much more is available:

- `searchTerm` accepts `IN` / `CONTAINS` / `STARTS_WITH` filters, and the
  genre filter is optional — Apple returns each term's own genre.
- A time range of up to a year returns one row per week: real history.
- Apple publishes exactly 500 terms per genre per week (15 genres, ~7,500
  terms per storefront), all with popularity ≥ ~41. Terms outside the list
  have no score at all.
- Bursts of parallel calls get HTTP 429; steady sequential calls do not.
- Apple rate-limits Cloudflare egress for both `itunes.apple.com` and the
  App Store search-hints endpoint, so neither can be proxied by the Worker.

Meanwhile the explorer showed a fabricated 29-day "baseline" (a pseudo-random
walk), added ±4 deterministic jitter to scores, estimated popularity mostly
from the iTunes result count, and the homepage showcased hard-coded numbers
labeled "Official Apple Ads". 41% of first-time searchers hit the daily
limit before seeing anything they could act on.

**Decision**

- Store each storefront-week of Apple's published terms in D1 (one JSON
  chunk per genre; loaded lazily, warmed by a scheduled GitHub workflow).
- `POST /api/popularity` answers from that store: official score + rank in
  genre, or `found:false` with `ceiling` = the genre's lowest published
  score. With `history:true` it adds Apple's weekly history (cached per term
  per week; 12 weeks on Free, 52 on Pro).
- New public read endpoints: `/api/terms/suggest` (autocomplete),
  `/api/terms/related` (shared-word terms, same genre first),
  `/api/terms/trending` (rising vs four weeks back, newcomers, top).
- Popularity sources become `official | longtail | estimated`. Long-tail
  terms render as `≤N · Long tail`. The iTunes estimate is only a fallback
  when Apple is unreachable.
- Difficulty v2: position-weighted rating strength of the top 10, discounted
  when an incumbent's name does not target the term, big brands count as
  strong, brand searches floor at 92. No jitter. Evidence (median ratings,
  weakest app, title matches, brand apps) travels with the score.
- A verdict per keyword: Worth targeting / Long-tail win / Competitive /
  Dominated / Low demand, with a one-line reason. Replaces "Golden".
- No invented history anywhere. Legacy backfilled points are dropped on load.

**Consequences**

- First request for a new storefront-week costs ~8 sequential Apple calls
  (~8 s) unless the warm-up job ran; afterwards lookups are D1/memory reads.
- D1 grows ~16 rows per storefront-week plus one row per looked-up term.
- Redistribution of Ads Insights data remains the terms-of-use risk the
  founder accepted in ADR 0003; this ADR exposes more of it (trending lists).
- Popularity lookups no longer cost an Apple call each, so the per-day
  popularity quota rose to 200 (Free/guest) and 2,000 (Pro).
