# ADR 0007 — A weekly email for Pro users

**Status:** Accepted (2026-10-02)

**Context**

Nothing brought a user back to AppClimb after their first session: ranks are
checked in the browser, and Apple publishes new popularity weekly without
anyone noticing. Product rules keep guest and free keyword data in the
browser; only a signed-in Pro user's data is synced to D1 (ADR 0004).

**Decision**

- Pro users get a weekly email built from their own synced tracker
  (`sync_blobs`, key `tracker`) and Apple's latest week in D1: per tracked
  app, how many keywords are in the top 10 / top 200, the biggest climbers
  and fallers between their last check and the check about a week before,
  Apple popularity changes since the previous week, and up to five terms
  rising in the app's category over four weeks (linked to the per-term
  pages). Ranks are labeled as coming from the user's own checks; stale
  ranks (older than 7 days) are called out. Free users get nothing: their
  data never reaches the server.
- On by default for Pro, off with one click: the account menu toggle
  (`GET/POST /api/digest/prefs`), the link in every email (a confirmation
  page at `/unsubscribe`, so link scanners can't unsubscribe), and RFC 8058
  one-click headers (`List-Unsubscribe`, `List-Unsubscribe-Post`). Links
  carry an HMAC of the user id, so no sign-in is needed.
- `POST /api/digest/run` (Bearer `DIGEST_SECRET`) handles up to 10 users per
  call and reports `remaining`; `.github/workflows/weekly-digest.yml` calls
  it on Wednesdays after the warm job, and on demand (dry run by default).
  `digest_log` keeps one row per user per Apple week, so re-runs never send
  twice; failed sends aren't logged and are retried on the next run.
- Mail goes through Resend, the provider already used for sign-in links.
  Dry-run responses contain counts only, because workflow logs are public.

**Consequences**

- Needs the `DIGEST_SECRET` Worker secret and the same value as a GitHub
  Actions secret. Without it the route answers 503 and the workflow exits
  quietly.
- The email is only as fresh as the user's last rank check; it cannot check
  ranks itself because Apple blocks Worker IPs for the iTunes Search API.
