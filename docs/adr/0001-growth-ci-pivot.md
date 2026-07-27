# ADR 0001: Pivot AppClimb to Growth CI

**Date:** 2026-07-28  
**Status:** Accepted  
**Archive ref:** `archive/pre-growth-ci-2026-07-28`

## Context

The River Atlas prototype assembled many growth surfaces (Pulse, Diagnose, Lab,
AI Visibility, Acquisition Atlas, Rank Terrain, multi-platform paths). That
breadth diluted the product promise and outpaced reliable live-data completion
for the founding iOS subscription wedge.

Founders of AI-built iOS apps already have coding agents. They need an
independent referee that answers: **did this release help subscription growth?**

## Decision

Reposition AppClimb as **Growth CI for AI-built iOS subscription apps**:

1. Core sources: RevenueCat + PostHog only for measurement activation.
2. One closed loop: release → verdict → one incident → one agent task → verify.
3. Agents are external (Hermes/Codex/Grok/Claude); AppClimb owns truth and memory.
4. Retire multi-product navigation and non-core surfaces from the active product
   without destroying legacy data or billing/auth foundations.

## Consequences

### Positive

- One clear promise and UI mental model.
- Deterministic, testable release evaluation.
- Portable agent integration without hosting models.
- Safer scope for production verification.

### Tradeoffs / risks

- Existing users of prototype surfaces lose those UIs (data retained).
- Low-volume apps will often see `collecting` / `inconclusive` — by design.
- RevenueCat unsegmented series remain supporting signals, not causal proof.
- MCP adapter may lag HTTP + skill if Workers MCP pin is not production-stable.

### Non-goals reaffirmed

No Android, web SaaS product, industry benchmarks, autonomous merge/deploy,
user-level joins without contract, or proprietary coding agent.

## Rollback

Restore product surfaces from git history at `archive/pre-growth-ci-2026-07-28`.
D1 migrations are additive; do not rewrite applied migrations. Disable via
`GROWTH_CI_ENABLED=false` if needed without schema rollback.
