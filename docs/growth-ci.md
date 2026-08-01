# Growth CI

**Status:** In development on `feat/growth-ci`  
**Last updated:** 2026-07-28

This document describes the Growth CI product loop as implemented in the
repository. It is not a claim of production verification for a real customer app.

## Promise

> Your agents ship. AppClimb proves whether the release helped.

AppClimb evaluates iOS subscription releases using RevenueCat (money) and
PostHog (behavior), opens at most one growth incident per app when a regression
is confirmed, issues one agent-ready task, and closes that task only from
production evidence.

## Objects

| Object | Purpose |
| --- | --- |
| Growth Contract | Server-owned measurement + thresholds (`appclimb.yml` exportable) |
| Release | Observed production version/build (`agent` / `posthog` / `manual`) |
| Release check | Deterministic evaluation run with verdict + evidence |
| Growth incident | One open regression per app |
| Agent task | Portable task packet + claim/report lifecycle |
| Agent token | Hashed, scoped bridge credential |

## State machines

### Release

`observed` → `collecting` → `evaluated` (or `superseded`)

### Verdict

`collecting` | `healthy` | `improvement` | `regression` | `inconclusive` |
`configuration_required`

### Incident

`open` → `in_progress` → `awaiting_verification` → `closed`

Outcomes: `resolved` | `partial` | `no_effect` | `worsened` | `dismissed` |
`inconclusive`

### Agent task

`available` → `claimed` → `submitted` → `deployed` → `closed`  
(`canceled` from non-terminal states when appropriate)

Claims expire after a bounded timeout and return to `available`.

## Data flow

```text
PostHog sync → version cohorts → upsert releases → queue release-check
                                                      ↓
                                    pure engine (no network/DB)
                                                      ↓
                              persist check → open incident (if regression)
                                                      ↓
                                         create agent task packet
                                                      ↓
                          Agent Bridge claim / events / report release
                                                      ↓
                              fix-release check → verification outcome
```

Release-check failures never fail source sync.

## Agent Bridge (HTTP)

Authenticated with `Authorization: Bearer acagt_...` (hashed at rest).

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/agent/status` | App, release, task freshness |
| GET | `/v1/agent/tasks/next` | Next available task or 204 |
| POST | `/v1/agent/tasks/:id/claim` | Atomic claim |
| POST | `/v1/agent/tasks/:id/events` | Progress (idempotent) |
| POST | `/v1/agent/releases` | Report deployed release |
| GET | `/v1/agent/tasks/:id/verification` | Collecting or final outcome |

Owners and admins can also report a release from the web workspace with
`POST /v1/growth-ci/releases`. The payload requires `appId` and `version`, and
accepts an optional `buildNumber` and `taskId`. AppClimb records this as a
`user_assertion`, queues the normal release check, and moves the linked task to
`awaiting_verification`. The report is not App Store confirmation; a verdict
still requires the real PostHog cohort to mature and pass the deterministic
check.

Token management (user JWT, owner/admin):

- `POST/GET /v1/agent-tokens`
- `DELETE /v1/agent-tokens/:id`

Never returns source credentials or raw customer rows.

## Rollout flags

| Flag | Staging default | Production default |
| --- | --- | --- |
| `GROWTH_CI_ENABLED` | `true` | `false` until launch gate |
| `AGENT_BRIDGE_ENABLED` | `true` | `false` until launch gate |
| `LEGACY_SURFACES_ENABLED` | `false` | `false` |

## Verification levels

- **Code complete** — implemented on this branch
- **Locally tested** — unit/integration/E2E run locally
- **Staging deployed** — requires founder permission
- **Production verified** — real customer app completes the full loop

## Related

- [PRODUCT_DIRECTION.md](../PRODUCT_DIRECTION.md)
- [ADR 0001 — Growth CI pivot](./adr/0001-growth-ci-pivot.md)
- Portable skill: `docs/agent-skill/appclimb-growth-ci.md`
- Hermes cron template: `docs/agent-skill/hermes-cron.md`
