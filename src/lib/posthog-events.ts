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
}

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

  return {
    sessionEvent,
    activationEvent,
    eventFlow: [...selected.values()]
      .sort(
        (left, right) => phaseOrder(left.phase) - phaseOrder(right.phase),
      )
      .slice(0, 5),
    detectedEventCount: events.length,
  };
}
