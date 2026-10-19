# ADR 0007 — A weekly email for Pro users

**Status:** Accepted (2026-10-02); extended to free accounts (2026-10-19)

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

## Amendment (2026-10-19): free accounts get a weekly email too

**Context**

Free accounts got nothing after sign-up, so most never came back, while
60% of active visitors hit the daily check limit. The server knows almost
nothing about a free account: its email, an optional name, and the sign-up
and last-seen dates. Its tracker stays in the browser. Only a former Pro
user can still have a synced tracker in `sync_blobs` (it isn't deleted when
Pro ends).

**Decision**

- Every verified, signed-up account that isn't Pro gets a short weekly
  email: the week's biggest risers in Apple's published search terms
  (US storefront, latest week vs the week before, up to 8 terms, at most 2
  per category, each linked to the explorer), one honest line on what Pro
  adds (synced tracking; this email then shows the user's own rank and
  popularity changes), and the same honesty footer.
- Terms written in a script the storefront's shoppers don't use (a
  Cyrillic term in Apple's US Shopping list, say) are left out of risers
  and newcomers here, and of the Pro email's category risers.
- The data behind the free email also carries, per riser, last week's
  popularity and up to 8 weeks of Apple history (from `search_term_history`;
  empty, never invented, when unavailable), plus up to 6 terms new to
  Apple's lists this week (in no category's list the week before), for the
  richer layout the founder is designing.
- A former Pro user whose synced tracker is still stored also gets Apple's
  popularity this week for those keywords. Ranks in that tracker stopped
  updating when sync stopped, so they are never shown.
- Pro users without a synced tracker still get no email; nothing changes
  for Pro.
- Same opt-out as Pro (`email_prefs`, the account-menu toggle now shown to
  every signed-in user, the unsubscribe link, RFC 8058 headers) and the same
  one-email-per-Apple-week rule (`digest_log`). Unverified addresses are
  never emailed.
- When Apple's latest week or the week before isn't available, free
  accounts are held (reported as `freeHeld`, not logged) and get the email
  on a later run in the same week.
- `POST /api/digest/run?preview=free` returns this week's free email with
  a placeholder unsubscribe link, so the founder can read it before it goes
  out. It holds no user data; the workflow never calls it.

**Consequences**

- The first Wednesday run after deploy emails every verified free account
  that hasn't opted out. Accounts that signed up before this change were
  not told about the email at sign-up; the email says why it arrives and
  unsubscribes in one click.
- The free email is the same for every free account (apart from former Pro
  users' keywords), so a storefront picker or per-category choice would be
  the next step if it proves useful.
