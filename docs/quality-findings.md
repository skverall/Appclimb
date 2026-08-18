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
