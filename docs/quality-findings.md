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
