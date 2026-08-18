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
---
---
---
---
---
---
---
---
## 2026-08-18 · Upgrade/Paddle · ui (modal at 375px)

**Defect:** none found — the upgrade dialog fits 375×812 and the billing-cycle
toggle is reachable and switches to the yearly price at that width.
**Repro:** e2e second pass per matrix rules.
**Fix:** e2e `upgrade modal fits and stays usable at 375px`
(`tests/e2e/app-tracker.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · Keyword Explorer · accessibility+viewport (bulk modal, 375px)


**Defect:** none found — the bulk-analyze dialog fits 375×812, Tab cycling
stays inside it (the focus trap holds after the document-listener fix), and
Escape closes it with focus restored to the opener.
**Repro:** e2e second pass per matrix rules (lens 5 × 4).
**Fix:** e2e `bulk modal traps focus and fits at 375px`
(`tests/e2e/explorer.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · /api/popularity · logic (route-level 429)


**Defect:** none found — with PRO_ENABLED on and mocked credentials, the route
allows the guest's 30th lookup for an IP and returns 429 on the 31st, with the
80ms min-interval respected; different IPs have independent buckets.
**Repro:** unit route tests with frozen `Date.now` (`src/app/api/popularity/route.test.ts`).
**Fix:** n/a — covered.
**Status:** covered (local branch, not pushed).
**Verification:** locally tested — unit green (380 passed).

---
## 2026-08-18 · /api/chat · logic (hourly quota 429, route-level)


**Defect:** none found — the route returns 429 with a rate-limit error once
the hourly cap (20/IP) is exhausted, with the 1200ms interval respected.
**Repro:** unit route test with frozen `Date.now` and one IP: 20 spaced
requests pass, the 21st is 429.
**Fix:** added `/api/chat hourly quota (429)` to
`src/app/api/chat/route.test.ts`.
**Status:** covered (local branch, not pushed).
**Verification:** locally tested — 8 route tests green, full unit green (378).

---
## 2026-08-18 · Marketing shell · ui (degradation when /api/me fails)


**Defect:** none found — with /api/me returning 500, marketing pages render
their H1 and no Next.js error overlay appears; the account fetch degrades to
the anonymous shape and the header hides the account menu.
**Repro:** e2e second pass per matrix rules.
**Fix:** e2e `marketing pages render when /api/me is unavailable`
(`tests/e2e/public-discovery.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · Keyword Explorer · logic (blocked storage e2e)


**Defect:** none found — with localStorage fully blocked (private mode via
SecurityError-throwing Storage methods) the explorer renders the empty state
and a keyword analysis completes in-session: no crash, no eternal spinner.
This validates the fail-closed reads and fail-open writes end-to-end.
**Repro:** e2e with `Storage.prototype` methods denied (second pass per matrix
rules).
**Fix:** e2e `explorer degrades gracefully when localStorage is blocked`
(`tests/e2e/explorer.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · ASO Assistant · logic (non-JSON / aborted chat responses)


**Defect:** `requestAssistantReply` awaited `response.json()` before checking
`response.ok`: a 5xx with a non-JSON body (proxy error page, WAF block,
truncated response from a dropped connection) threw a raw SyntaxError that
leaked into the composer error instead of a clean message, and the status-based
fallbacks never ran.
**Repro:** unit-level: a 500 with an HTML body rejected with a parse error
before this fix.
**Root cause:** `src/lib/ai-chat-client.ts` parsed the body unconditionally.
**Fix:** the body is parsed defensively (empty on failure) so status-based
messages ("Assistant request failed.", 401/429 hints, server `error` field)
always apply.
**Protection:** unit tests `requestAssistantReply failure bodies`
(`src/lib/ai-chat-client.test.ts`) — non-JSON 500/429, server error field, and
the success path.
**Status:** fixed (local branch `goal/assistant-draft-and-limit-gate`, not pushed).
**Verification:** locally tested — unit green (377 passed).

---
## 2026-08-18 · My Apps (tracker) · logic (25-keyword cap boundary)


**Defect:** none found — a fresh free app can add exactly 25 keywords with no
cap notice; the 26th is blocked with the honest "Free plan tracks up to 25
keywords" message and the row count stays at 25.
**Repro:** e2e: add Calm Focus by search (no starter keywords), add 25 → all
added; add 1 more → blocked.
**Fix:** e2e `free plan enforces the 25-keyword cap exactly`
(`tests/e2e/app-tracker.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · Auth (sign out) · logic (Pro flush, second pass)


**Defect:** none found — a Pro sign out flushes pending local data to the
cloud (≥1 PUT to /api/sync) before clearing this device, then shows the
"Signed out" notice; the local tracker store is gone afterwards.
**Repro:** e2e second pass per matrix rules.
**Fix:** e2e `Pro sign out flushes local data to the cloud before clearing`
(`tests/e2e/account.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · Keyword Explorer · security (shared-URL keyword, second pass)


**Defect:** none found — a shared keyword containing HTML renders as literal
React text; no element is injected via the share URL.
**Repro:** e2e on `/?kw=<img src=x onerror=alert(1)>` — the row shows the raw
payload with zero injected `<img>`.
**Fix:** e2e `a shared keyword containing HTML renders as literal text`
(`tests/e2e/explorer.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · /api/chat · logic (upstream failure coverage)


**Defect:** none found — the route maps upstream failures honestly: no key → 503,
fetch throw → 502, upstream 429 → 429, upstream 401/403 → 503, non-JSON body →
502, empty reply → 502, success → the message.
**Repro:** added unit tests against the real route handler with a mocked global
`fetch` and a null DB (IP-keyed quota subjects so each case runs independently).
**Fix:** `src/app/api/chat/route.test.ts`.
**Status:** covered (local branch, not pushed).
**Verification:** locally tested — 7 route tests green, full unit green (373 total).

---
## 2026-08-18 · My Apps (tracker) + ASO Assistant · design/storage (second passes)


**Defect:** none found — tracker status filters route unavailable keywords to
"unchecked" (never lost), and the chat store caps the thread tail at 80
messages and the conversation list at 50, sorted by recency.
**Repro:** code + unit second pass per matrix rules (`matchesStatusFilter`,
`ai-chat-client.test.ts`).
**Fix:** n/a — recorded as checked.
**Status:** checked (local branch, not pushed).
**Verification:** locally tested.

---
## 2026-08-18 · Keyword Explorer · ui (modals at 1024px)


**Defect:** none found — the bulk-analyze and auth dialogs fit the 1024×768
viewport, the bulk modal is centered (midpoint within 24px), and both close
cleanly.
**Repro:** e2e second pass per matrix rules.
**Fix:** e2e `explorer modals fit and stay centered at 1024px`
(`tests/e2e/explorer.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · My Apps (add-app) · logic (double submit, second pass)


**Defect:** none found — a re-search aborts the previous request via
`abortRef`, the submit button is disabled while busy, and the skeleton list
is marked `aria-busy`; an aborted search never surfaces a spurious error.
**Repro:** code-level second pass per matrix rules.
**Fix:** n/a — recorded as checked.
**Status:** checked (local branch, not pushed).
**Verification:** locally tested.

---
## 2026-08-18 · Dialogs (auth) · accessibility (focus trap vs disabled button)


**Defect:** The focus trap's Tab handler listened on the dialog element only.
When the focused element inside the dialog became disabled while focused
(e.g. the magic-link submit button during the in-flight/error state), focus
dropped to <body> — and a listener on the dialog never receives keydown events
that target <body>, so the next Tab escaped the modal (reproduced at 320px:
"focus escaped on Tab #1").
**Repro:** e2e at 320×640: open the auth dialog, submit to trigger an error,
press Tab — the first Tab landed outside the dialog.
**Root cause:** `use-modal-focus.ts` attached the keydown handler to the
container; a body-focused Tab bypassed it.
**Fix:** attach the handler to `document` instead — the handler already
re-routes any Tab whose activeElement is outside the dialog back into it.
**Protection:** e2e `auth dialog keeps the focus trap at 320px and on errors`
(`tests/e2e/guest-access.spec.ts`) — trap holds with the error visible, and
Esc restores focus. The original focus-trap e2e still passes.
**Status:** fixed (local branch `goal/assistant-draft-and-limit-gate`, not pushed).
**Verification:** locally tested — lint/typecheck/unit green (366 passed), e2e green.

---
## 2026-08-18 · Keyword Explorer · logic (upgrade mid-session, e2e)


**Defect:** none found — an exhausted free quota shows the banner; after the
mid-session upgrade to Pro (post-checkout refresh), the gate clears and
analysis proceeds unlimited.
**Repro:** e2e: prime the day counter to 8, banner shows; flip /api/me to Pro,
navigate with ?checkout=success → banner gone, analyze works.
**Fix:** e2e `an upgrade mid-session lifts the explorer quota gate`
(`tests/e2e/explorer.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · My Apps (tracker) · logic (abort + rate-limit interplay)


**Defect:** none found — a 429 is retried with backoff, a non-transient error
is surfaced, and an AbortError (user cancel or the 15s iTunes timeout) is
rethrown without retrying, so a timeout cannot trigger a retry storm and a
cancel never counts as a failure.
**Repro:** unit-level second pass per matrix rules.
**Fix:** unit test `analyzeWithRetry rethrows AbortError without retrying`
(`src/lib/tracker.test.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — unit green (366 passed).

---
## 2026-08-18 · Marketing shell · ui (interactive pass, 1920px)


**Defect:** none found — at 1920×1080 the desktop nav links and "Open
Explorer" CTA are reachable on the marketing pages, navigation via the links
works, and every page holds 0px horizontal overflow.
**Repro:** e2e second pass per matrix rules.
**Fix:** e2e `marketing navigation and CTA work interactively at 1920px`
(`tests/e2e/public-discovery.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · ASO Assistant · ui (interactive pass, 375/768px)


**Defect:** none found — a full send/reply cycle and the history drawer work
at 375×812 and 768×1024 with 0px overflow and the composer reachable.
**Repro:** e2e second pass per matrix rules.
**Fix:** e2e `chat send and history work at 375px and 768px`
(`tests/e2e/assistant.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · Keyword Explorer · logic (CJK/cyrillic keywords)


**Defect:** none found — a Japanese (瞑想) and a Russian (медитация) keyword
analyze and render intact with honest Est. labels; case-insensitive dedup and
sorting are locale-safe for these scripts.
**Repro:** e2e second pass per matrix rules.
**Fix:** e2e `CJK and cyrillic keywords analyze and render intact`
(`tests/e2e/explorer.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · SEO / schema · ui (JSON-LD coverage, second pass)


**Defect:** none found — all 11 checked pages emit at least one parseable,
non-empty JSON-LD block (WebSite/Organization on the layout, FAQ/HowTo and
article schemas on the content pages).
**Repro:** e2e crawl across every public page (second pass per matrix rules).
**Fix:** e2e `every page emits parseable, non-empty JSON-LD`
(`tests/e2e/public-discovery.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · My Apps (tracker) · data-honesty (labels, second pass)


**Defect:** none found — the opportunity column is "Opp. · Est.", difficulty is
"· Est.", the opportunity filter denies "Apple search volume or downloads",
and the detail note names the source (official or estimate) without claiming
downloads/revenue.
**Repro:** e2e second pass per matrix rules.
**Fix:** e2e `tracker labels every score honestly: no volume or downloads
claims` (`tests/e2e/app-tracker.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · ASO Assistant · data-honesty (welcome + prompt contract)


**Defect:** none found — the welcome message promises not to invent search
volumes, and the system prompt labels popularity as official-or-estimate,
difficulty as always an estimate, and forbids claiming volume/downloads/
revenue; context rows are labeled "estimates / observed position".
**Repro:** unit-level second pass per matrix rules.
**Fix:** unit tests `assistant honesty contract`
(`src/lib/ai-chat.test.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — unit green (365 passed).

---
## 2026-08-18 · My Apps (cloud sync) · ui (missing sync states)


**Defect:** `syncState` (syncing/synced/error) was held in the account provider
but rendered nowhere — a Pro subscriber had zero feedback that their data
synced, failed, or was in progress.
**Repro:** code-level: grep for `syncState` consumers found only the provider.
**Root cause:** the account menu never surfaced the sync state.
**Fix:** the Pro account menu now shows a status row (role=status): "Syncing…",
"Cloud sync on", or "Cloud sync failed — data stays on this device" (honest,
matches the actual degradation). Hidden while "off" and for non-Pro.
**Protection:** the Pro-sync e2e asserts "Cloud sync on" after a successful
push and "Cloud sync failed" after a 503
(`tests/e2e/account.spec.ts`).
**Status:** fixed (local branch `goal/assistant-draft-and-limit-gate`, not pushed).
**Verification:** locally tested — lint/typecheck/unit green (363 passed), e2e green.

---
## 2026-08-18 · Keyword Explorer · data-honesty (detail labels, second pass)


**Defect:** none found — the detail panel labels the estimate ("Estimated
demand from public iTunes signals"), shows the difficulty-as-estimate caption,
never claims search volume, and never renders a bare number without its
source (with the overlay unconfigured, the badge is Est. only).
**Repro:** e2e (mocked configured:false) — second pass per matrix rules.
**Fix:** e2e `detail labels every score with its source, never claiming volume`
(`tests/e2e/explorer.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · /api/popularity · logic (e2e note)


**Note:** an attempted e2e asserting the unconfigured-overlay fallback against
the real route was removed: this environment ships valid Apple Ads
credentials, so the real `/api/popularity` performs live lookups and returns
"Apple Ads" — the test flipped with the network. The fallback (configured:false
→ estimates, never a fake official badge) is already covered by the mocked
`/api/popularity` `configured:false` tests (refund, bulk, slow-network).
**Verification:** n/a.

---
## 2026-08-18 · ASO Assistant · logic (5th/6th message boundary)


**Defect:** none found — with the free daily cap primed to 4, the 5th message
reaches the server, and the 6th is rejected by the client pre-check before
any network activity; the draft is preserved for retry.
**Repro:** e2e: free signed-in account, `appclimb:ai:day` count=4 → 5th send
succeeds (1 request), 6th send shows the assistant-limit error with no new
request and the text intact.
**Fix:** e2e `the 5th free message passes and the 6th is blocked client-side`
(`tests/e2e/assistant.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · Auth (magic-link) · logic (rate-limit surface, second pass)


**Defect:** none found — the client surfaces a server 429 ("Too many sign-in
emails…") verbatim in the dialog and recovers to the sent state once the
window passes. The server limiter (5/hour/IP, 10s min-interval, key eviction)
is covered by unit tests (`rate-limit.test.ts`).
**Repro:** e2e: mock /api/auth/magic-link 429 then 200.
**Fix:** e2e `magic-link rate-limit error is surfaced and recovers`
(`tests/e2e/account.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · Performance (explorer + chat storage) · audit


**Defect:** none found — storage writes are bounded (chat: 80 messages/thread,
50 conversations, 48-char titles; explorer history: 92-day cap from the
earlier fix) and every timer/subscription is cleaned up (suggestions debounce,
undo timeout, tracker auto-refresh, refresh aborts, sync timers).
**Repro:** code-level second pass per matrix rules (lens 12).
**Fix:** n/a — recorded as checked.
**Status:** checked (local branch, not pushed).
**Verification:** locally tested.

---
## 2026-08-18 · My Apps (tracker) · logic (localized date display)


**Defect:** none found — the tracker's last-checked column renders the full
ISO timestamp through toLocaleString (correct in every timezone), never a
bare date-only string that would shift a day in negative timezones.
**Repro:** e2e second pass: the sample app's rows reach a localized
AM/PM timestamp once their checks complete.
**Fix:** the tracker token-invariant e2e now polls for the formatted
timestamp across all widths (`tests/e2e/tracker-tokens.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · My Apps (tracker) · ui (viewport guard, 1440/1920px)


**Defect:** none found — the tracker workspace keeps 0px horizontal overflow,
reachable actions, and design tokens (tabular figures, sticky-column shadow,
chips fit) at 1440×900 and 1920×1080.
**Repro:** e2e at both widths (second pass per matrix rules).
**Fix:** the tracker token-invariant test now iterates 375/1024/1440/1920
(`tests/e2e/tracker-tokens.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · /api/sync (Pro) · logic (end-to-end coverage)


**Defect:** none found — a Pro user's local tracker changes get pushed to
/api/sync (debounced), and when the backend returns 503 the push fails
gracefully without deleting local data.
**Repro:** e2e: Pro mock, quick-start seeds the sample app, the push fires;
then the sync endpoint 503s and a locally added keyword persists.
**Fix:** e2e `Pro sync pushes local changes and keeps data on backend failure`
(`tests/e2e/account.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · Auth modal · ui (error and sent states)


**Defect:** none found — a server-side magic-link failure surfaces in the
dialog ("Email is not configured yet.") and the same form reaches the
"Check your inbox" sent state once the backend recovers.
**Repro:** e2e: mock /api/auth/magic-link 503 then 200.
**Fix:** e2e `auth modal surfaces server errors then the sent state`
(`tests/e2e/account.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · ASO Assistant · ui (viewport guard, sidebar 1024px)


**Defect:** none found — with the history sidebar open at 1024px, a full
send/receive cycle and a conversation switch work with 0px overflow and the
composer reachable.
**Repro:** e2e at 1024×768 (interactive second pass per matrix rules).
**Fix:** e2e `chat works with the history sidebar open at 1024px`
(`tests/e2e/assistant.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · Keyword Explorer · logic (input wipe race while analyzing)


**Defect:** While an analysis is in flight, a user who starts typing the next
keyword had their input wiped: the analyze's `finally` called `setQuery("")`
unconditionally, destroying whatever was typed after the click. Reproduced
with a slow iTunes mock — the box was empty right after the second fill.
**Repro:** e2e on `/` with an 800ms iTunes mock: fill "keyword 1", Analyze,
then fill "keyword 2" before the first check finishes — the input empties.
**Root cause:** `keyword-explorer.tsx` finally block cleared the query without
checking whether it still held the analyzed term.
**Fix:** the clear is conditional — `setQuery(current => current.trim() ===
clean ? "" : current)` — the box clears only when it still contains the
searched keyword; a new draft survives.
**Protection:** e2e `the quota gate blocks the 9th check before touching a
slow iTunes` (`tests/e2e/explorer.spec.ts`) — eight sequential checks on a
slow network (each fill happens while the previous check may still run), then
the 9th attempt proves the gate blocks before any rank-search request.
**Status:** fixed (local branch `goal/assistant-draft-and-limit-gate`, not pushed).
**Verification:** locally tested — lint/typecheck/unit green (363 passed), e2e green.

---
## 2026-08-18 · Marketing (404) · ui (coverage)


**Defect:** none found — unknown URLs return a real 404 status, render the
not-found page with the "Search keywords" recovery link, and stay overflow-
free at 320px.
**Repro:** e2e on two bogus paths (second pass per matrix rules).
**Fix:** e2e `unknown URLs render the 404 page with a 404 status` and
`404 page stays usable at 320px` (`tests/e2e/public-discovery.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · Upgrade/Paddle · logic (portal flow coverage)


**Defect:** none found — for a canceled Pro plan (cancel_at_period_end),
"Manage subscription" fetches the portal links and opens the update-payment-
method URL; the menu closes.
**Repro:** e2e: Pro user with a canceled subscription, mocked portal endpoint.
**Fix:** e2e `manage subscription opens the portal links for a canceled Pro
plan` (`tests/e2e/account.spec.ts`) — stubs window.open and asserts the
opened URL.
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · ASO Assistant · design (CJK/cyrillic/emoji in markdown)


**Defect:** none found — CJK, cyrillic, and emoji pass through the chat
markdown renderer untouched, bold still applies to CJK spans, and unbalanced
stray asterisks stay literal.
**Repro:** unit-level second pass (`src/components/chat-markdown.test.ts`) —
🎯/推荐关键词/**冥想**, cyrillic text, and "5*5=25".
**Fix:** tests added; no code change needed.
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — unit green (363 passed).

---
## 2026-08-18 · My Apps (tracker) · design (token invariants)


**Defect:** none found — numeric cells use tabular figures, the sticky keyword
column carries a separation shadow, status chips fit the viewport, and the
page has 0px horizontal overflow at both 375px and 1024px.
**Repro:** e2e at 375×812 and 1024×768 (second pass per matrix rules): computed
`fontVariantNumeric` on `.tracker-position`, `boxShadow` on
`.tracker-col-sticky`, chip-row bounding box, page overflow.
**Fix:** e2e `tracker design tokens hold at 375px and 1024px`
(`tests/e2e/tracker-tokens.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · Auth (sign out) · ui (flow coverage)


**Defect:** none found — sign out asks for confirmation on the free plan,
clears the local workspace (tracker store) after acceptance, and shows the
"Signed out" notice.
**Repro:** e2e: signed-in free user seeds the sample app → Sign out →
confirm → toast + empty localStorage.
**Fix:** e2e `sign out clears free-plan workspace data after confirmation`
(`tests/e2e/account.spec.ts`) — also adds the minimal iTunes mock helper used
by tracker flows in this spec.
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · ASO Assistant · logic (upgrade mid-session, covered)


**Defect:** none found — the composer gate unlocks after an upgrade. The
stale-`remainingDay` concern is neutralized by the product flow: Paddle
redirects back with `?checkout=success`, the page (re)mounts, and the
gate condition (`aiLimit !== null && remainingDay === 0`) no longer holds
for the new plan.
**Repro:** e2e: free user hits 0 → gate shows; /api/me flips to Pro and the
post-checkout refresh runs → gate gone, composer visible, a new send works.
**Fix:** e2e `upgrading mid-session unlocks the composer gate`
(`tests/e2e/assistant.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · Keyword Explorer · accessibility (focus after remove/Undo)


**Defect:** Removing a row by keyboard dropped focus to <body> — the Undo
bar appeared but focus never moved to it, and after Undo (or the 6s
auto-dismiss) focus was left nowhere, so a keyboard-only user had to Tab
blindly to continue.
**Repro:** e2e: focus "Remove meditation", press Enter — activeElement fell
to <body>; the Undo button was not focused.
**Root cause:** `removeRow`/`undoRemove`/the auto-dismiss timeout never
managed focus.
**Fix:** focus moves to the Undo button when the bar appears, back to the
search input after Undo, and to the search input when the bar auto-dismisses
while focused.
**Protection:** e2e `keyboard removal moves focus to Undo and restores to the
search box` (`tests/e2e/explorer.spec.ts`) — Enter removes, Undo is focused,
Enter restores, and the search input receives focus.
**Status:** fixed (local branch `goal/assistant-draft-and-limit-gate`, not pushed).
**Verification:** locally tested — lint/typecheck/unit green (361 passed), e2e green.

---
## 2026-08-18 · Keyword Explorer · logic (CSV date hydration)


**Defect:** The CSV `last_checked_at` column alternated formats: a fresh
check wrote the full ISO timestamp (`2026-08-18T10:00:00.000Z`) while a
record restored from localStorage only kept the date (`2026-08-18`) — the
same keyword exported different formats before and after a reload.
**Repro:** unit-level: `estimateMetrics` sampledAt contains "T"; after
`recordSnapshot` + `restoreMetricsFromRecord` it is date-only; the CSV row
reflected each format verbatim.
**Root cause:** `buildExplorerCsv` emitted `metrics.sampledAt` as-is.
**Fix:** the export column is normalized to the date part
(`lastChecked.slice(0, 10)`) — history lives at day granularity, so the
column is always the date.
**Protection:** unit test `normalizes restored records to the same
date-only last_checked_at` (`src/lib/aso.test.ts`); the fresh-path assertion
now expects the date part too.
**Status:** fixed (local branch `goal/assistant-draft-and-limit-gate`, not pushed).
**Verification:** locally tested — lint/typecheck/unit green (361 passed).

---
## 2026-08-18 · Keyword Explorer · ui (detail panel overflow at 320px)


**Defect:** The keyword detail panel with a long no-space keyword overflowed
the 320px viewport by 509px — the heading could not wrap, so the panel (and
the page) scrolled sideways.
**Repro:** e2e at 320×640: open the detail for a 60-char keyword → 509px
overflow.
**Root cause:** `.keyword-detail-header h2` had no wrapping rule (the same
class of defect as the table name, fixed in the previous cycle).
**Fix:** `overflow-wrap: anywhere` on the detail heading.
**Protection:** extended e2e `a 60-character keyword does not overflow the
page` (`tests/e2e/explorer.spec.ts`) — asserts 0px overflow at 1440px, at
320px with the table, and at 320px with the detail panel open.
**Status:** fixed (local branch `goal/assistant-draft-and-limit-gate`, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · Keyword Explorer · ui (long keywords overflow at 320px)


**Defect:** A keyword without spaces (up to 80 chars allowed) pushed the table
wider than the viewport: at 320px a 60-char keyword produced 299px of
horizontal page overflow — the whole page scrolled sideways.
**Repro:** e2e at 320×640: analyze a 60-char no-space keyword → 299px
overflow; at 1440px the same row fits.
**Root cause:** `.keyword-name` had no wrapping rule; an unbroken string could
not break inside the cell.
**Fix:** `overflow-wrap: anywhere` on `.keyword-name` — long keywords wrap
inside the cell at any width.
**Protection:** e2e `a 60-character keyword does not overflow the page`
(`tests/e2e/explorer.spec.ts`) — asserts 0px overflow at 1440px AND 320px,
and that the name stays inside the table card.
**Status:** fixed (local branch `goal/assistant-draft-and-limit-gate`, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · Storage layer (explorer + tracker) · logic (blocked storage)


**Defect:** `loadKeywordList`, `loadRecord`, `exportExplorerBackup`, and
`loadTrackerStore` called `storage.getItem` outside a try/catch. In a blocked
storage context (private mode / security policy) the read throws and crashes
the explorer rehydration or the tracker workspace, instead of degrading to an
empty state.
**Repro:** unit-level: a storage whose `getItem` throws SecurityError —
`loadKeywordList`/`loadRecord`/`loadTrackerStore` propagate the exception.
**Root cause:** read paths guarded only `JSON.parse`, not the `getItem` call.
**Fix:** all four reads fail closed (empty list / null record / empty store /
skip unreadable keys in backups), mirroring the fail-open writes.
**Protection:** unit tests `blocked storage (private mode)` in
`src/lib/aso.test.ts` and `src/lib/tracker.test.ts`.
**Status:** fixed (local branch `goal/assistant-draft-and-limit-gate`, not pushed).
**Verification:** locally tested — lint/typecheck/unit green (360 passed).

---
## 2026-08-18 · Keyword Explorer · logic (90-day history was unimplemented)


**Defect:** The UI claimed "90-day history" on Pro (pricing page, limit
banners, llms.txt) and `plan.ts` defines `historyDays: 90` for Pro — but the
explorer always charted `recentHistory(record)` with the hardcoded 30-day
window. Pro subscribers got exactly the same 30-day charts as free users
despite the promise; the stored history cap (92) anticipated a 90-day view
that never rendered.
**Repro:** e2e: seed a record with 60 history points; a Pro account shows
"60 days" only after the fix, a free account stays at "30 days".
**Root cause:** `keyword-detail.tsx` and the table sparkline called
`recentHistory(record)` (default `HISTORY_DAYS = 30`); the plan's
`historyDays` was never threaded through.
**Fix:** `historyDays` is derived from `account.limits.historyDays` in the
explorer, passed to `KeywordDetail`, and used for both the detail charts and
the table sparkline (`recentHistory(record, historyDays)`).
**Protection:** e2e `history window follows the plan: 30 days free, 90 on Pro`
(`tests/e2e/explorer.spec.ts`) — same stored data renders "30 days · Est."
for free and "60 days · Est." for Pro. (Pro flow also mocks /api/sync, which
the account provider calls when a Pro user is signed in.)
**Status:** fixed (local branch `goal/assistant-draft-and-limit-gate`, not pushed).
**Verification:** locally tested — lint/typecheck/unit green (358 passed), e2e green.

---
## 2026-08-18 · /api/popularity · logic (quota unit coverage)


**Defect:** none found — the route's daily quota (30/day guest, 500 Pro,
80ms min interval, UTC-midnight reset) was correct but untestable inline.
**Repro:** n/a (coverage gap); the 8th/9th-request semantics were only
verifiable by reading.
**Fix:** extracted the rate bucket into `src/lib/popularity-quota.ts`
(`emptyPopularityBucket`/`consumePopularityRate`) and imported it from the
route; unit tests now cover the 30th-pass/31st-block boundary, the UTC-
midnight reset, the min-interval gate, and unlimited plans
(`src/lib/popularity-quota.test.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — lint/typecheck/unit green (358 passed), build green.

---
## 2026-08-18 · Marketing shell · ui (viewport guard, mobile nav 375px)


**Defect:** none found — the mobile navigation drawer at 375px opens without
horizontal overflow, every link is reachable, and selecting one closes the
drawer and navigates.
**Repro:** e2e at 375×812 (second pass per matrix rules).
**Fix:** e2e `marketing mobile nav drawer fits 375px without overflow`
(`tests/e2e/public-discovery.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

---
## 2026-08-18 · ASO Assistant · ui (viewport guard, history drawer 375px)


**Defect:** none found — the history drawer at 375px opens without horizontal
overflow, and picking a chat closes the drawer with the composer reachable.
**Repro:** e2e at 375×812 (second pass per matrix rules).
**Fix:** e2e `chat history drawer stays usable at 375px`
(`tests/e2e/assistant.spec.ts`).
**Status:** checked + covered (local branch, not pushed).
**Verification:** locally tested — e2e green.

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
