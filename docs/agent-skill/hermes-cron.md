# Hermes cron template for AppClimb Growth CI

Hermes cron sessions are fresh. Paste this as a self-contained scheduled prompt.

```text
At the scheduled time:
1. Call AppClimb GET /v1/agent/tasks/next using APPCLIMB_AGENT_TOKEN
   (API base from APPCLIMB_API_BASE, default https://appclimb.app/api).
2. If the response is 204, output NO_ACTION and make no repository changes.
3. If a task exists, claim it atomically via POST /v1/agent/tasks/:id/claim.
4. Open the configured repository/worktree.
5. Read AGENTS.md, appclimb.yml if present, and the task packet.
6. Create a branch appclimb/<task-id>-<slug>.
7. Implement only the bounded task. Do not merge or deploy.
8. Run the project’s required tests.
9. Report branch, commit, tests, summary, and optional PR URL to AppClimb
   via POST /v1/agent/tasks/:id/events with event_type=change_submitted
   and a unique X-Idempotency-Key.
10. If blocked, report event_type=blocked with a short reason and stop.
    Never fabricate completion.
```

Notes:

- A submitted PR is not deployment. Deployment is reported separately after a
  human ships, via `deployment_reported` and/or `POST /v1/agent/releases`.
- Verification is AppClimb’s job from production data, not the agent’s claim.
