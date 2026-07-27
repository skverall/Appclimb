# AppClimb Growth CI — Agent Skill

Use this skill when working on an iOS subscription app measured by AppClimb.

## Environment

```bash
export APPCLIMB_AGENT_TOKEN="acagt_..."   # created in AppClimb Settings → Agent Bridge
export APPCLIMB_API_BASE="https://appclimb.app/api"  # or staging API base
```

Never commit the raw token. Never print source credentials (AppClimb never
returns them on agent endpoints).

## Contract

1. `GET $APPCLIMB_API_BASE/v1/agent/tasks/next`
   - `204` → output `NO_ACTION` and make **no** repository changes
   - `200` → JSON task packet
2. Claim: `POST .../v1/agent/tasks/:id/claim` with body
   `{ "agent": "hermes|codex|grok|claude", "agent_version": "..." }`
3. Implement only the bounded task. Prefer smallest reversible change.
4. **Do not** merge, deploy, change prices, products, entitlements, or paywalls.
5. Report: `POST .../v1/agent/tasks/:id/events` with header `X-Idempotency-Key`
   and `event_type` one of:
   `work_started` | `blocked` | `change_submitted` | `tests_completed` |
   `deployment_reported` | `note`
6. After human deploy: `POST .../v1/agent/releases` with version/build and
   optional `task_id`.
7. Poll `GET .../v1/agent/tasks/:id/verification` until outcome is terminal.

Claims are **not** proof. Tests passing are **not** proof. Only production
cohort verification closes the incident.

## Example: next task

```bash
curl -sS -H "Authorization: Bearer $APPCLIMB_AGENT_TOKEN" \
  "$APPCLIMB_API_BASE/v1/agent/tasks/next" -w "\n%{http_code}\n"
```

## Example: claim

```bash
curl -sS -X POST -H "Authorization: Bearer $APPCLIMB_AGENT_TOKEN" \
  -H "content-type: application/json" \
  -d '{"agent":"hermes","agent_version":"1.0"}' \
  "$APPCLIMB_API_BASE/v1/agent/tasks/TASK_ID/claim"
```

## Example: change submitted

```bash
curl -sS -X POST -H "Authorization: Bearer $APPCLIMB_AGENT_TOKEN" \
  -H "content-type: application/json" \
  -H "X-Idempotency-Key: change-$(date +%s)" \
  -d '{
    "event_type":"change_submitted",
    "payload":{
      "branch_name":"appclimb/agtask-xxx-activation",
      "commit_sha":"abc1234",
      "tests_run":"npm test",
      "change_summary":"Restored activation event on first-value path"
    }
  }' \
  "$APPCLIMB_API_BASE/v1/agent/tasks/TASK_ID/events"
```

## Safety rules

- No `merge_without_human_approval`
- No `deploy_without_human_approval`
- No credential exfiltration
- No fabricated completion when blocked
- If blocked, report `blocked` with a short reason and stop
