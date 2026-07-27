export interface PostHogEventCandidate {
  name: string;
  eventCount: number;
  uniqueUsers: number;
  lastSeenAt?: string;
}

export interface PostHogFlowStep {
  event: string;
  label: string;
  phase: "visit" | "value" | "habit" | "monetize";
}

export interface PostHogAutoMap {
  sessionEvent: string;
  activationEvent: string;
  eventFlow: PostHogFlowStep[];
  detectedEventCount: number;
  /** Deterministic 0–1 score, never an AI guess. See {@link mappingConfidence}. */
  confidence: number;
  milestoneEvents: PostHogMilestoneEvent[];
}

/**
 * Mapping lifecycle (Decision System V2, Task P0.19).
 *
 * Auto-mapping must never be invisible magic: every automatic map starts as
 * `automatic_unconfirmed` and only becomes `confirmed` after the user reviews
 * it. `mode` records who chose the events; `status` records whether the choice
 * is trusted yet.
 */
export type PostHogMappingMode = "automatic" | "manual";

export type PostHogMappingStatus =
  | "automatic_unconfirmed"
  | "confirmed"
  | "insufficient_events"
  | "invalid";

/** The subset of `MappingStatus` in `src/lib/contracts.ts` a source reports. */
export type PostHogMappingContractStatus =
  | PostHogMappingStatus
  | "manual";

export interface PostHogMilestoneEvent {
  event: string;
  label: string;
  role: string;
}

export interface PostHogMapping {
  mode: PostHogMappingMode;
  status: PostHogMappingStatus;
  confidence: number;
  sessionEvent?: string;
  activationEvent?: string;
  milestoneEvents: PostHogMilestoneEvent[];
  detectedEventCount: number;
  confirmedAt?: string;
}

/** Days a new user gets to reach the activation event before the cohort closes. */
export const DEFAULT_ACTIVATION_WINDOW_DAYS = 7;

const negativePattern =
  /(cancel|fail|error|exception|delete|dismiss|denied|expired|limit|gate|prompt|shown|viewed)/iu;
const systemPattern = /^\$/u;

const sessionPatterns = [
  /\$(pageview|screen|autocapture|session_start)/iu,
  /(^|_)(app_?open|session_?(start|started)|screen_?view|page_?view)($|_)/iu,
  /(^|_)(launch|launched|app_?opened|opened_?app)($|_)/iu,
];

const activationPatterns = [
  { pattern: /(^|_)first($|_)/iu, score: 60 },
  {
    pattern:
      /(^|_)(onboarding|setup)_(complete|completed|finish|finished)($|_)/iu,
    score: 50,
  },
  {
    pattern:
      /(^|_)(create|created|add|added|complete|completed|generate|generated|import|imported|upload|uploaded|publish|published)($|_)/iu,
    score: 42,
  },
  {
    pattern:
      /(^|_)(share|shared|invite|invited|save|saved|export|exported|scan|scanned)($|_)/iu,
    score: 32,
  },
];

function normalizedVolume(event: PostHogEventCandidate) {
  return Math.log10(Math.max(1, event.uniqueUsers)) * 4;
}

function sessionScore(event: PostHogEventCandidate) {
  const patternIndex = sessionPatterns.findIndex((pattern) =>
    pattern.test(event.name),
  );
  const patternScore =
    patternIndex >= 0 ? 90 - patternIndex * 12 : systemPattern.test(event.name) ? 8 : 16;
  return patternScore + normalizedVolume(event);
}

function activationScore(event: PostHogEventCandidate) {
  if (negativePattern.test(event.name)) return -100;
  const semantic = activationPatterns.reduce(
    (best, candidate) =>
      candidate.pattern.test(event.name) ? Math.max(best, candidate.score) : best,
    systemPattern.test(event.name) ? -20 : 4,
  );
  return semantic + normalizedVolume(event);
}

function flowPhase(name: string): PostHogFlowStep["phase"] {
  if (
    /(purchase|checkout|subscribe|subscription|trial|paywall|paid|renew)/iu.test(
      name,
    )
  ) {
    return "monetize";
  }
  if (sessionPatterns.some((pattern) => pattern.test(name))) return "visit";
  if (/(share|export|invite|return|session|active|open)/iu.test(name)) {
    return "habit";
  }
  return "value";
}

function phaseOrder(phase: PostHogFlowStep["phase"]) {
  return { visit: 0, value: 1, habit: 2, monetize: 3 }[phase];
}

/** Readable name for a milestone role. Milestone reach is not an ordered funnel. */
export function milestoneRoleLabel(role: string) {
  switch (role) {
    case "visit":
      return "Active use";
    case "value":
      return "First value";
    case "habit":
      return "Repeat use";
    case "monetize":
      return "Monetization";
    default:
      return "Product milestone";
  }
}

function candidateFor(
  events: PostHogEventCandidate[],
  name: string,
): PostHogEventCandidate | undefined {
  return events.find((event) => event.name === name);
}

function bucket(value: number, tiers: Array<[number, number]>) {
  for (const [threshold, score] of tiers) {
    if (value >= threshold) return score;
  }
  return 0;
}

/**
 * Deterministic mapping confidence in the range 0–1.
 *
 * The score only rewards evidence AppClimb actually observed: how strongly the
 * chosen names match known session/activation shapes, how many distinct events
 * the project emits, and how many unique users each chosen event reached. It
 * never invents a number for events that are missing from the project.
 */
export function mappingConfidence(
  events: PostHogEventCandidate[],
  sessionEvent: string,
  activationEvent: string,
): number {
  const session = candidateFor(events, sessionEvent);
  const activation = candidateFor(events, activationEvent);
  if (!session || !activation || sessionEvent === activationEvent) return 0;

  const sessionPatternIndex = sessionPatterns.findIndex((pattern) =>
    pattern.test(sessionEvent),
  );
  const sessionShape =
    sessionPatternIndex >= 0 ? 0.3 - sessionPatternIndex * 0.06 : 0.05;

  const activationSemantic = activationPatterns.reduce(
    (best, candidate) =>
      candidate.pattern.test(activationEvent)
        ? Math.max(best, candidate.score)
        : best,
    0,
  );
  const activationShape = bucket(activationSemantic, [
    [60, 0.3],
    [50, 0.26],
    [42, 0.22],
    [32, 0.16],
  ]) || 0.05;

  const breadth = bucket(events.length, [
    [8, 0.15],
    [4, 0.1],
    [2, 0.05],
  ]);
  const sessionVolume = bucket(session.uniqueUsers, [
    [50, 0.15],
    [10, 0.1],
    [1, 0.05],
  ]);
  const activationVolume = bucket(activation.uniqueUsers, [
    [25, 0.1],
    [5, 0.06],
    [1, 0.03],
  ]);

  const total =
    sessionShape + activationShape + breadth + sessionVolume + activationVolume;
  return Math.round(Math.min(1, Math.max(0, total)) * 100) / 100;
}

export function humanizePostHogEvent(name: string) {
  return name
    .replace(/^\$/u, "")
    .replace(/[_\-.]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/^\p{L}/u, (letter) => letter.toUpperCase());
}

export function autoMapPostHogEvents(
  input: PostHogEventCandidate[],
): PostHogAutoMap {
  const events = input
    .filter(
      (event) =>
        event.name.trim() &&
        Number.isFinite(event.eventCount) &&
        Number.isFinite(event.uniqueUsers),
    )
    .sort((left, right) => right.eventCount - left.eventCount);
  if (!events.length) {
    return {
      sessionEvent: "",
      activationEvent: "",
      eventFlow: [],
      detectedEventCount: 0,
      confidence: 0,
      milestoneEvents: [],
    };
  }

  const sessionEvent = [...events].sort(
    (left, right) => sessionScore(right) - sessionScore(left),
  )[0]?.name ?? "";
  const activationCandidates = [...events]
    .filter((event) => event.name !== sessionEvent)
    .sort((left, right) => activationScore(right) - activationScore(left));
  const activationEvent =
    activationCandidates.find((event) => activationScore(event) > 8)?.name ??
    activationCandidates[0]?.name ??
    sessionEvent;

  const selected = new Map<string, PostHogFlowStep>();
  const add = (eventName: string) => {
    const event = events.find((candidate) => candidate.name === eventName);
    if (!event || negativePattern.test(event.name) || selected.has(event.name)) {
      return;
    }
    selected.set(event.name, {
      event: event.name,
      label: humanizePostHogEvent(event.name),
      phase: flowPhase(event.name),
    });
  };
  add(sessionEvent);
  add(activationEvent);
  const ranked = [...events].sort(
    (left, right) => activationScore(right) - activationScore(left),
  );
  for (const phase of ["habit", "monetize", "value", "visit"] as const) {
    const candidate = ranked.find((event) => flowPhase(event.name) === phase);
    if (candidate) add(candidate.name);
    if (selected.size >= 5) break;
  }
  for (const event of ranked) {
    add(event.name);
    if (selected.size >= 5) break;
  }

  const eventFlow = [...selected.values()]
    .sort((left, right) => phaseOrder(left.phase) - phaseOrder(right.phase))
    .slice(0, 5);

  return {
    sessionEvent,
    activationEvent,
    eventFlow,
    detectedEventCount: events.length,
    confidence: mappingConfidence(events, sessionEvent, activationEvent),
    milestoneEvents: milestoneEventsFrom(eventFlow),
  };
}

/**
 * Milestone reach candidates. These are unique-reach signals per event, never
 * an ordered funnel: an event later in this list is not a subset of an earlier
 * one, so drop-off between two entries is not a valid conversion.
 */
export function milestoneEventsFrom(
  eventFlow: PostHogFlowStep[],
): PostHogMilestoneEvent[] {
  return eventFlow.map((step) => ({
    event: step.event,
    label: step.label || humanizePostHogEvent(step.event),
    role: step.phase,
  }));
}

function normalizedMilestones(value: unknown): PostHogMilestoneEvent[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const milestones: PostHogMilestoneEvent[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const event =
      typeof item.event === "string"
        ? item.event.trim()
        : typeof item.name === "string"
          ? item.name.trim()
          : "";
    if (!event || seen.has(event)) continue;
    seen.add(event);
    const label =
      typeof item.label === "string" && item.label.trim()
        ? item.label.trim().slice(0, 80)
        : humanizePostHogEvent(event);
    const role =
      typeof item.role === "string" && item.role.trim()
        ? item.role.trim().slice(0, 24)
        : typeof item.phase === "string" && item.phase.trim()
          ? item.phase.trim().slice(0, 24)
          : "value";
    milestones.push({ event, label, role });
    if (milestones.length >= 5) break;
  }
  return milestones;
}

/**
 * Build the persisted mapping for a connection.
 *
 * `events` is the list actually observed in the project window. When it is
 * empty the mapping is `insufficient_events` — not an error and not a failed
 * connection (Task P0.22). When a chosen event is absent from the project the
 * mapping is `invalid`, so the UI can ask for a replacement instead of quietly
 * reporting zero.
 */
export function buildPostHogMapping(
  events: PostHogEventCandidate[],
  overrides: {
    mode?: PostHogMappingMode;
    sessionEvent?: string;
    activationEvent?: string;
    milestoneEvents?: unknown;
    confirmedAt?: string;
  } = {},
): PostHogMapping {
  const mode: PostHogMappingMode = overrides.mode ?? "automatic";
  const hasExplicitChoice = Boolean(
    overrides.sessionEvent?.trim() || overrides.activationEvent?.trim(),
  );
  const automatic = hasExplicitChoice ? null : autoMapPostHogEvents(events);
  const sessionEvent = (
    overrides.sessionEvent?.trim() ||
    automatic?.sessionEvent ||
    ""
  ).trim();
  const activationEvent = (
    overrides.activationEvent?.trim() ||
    automatic?.activationEvent ||
    ""
  ).trim();
  const milestoneEvents = overrides.milestoneEvents
    ? normalizedMilestones(overrides.milestoneEvents)
    : (automatic?.milestoneEvents ?? []);

  const detectedEventCount = events.length;
  const known = new Set(events.map((event) => event.name));

  let status: PostHogMappingStatus;
  if (detectedEventCount === 0) {
    status = "insufficient_events";
  } else if (
    !sessionEvent ||
    !activationEvent ||
    sessionEvent === activationEvent ||
    !known.has(sessionEvent) ||
    !known.has(activationEvent)
  ) {
    status = "invalid";
  } else if (overrides.confirmedAt) {
    status = "confirmed";
  } else {
    status = "automatic_unconfirmed";
  }

  return {
    mode,
    status,
    confidence:
      status === "insufficient_events" || status === "invalid"
        ? 0
        : mappingConfidence(events, sessionEvent, activationEvent),
    ...(sessionEvent ? { sessionEvent } : {}),
    ...(activationEvent ? { activationEvent } : {}),
    milestoneEvents: milestoneEvents.filter(
      (milestone) => detectedEventCount === 0 || known.has(milestone.event),
    ),
    detectedEventCount,
    ...(status === "confirmed" && overrides.confirmedAt
      ? { confirmedAt: overrides.confirmedAt }
      : {}),
  };
}

/**
 * Collapse the mapping into the single `MappingStatus` a `SourceConnection`
 * carries. A manually chosen, confirmed mapping reports `manual` so the UI can
 * tell "the user picked this" apart from "AppClimb picked this and the user
 * agreed".
 */
export function postHogMappingContractStatus(
  mapping: PostHogMapping,
): PostHogMappingContractStatus {
  if (mapping.status === "confirmed" && mapping.mode === "manual") {
    return "manual";
  }
  return mapping.status;
}

/** True when the workspace still owes AppClimb a mapping decision. */
export function postHogMappingNeedsAttention(mapping: PostHogMapping) {
  return mapping.status !== "confirmed";
}
