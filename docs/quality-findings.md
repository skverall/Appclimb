# Quality findings log

Memory for the Goal agent team ([GOAL.md](../GOAL.md)). Every run appends here
so the next run starts with knowledge, not from zero.

Entry format — keep it one block per finding, newest first:

```markdown
## YYYY-MM-DD · <surface> · <category: logic|ui|design|copy|data-honesty>

**Defect:** what was wrong, in one sentence.
**Repro:** how it was reproduced (viewport, input, state, steps).
**Root cause:** the actual reason in code (file:line when useful).
**Fix:** what changed.
**Protection:** which test/e2e step now covers it.
**Status:** fixed (branch/commit) | open | wontfix (founder decision).
**Verification:** code complete | locally tested | staging | production.
```

Rules:

- Record "checked, nothing found" runs too (surface + date + what was tried).
- Never mark `production` without checking the deployed site at
  `https://appclimb.app`.
- Open findings are the backlog — a new run picks the highest-priority open
  item or a fresh surface, never re-litigates closed ones.

---
---
---
---
---
---
---
---
---
---
---
---
---
---
## 2026-08-18 · My Apps (tracker) · ui (viewport guard, 1024px)

**Defect:** none found — the tracker workspace, its table, the ranking
overview, and the keyword detail panel all fit 1024×768 with 0px horizontal
overflow; Add Keywords / CSV export / overview remain reachable.
**Repro:** e2e at 1024×768 (two passes: workspace then keyword detail panel).
**Fix:** e2e `tracker layout has no overflow and stays usable at 1024px`
(`tests/e2e/app-tracker.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · Keyword Explorer · ui (bulk partial-failure coverage)


**Defect:** none found — the bulk banner already reports partial failures
honestly ("Done — N of M couldn't be analyzed…") and failed rows are removed.
**Repro:** e2e: bulk-analyze "meditation\nfail-bulk" with the mocked iTunes
returning 429 for the second term (second pass per matrix rules).
**Fix:** e2e `bulk analyze reports partial failures honestly`
(`tests/e2e/explorer.spec.ts`) — asserts the failure banner, exactly one
successful row, and no lingering failed row.
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · ASO Assistant · logic (IME composition Enter)


**Defect:** The composer sent the message on any Enter keydown, including the
Enter that confirms an IME composition (CJK input). A Japanese/Chinese user
typing with an input method got a half-composed message sent mid-word.
**Repro:** e2e on `/assistant`: dispatch a keydown Enter with
`isComposing: true` on the composer — a `/api/chat` request fired and a user
bubble appeared before the fix.
**Root cause:** `ai-chat-conversation.tsx` `onKeyDown` handled Enter without
checking `event.nativeEvent.isComposing`.
**Fix:** return early while composing; regular Enter (and Shift+Enter
newline) behave as before.
**Protection:** e2e `IME composition Enter does not send the message`
(`tests/e2e/assistant.spec.ts`) — composed Enter sends nothing (0 requests,
no bubble), then a plain Enter sends normally.
**Status:** fixed (local branch `goal/assistant-draft-and-limit-gate`, not pushed).
**Verification:** locally tested — lint/typecheck/unit green (354 passed), e2e green.

---
## 2026-08-18 · Auth dialog · ui (viewport guard, 320px)


**Defect:** none found — the sign-in dialog fits the 320px viewport with the
email field and submit button reachable.
**Repro:** e2e at 320×640 (second pass per matrix rules).
**Fix:** e2e `auth dialog fits the 320px viewport`
(`tests/e2e/guest-access.spec.ts`) — bounding box stays within the viewport
and the primary fields are visible.
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · iTunes fetches (explorer, tracker, add-app) · logic (hang timeout)


**Defect:** The iTunes catalog fetches had no request timeout. A hung request
(network blackhole, proxy stall) left the explorer's "Analyzing" row and the
tracker's refresh progress in a permanent loading state — the whole explorer
stays disabled ("Wait for the current analysis to finish") with no recovery.
**Repro:** unit-level: stub `fetch` to never settle — `searchAppStoreCatalog`
never resolves; with the fix it rejects after `timeoutMs`.
**Root cause:** `src/lib/itunes.ts` and `src/lib/aso.ts` passed only the
caller's optional signal to `fetch`.
**Fix:** new `requestSignal(callerSignal?, timeoutMs?)` in `itunes.ts`
(default 15s) combining a caller signal with `AbortSignal.timeout` via
`AbortSignal.any`; applied to all five fetch sites (catalog search, rank
search, lookup, icon lookup, keyword-result search). Callers that cancel
(user abort) still work; `analyzeWithRetry` rethrows AbortError without
retrying, so a timeout is reported as a keyword failure, not a retry storm.
**Protection:** unit tests `src/lib/itunes.test.ts` — a never-settling fetch
aborts within `timeoutMs`; a caller signal is combined with the timeout.
**Status:** fixed (local branch `goal/assistant-draft-and-limit-gate`, not pushed).
**Verification:** locally tested — lint/typecheck/unit green (354 passed).

---
## 2026-08-18 · Core surfaces · ui (viewport guard, desktop pass)


**Defect:** none found at 1024×768 and 1920×1080 on `/`, `/assistant`,
`/pricing`, `/app-store-keywords` — 0px horizontal overflow; at ≥900px the
assistant history sidebar opens by default and the composer stays reachable
beside it.
**Repro:** e2e at both widths (second pass per matrix rules).
**Fix:** e2e `core surfaces have no horizontal overflow at 1024px and 1920px`
(`tests/e2e/public-discovery.spec.ts`) — also asserts the sidebar toggle
reports `aria-pressed=true` while the history is open.
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · Auth + Upgrade · logic (double submit)


**Defect:** `sendMagicLink` (auth modal) and `startCheckout` (upgrade modal)
had no busy guard: two submits in the same tick (Enter + click, or a forced
form event before React re-renders the disabled state) sent two magic-link
emails / opened checkout twice. The buttons' `disabled` state only applies
after the re-render.
**Repro:** e2e on `/`: fill the email, submit, then dispatch a second form
`submit` event directly (bypassing the disabled button) — two
`/api/auth/magic-link` requests fired before the fix.
**Root cause:** handlers set `busy` but never checked it on re-entry.
**Fix:** early `if (busy) return;` in both handlers — single-flight.
**Protection:** e2e `magic-link submit is single-flight (no double email)`
(`tests/e2e/account.spec.ts`) — forces a second form submit after the first
click and asserts exactly one request reached the endpoint.
**Status:** fixed (local branch `goal/assistant-draft-and-limit-gate`, not pushed).
**Verification:** locally tested — lint/typecheck/unit green (352 passed), e2e green.

---
## 2026-08-18 · /api/popularity · logic (quota day boundary)


**Defect:** The popularity route kept its own rolling-24h daily window (a
duplicate of the bug fixed in the chat route): a user who hit the 30/day cap
at 23:30 UTC stayed locked until 23:30 the next day while every other daily
quota resets at UTC midnight.
**Repro:** code-level: `emptyBucket`/`consumeRate` anchored `dayReset` at
`firstUse + 24h`; unit-level the shared helper now pins the boundary.
**Root cause:** `src/app/api/popularity/route.ts` duplicated the rolling
window instead of sharing the UTC-midnight boundary.
**Fix:** new dependency-free `src/lib/day-window.ts` (`utcDayStartMs`,
`nextUtcMidnightMs`); both the chat rate bucket and the popularity route now
use it. Daily windows are UTC-calendar-aligned everywhere; hourly/min-interval
controls stay rolling.
**Protection:** unit tests `src/lib/day-window.test.ts` (midnight alignment,
next-midnight boundary, year rollover); the chat UTC-midnight test keeps
passing through the shared helper.
**Status:** fixed (local branch `goal/assistant-draft-and-limit-gate`, not pushed).
**Verification:** locally tested — lint/typecheck/unit green (352 passed), build green.

---
## 2026-08-18 · Keyword Explorer · logic (quota banner day rollover)


**Defect:** The "you've used your 8 free checks" banner was driven by a sticky
`limitHit` flag that only cleared on a successful analyze or when the plan
lifted the cap. A tab left open across UTC midnight kept showing yesterday's
exhausted banner on the new day, and the remaining-checks indicator stayed
hidden — the user had to attempt an analyze to discover the fresh budget.
**Repro:** e2e on `/` with a live free account: prime `appclimb:explorer:day`
to today+8 → banner shows; rewrite the key to yesterday+8 (midnight passed
while the tab stayed open); interact → banner persists and checks appear
blocked until an analyze actually runs.
**Root cause:** `keyword-explorer.tsx` — `limitHit` as state + set-only
transitions instead of deriving from the day counter.
**Fix:** `limitHit` is now computed (`explorerLimit !== null &&
peekDayUsage(...) >= explorerLimit`), so the banner and indicator always
reflect the current UTC day and the current plan; the state and the
setLimitHit calls were removed.
**Protection:** e2e `limit banner clears when the day rolls over`
(`tests/e2e/explorer.spec.ts`) — exhausted banner shows, further attempts
blocked, then after a simulated midnight the banner clears on interaction and
a successful analyze consumes exactly one fresh check ("7 of 8 left today").
**Status:** fixed (local branch `goal/assistant-draft-and-limit-gate`, not pushed).
**Verification:** locally tested — lint/typecheck/unit green (350 passed), e2e green.

---
## 2026-08-18 · Core surfaces · ui (viewport guard, tablet pass)


**Defect:** none found at 768×1024 on `/`, `/assistant`, `/pricing`,
`/app-store-keywords` — all render with 0px horizontal overflow and the
primary interactive element stays reachable.
**Repro:** e2e at 768×1024 (second pass per matrix rules).
**Root cause:** n/a — coverage gap only.
**Fix:** e2e `core surfaces have no horizontal overflow at 768px (tablet)`
(`tests/e2e/public-discovery.spec.ts`) added alongside the 320px guard.
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · Keyword Explorer / My Apps · performance (localStorage growth)


**Defect:** Keyword history grew without bound — `recordSnapshot` appended a
daily snapshot forever (a 3-year-old keyword ≈ 1100 entries). With many
keywords this exhausts the ~5MB localStorage quota, and the explorer's write
paths (`saveKeywordList`, `saveRecord`, `saveTrackerStore`) did a bare
`setItem` that throws on quota: `analyze()` calls `addKeywordToList` before
its try block, so a quota error left the "Analyzing" chip spinning forever
with an unhandled rejection.
**Repro:** unit-level: seed a record with 120 history entries, snapshot today
→ 121 entries stored (no cap). A storage whose `setItem` throws →
`addKeywordToList`/`saveKeywordList`/`saveTrackerStore`/`recordSnapshot`
propagate the exception.
**Root cause:** no cap on stored history (`HISTORY_DAYS` was display-only) and
no fail-open on the three persistence writes.
**Fix:** new `MAX_STORED_HISTORY_DAYS = 92` cap (90-day Pro view + margin)
applied in `recordSnapshot`; `saveRecord`, `saveKeywordList`, and
`saveTrackerStore` now fail open (try/catch) exactly like `consumeDayUsage`.
**Protection:** unit tests — history cap keeps ≤92 entries with today's point
preserved; fail-open writes do not throw for quota-blocked storage
(`src/lib/aso.test.ts`, `src/lib/tracker.test.ts`).
**Status:** fixed (local branch `goal/assistant-draft-and-limit-gate`, not pushed).
**Verification:** locally tested — lint/typecheck/unit green (350 passed).

---
## 2026-08-18 · Keyword Explorer · accessibility (suggestions dropdown)


**Defect:** The live suggestions dropdown could not be dismissed by keyboard
(Escape) or by clicking elsewhere — it stayed open over the page until the
query changed or an analysis completed. The input also had no combobox
relationship (no aria-expanded / aria-controls), so assistive tech could not
announce the listbox.
**Repro:** e2e on `/`: type "med" → dropdown opens; press Escape → still open;
click the page heading → still open.
**Root cause:** `keyword-explorer.tsx` — Escape in the global key handler only
closed the detail panel; no outside-click listener existed; the input was a
plain text field with no listbox binding.
**Fix:** Escape now also closes suggestions; a pointerdown outside the search
form dismisses them; the input declares `role="combobox"`, `aria-expanded`,
`aria-controls="keyword-suggestions"`, `aria-autocomplete="list"`, and the
listbox carries the matching id.
**Protection:** e2e `keyword suggestions close on Escape and on outside click`
(`tests/e2e/explorer.spec.ts`) — Escape keeps the query, outside click
dismisses, and the combobox attributes are asserted while open.
**Status:** fixed (local branch `goal/assistant-draft-and-limit-gate`, not pushed).
**Verification:** locally tested — lint/typecheck/unit green (347 passed), e2e green.

---
## 2026-08-18 · My Apps (tracker keywords) · logic (plan gate + swallowed error)


**Defect:** Two bugs in the tracker's keyword cap:
1. Pre-monetization mode (PRO_ENABLED off, accounts not configured) applied a
   phantom 25-keyword-per-app cap: TrackerView computed `keywordLimit =
   account.limits.keywordsPerApp` directly, while the workspace gates limits
   behind `limitsOn` (null = unlimited). A local/CI user was hard-capped with
   an "Upgrade to Pro" message in a mode where upgrade does not exist.
2. The cap message never displayed even when limits were live: `onConfirm`
   called `setError(cap message)` and then `refreshKeywords(...)`, which
   starts with `setError(null)` — the message was cleared in the same event
   and silently lost. The cap applied but the user got no explanation.
**Repro:** e2e on `/`: quick-start the sample app; live free account → paste
26 keywords → confirm: rows capped at 25 but no error text. Without /api/me →
same flow capped at 25 in pre-monetization mode.
**Root cause:** `tracker-view.tsx:178` (no `limitsOn` gate) and the
`setError` → `refreshKeywords` ordering in both modal onConfirm handlers.
**Fix:** TrackerView now gates `keywordLimit` exactly like the workspace
(`proEnabled() || accountsLive`); the cap notice is set after the refresh
completes (or immediately when nothing was added), so it survives.
**Protection:** e2e `keyword cap applies only when plan limits are live`
(`tests/e2e/app-tracker.spec.ts`) — asserts 33 rows and no cap error in
pre-monetization mode, and the visible 25-cap message for a live free account.
**Status:** fixed (local branch `goal/assistant-draft-and-limit-gate`, not pushed).
**Verification:** locally tested — lint/typecheck/unit green (347 passed),
e2e green.

---
## 2026-08-18 · Account plumbing (header, composer) · logic (failure path)


**Defect:** `fetchAccountState`, `requestMagicLink`, and `fetchPortalLinks` had
no request timeout. With `/api/me` hanging (unreachable backend, proxy
blackhole), the header showed a permanent placeholder and the ASO assistant
composer area rendered blank (`loading ? null : …`) — an eternal spinner class
of failure with no recovery.
**Repro:** unit-level: stub `fetch` to never settle — `fetchAccountState()`
never resolves; with the fix it aborts after `timeoutMs` and returns the
anonymous account.
**Root cause:** `src/lib/account.ts` raw `fetch` with no `AbortSignal`.
**Fix:** all three fetches carry `AbortSignal.timeout` (8s `/api/me` + portal,
10s magic link); `fetchAccountState` accepts `timeoutMs` for tests. The catch
path already existed and now actually runs for hangs.
**Protection:** unit test `falls back to the anonymous account when /api/me
hangs` (`src/lib/account.test.ts`, new file).
**Status:** fixed (local branch `goal/assistant-draft-and-limit-gate`, not pushed).
**Verification:** locally tested — lint/typecheck/unit green (347 passed).

---
## 2026-08-18 · Core surfaces · ui (viewport guard)

**Defect:** No regression guard existed against horizontal overflow at narrow
widths for the three core surfaces — only the marketing landing page was
checked (390px).
**Repro:** e2e at 320×640 on `/`, `/assistant`, `/pricing`.
**Root cause:** test coverage gap, not a product bug — the surfaces render
fine at 320px (verified: 0px overflow on all three).
**Fix:** e2e `core surfaces have no horizontal overflow at 320px`
(`tests/e2e/public-discovery.spec.ts`) asserts scrollWidth ≤ clientWidth and
that the primary interactive element (search input / composer / plan card) is
visible on each page at 320px.
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · ASO Assistant · logic (quota day boundary)

**Defect:** The server's daily message cap used a rolling 24h window starting at
first use, while the browser counter (`appclimb:ai:day`) resets at UTC
midnight. A free user who hit the 5-message cap late at night stayed locked
for a full rolling day even though the UI showed a fresh "5 messages left" —
every send then failed with a server 429 for up to 24h.
**Repro:** unit-level: bucket created at 2026-08-18T23:30Z, 5 messages
consumed; at 2026-08-19T00:10Z the old code still blocked (dayCount 5) while
the client counter had already reset.
**Root cause:** `src/lib/ai-chat.ts` `emptyRateBucket`/`checkAndConsumeRateLimit`
anchored `dayReset` at `firstUse + 24h` instead of the UTC calendar boundary.
**Fix:** `dayReset` is now `UTC-midnight + 24h`; the reset branch recomputes it
from the current UTC day. The hour window stays rolling (abuse control), only
the daily window is calendar-aligned — matching the browser counters and
making `retryAfterSec` honest (seconds to midnight instead of 24h).
**Protection:** unit test `resets the daily cap at UTC midnight, matching the
browser counter` (`src/lib/ai-chat.test.ts`) — 5/day free-plan caps, asserts
reset at 00:10Z and the retry value pointing at midnight.
**Status:** fixed (local branch `goal/assistant-draft-and-limit-gate`, not pushed).
**Verification:** locally tested — lint/typecheck/unit green (345 passed).

---
## 2026-08-18 · Dialogs (all modals) · accessibility (keyboard / focus)

**Defect:** All seven dialogs (`aria-modal`) let Tab escape into the page behind
them and never restored focus to the opener on close — keyboard-only users
could get lost behind a dialog.
**Repro:** e2e on `/`: open the sign-in dialog as a guest, press Tab repeatedly —
focus lands on page links behind the modal; close with Escape — focus stays on
`<body>` instead of returning to the "Sign in to track" button.
**Root cause:** no shared focus management existed; each modal only handled
Escape and its own initial focus.
**Fix:** new `useModalFocus` hook (`src/components/use-modal-focus.ts`) traps
Tab/Shift+Tab between the dialog's first and last focusable elements, moves
focus into the dialog on open when the dialog does not, and restores focus on
close. Wired into auth, add-app, add-keywords, bulk, onboarding, suggestions,
and upgrade modals.
**Protection:** e2e `auth dialog traps keyboard focus and restores it on close`
(`tests/e2e/guest-access.spec.ts`) — 12 Tab and 12 Shift+Tab keystrokes must
stay inside the dialog, and Escape returns focus to the opener.
**Status:** fixed (local branch `goal/assistant-draft-and-limit-gate`, not pushed).
**Verification:** locally tested — lint/typecheck/unit green (344 passed).

---
## 2026-08-18 · Import/Export (CSV) · security (edge data / injection)

**Defect:** The CSV exporter (shared by Keyword Explorer and My Apps) passed
bare values starting with `=`, `+`, `-`, `@`, or a tab straight into the CSV.
On open in Excel / Google Sheets / LibreOffice, such a cell is evaluated as a
formula (CSV injection): a keyword or app name like `=HYPERLINK(...)` or
`+cmd|...` would execute in the user's spreadsheet. Keywords, notes, and app
names are user/third-party controlled.
**Repro:** `csvEscape("=SUM(A1:A9)")` returned `=SUM(A1:A9)` (unit-level);
in-app, a keyword or note starting with one of those characters exported as a
live-formula cell.
**Root cause:** `src/lib/file.ts` `csvEscape` only quoted commas/quotes/newlines
and never neutralized leading spreadsheet-formula characters.
**Fix:** `csvEscape` now prefixes an apostrophe to any value starting with a
formula character (OWASP CSV-injection guidance). Spreadsheet apps strip the
prefix and render the literal text; the prefix also lands inside the quoting
branch when the value concurrently needs quoting.
**Protection:** unit tests in `src/lib/file.test.ts` covering `= + - @ \t`
prefixes, unaffected values (`baby-stroller`, `2+2`), and quote interplay.
**Status:** fixed (local branch `goal/assistant-draft-and-limit-gate`, not pushed).
**Verification:** locally tested — lint/typecheck/unit green (343 passed).

---
## 2026-08-18 · Keyword Explorer · quota e2e note

**Note:** the refund e2e initially flaked in a rerun because the pre-monetization
mode sets `explorerLimit` to `null` (no cap), so `consumeDayUsage` never wrote a
counter. The test now mocks `GET /api/me` → `configured:true, user:null,
plan:free` to activate the guest 8/day cap before exercising the refund path.
Explorer spec 7/7 green.

---
## 2026-08-18 · Keyword Explorer · logic (quota/failure path)

**Defect:** A failed analysis (iTunes non-2xx, network error, throttle)
consumed one of the guest's 8 daily checks even though no data was delivered.
A transient Apple outage silently burned limited budget; the user could be
locked out of searching by failed attempts alone.
**Repro:** e2e on `/`: mock `https://itunes.apple.com/**` → 500 and
`/api/popularity` → unconfigured; analyze a keyword → error banner, no row,
but `appclimb:explorer:day` count incremented to 1.
**Root cause:** `keyword-explorer.tsx` `analyze()` consumed the daily unit via
`consumeDayUsage` before the attempt and the catch path only removed the row,
never returning the unit.
**Fix:** `consumeDayUsage` now reports whether the write actually happened
(`consumed`), and a new `refundDayUsage` reverses one unit safely (never below
zero, today only). The catch path refunds when the failed attempt had consumed.
Only successful analyses count toward the daily cap; same-key refreshes still
consume nothing.
**Protection:** unit tests for `refundDayUsage` (`src/lib/usage.test.ts`) and
e2e `failed iTunes lookups refund the guest daily check`
(`tests/e2e/explorer.spec.ts`) — asserts count stays 0 after a failed attempt,
becomes exactly 1 after a successful one, and stays 1 after a refresh.
**Status:** fixed (local branch `goal/assistant-draft-and-limit-gate`, not pushed).
**Verification:** locally tested — lint/typecheck/unit green (340 passed),
explorer e2e spec green.

---
## 2026-08-18 · ASO Assistant · logic/ui (failure paths)

**Defect:** A failed send (network error, server 500/429, or client-side quota
throw) cleared the composer — the user’s typed draft was lost forever — while
the optimistic user bubble stayed committed to the thread/history even though
the message never reached the model. And at 0 messages left the composer
stayed fully enabled, so every extra send could only fail.
**Repro:** e2e on `/assistant`: mock `**/api/chat` → 500, type a message, send —
error banner appears but the textarea is empty and the user bubble lingers.
Second e2e: mock success `remainingDay:0`, prime the day counter to the cap —
the textarea/send remain active with no honest “limit reached” state.
**Root cause:** `ai-chat-conversation.tsx` `send()` called `setInput("")` before
the request and never restored it in the catch block; the optimistic bubble was
added before the try and never reverted on failure. The composer conditional
only handled the guest gate, not a zero-remaining state.
**Fix:** Clear the draft only on success; on failure, restore `setInput(content)`
and filter the failed optimistic bubble out of the thread (persisted removal via
the save effect). The composer now renders an honest daily-limit gate
(“Today’s messages are used up … resets every 24 hours”) with an Upgrade CTA
when Pro is enabled, instead of an input that can only error.
**Protection:** e2e `failed sends keep the draft and do not commit the message`
and `assistant shows the daily-limit gate at zero remaining messages`
(`tests/e2e/assistant.spec.ts`). Both failed before the fix, passed after.
**Status:** fixed (local branch `goal/assistant-draft-and-limit-gate`, not pushed).
**Verification:** locally tested — lint/typecheck/unit green (336 passed),
assistant e2e spec 6/6 green.

## 2026-08-18 · My Apps (tracked-app add flows) · logic

**Defect:** On the Free plan (1 tracked app), "Also track in <storefront>"
added the same app in another country storefront without any gate, silently
exceeding the tracked-app limit — only the "Add App" modal and quick-start
paths enforced `atAppLimit()`.
**Repro:** e2e with mocked `GET /api/me` (configured:true, plan free,
trackedApps:1): add Calm Focus (US), then select "Also track in" → DE. The
workspace showed "Tracked Apps 2" with both `Calm Focus US` and `Calm Focus DE`
pills and the banner "Now tracking Calm Focus in DE" — no upgrade prompt.
**Root cause:** `src/components/app-workspace.tsx` `handleTrackInStorefront`
called `requireAccount("track")` and then `trackAppInStorefront(...)` directly,
skipping the `atAppLimit()` check that `handleSelectCatalogApp` and
`handleQuickStart` both perform.
**Fix:** Added the same `atAppLimit() → openUpgrade(); return` gate at the top
of `handleTrackInStorefront`. A storefront variant is a new tracked entry and
counts against the plan's tracked-app slot, exactly like any other add path.
**Protection:** e2e `free plan cannot exceed the 1-app limit by tracking extra
storefronts` (`tests/e2e/app-tracker.spec.ts`) — mocks a live backend via
`**/api/me` + `**/api/popularity`, tracks one app, attempts a second storefront,
and asserts the "Upgrade to Pro" dialog opens and the tracked-app pill count
stays at 1. Failed before the fix, passed after.
**Status:** fixed (local branch `goal/storefront-app-limit`, not pushed —
founder is the push gate).
**Verification:** locally tested — `npm run check` green, `npm run test:e2e`
green (24/24).

## 2026-08-18 · Post-purchase header state (account menu) · UI/logic

**Defect:** After completing a real Paddle checkout, the header plan chip kept
showing "Free" until a manual page reload. The `?checkout=success` handler ran a
single `refresh()`; if the Paddle webhook → D1 write had not landed yet, the
client kept the stale `plan: free` state with no retry, so a paying customer saw
no confirmation they were Pro.
**Repro:** Live: bought Pro (100% discount) on `appclimb.app` → returned via
`?checkout=success` → header still "Free" until F5.
**Root cause:** `src/components/account-provider.tsx` `checkout=success` branch
did one `fetchAccountState()` with no retry window; the webhook arrives a beat
after the checkout redirect.
**Fix:** Poll `/api/me` (6 attempts, backoff ~0s/1.3s/2.6s/5.2s/10.4s) updating
the account state each time; stop as soon as the plan flips to Pro; fall back to
`window.location.reload()` with a notice ("Your upgrade is active. Refreshing…")
so the UI can never be stuck showing Free after a paid checkout.
**Protection:** manual live verification on the founder's account (plan flipped
to Pro via `/api/me` after purchase); component logic covered by existing
account/access unit tests (`src/lib/access.test.ts`, 11 tests).
**Status:** fixed (local branch `feat/pro-badge-and-checkout-refresh`, not
pushed — founder is the push gate).
**Verification:** locally tested — typecheck + lint clean, 344 unit tests pass.

## 2026-08-18 · Webhook price extraction · logic

**Defect:** The `subscriptions.price_id` column in production D1 stayed `NULL`
for every Paddle webhook. The live subscription row showed `price_id: null`
even though both price IDs were active and mapped to Pro correctly.
**Repro:** Live: bought Pro monthly + yearly with the 100% test discount; read
`subscriptions` from `appclimb-db` via `wrangler d1 execute` — `price_id` null.
Predicted by unit test shape: `paddle.test.ts` only exercised
`items[{ price_id }]`.
**Root cause:** Paddle webhooks (API v1) send the price nested as
`items[].price.id`; `extractSubscriptionInfo` (`src/lib/paddle.ts`) read
`items[].price_id`, which only appears in the REST API surface, so the price was
always dropped.
**Fix:** Accept both shapes — `items[].price_id` (REST) and the nested
`items[].price.id` (webhook).
**Protection:** New unit test "reads the price from the nested price entity used
by webhooks (API v1)" in `src/lib/paddle.test.ts`. Failed before the fix,
passed after (28 tests in paddle+billing).
**Status:** fixed (local branch `feat/pro-badge-and-checkout-refresh`, not
pushed — founder is the push gate). Applies to the next deploy; D1 will start
recording `price_id` on the next subscription event.
**Verification:** locally tested — typecheck + lint clean, paddle/billing tests
green. Note: existing production row stays `price_id: null` until the next
webhook event touches that subscription.

## 2026-08-18 · Pro badge in the header · design/polish

**Defect (founder request):** Post-purchase, the header gave no positive signal
that the account is now Pro beyond the plain text chip.
**Fix:** Added a premium `.account-plan-badge` (gradient teal, white sparkle
icon, subtle shadow) for `isPro` users in `src/components/account-menu.tsx`,
replacing the flat chip; Free/Guest chips unchanged. Styled on existing design
tokens (`--teal-500/600`, `--radius-pill`, `--text-3xs`).
**Status:** fixed (local branch `feat/pro-badge-and-checkout-refresh`, not
pushed).
**Verification:** locally tested — typecheck + lint clean, 344 unit tests pass.
