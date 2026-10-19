/**
 * The keyword map's grouped view: every tracked keyword sorted into the same
 * verdicts the explorer shows (assessOpportunity), with a plain sentence on
 * what to do with each group. Pure, so the grouping and the summary line are
 * unit-tested.
 */

import type { OpportunityVerdict } from "./aso";

export interface KeywordMapEntry {
  keyword: string;
  normalizedKeyword: string;
  /** Apple popularity; for long-tail terms the ceiling (shown as ≤N). */
  popularity: number;
  longTail: boolean;
  difficulty: number;
  /** 1–200, or null when outside the first 200. */
  position: number | null;
  verdict: OpportunityVerdict;
  /** 0–100 ranking aid (opportunityScore); null when unknown. */
  opportunity: number | null;
}

export type RankBand = "top10" | "top50" | "top200" | "outside";

export interface MapGroupSpec {
  id: OpportunityVerdict;
  title: string;
  /** What to do with keywords in this group, in one sentence. */
  action: string;
  tone: "good" | "calm" | "warn" | "muted" | "bad";
}

export const MAP_GROUPS: readonly MapGroupSpec[] = [
  {
    id: "target",
    title: "Worth targeting",
    action: "Real Apple demand and a first page you can beat. Put these in your title, subtitle and keyword field.",
    tone: "good",
  },
  {
    id: "longtail_win",
    title: "Long-tail wins",
    action: "Fewer searches, but a weak first page. Quick ranks — good fillers for the keyword field.",
    tone: "calm",
  },
  {
    id: "competitive",
    title: "Competitive",
    action: "Real demand, strong first page. Worth it once you have ratings and a strong title.",
    tone: "warn",
  },
  {
    id: "low_demand",
    title: "Low demand",
    action: "Few searches and a crowded first page. Usually not worth a keyword slot.",
    tone: "muted",
  },
  {
    id: "dominated",
    title: "Dominated",
    action: "Held by entrenched apps or a brand search. Skip unless you are that brand.",
    tone: "bad",
  },
];

/** Same bands as the rankings overview. */
export function rankBand(position: number | null): RankBand {
  if (position === null || position > 200) return "outside";
  if (position <= 10) return "top10";
  if (position <= 50) return "top50";
  return "top200";
}

export function rankLabel(position: number | null): string {
  return position === null || position > 200 ? "Not in top 200" : `#${position}`;
}

export function popularityLabel(entry: Pick<KeywordMapEntry, "popularity" | "longTail">): string {
  return entry.longTail ? `≤${entry.popularity}` : String(entry.popularity);
}

export interface MapGroup extends MapGroupSpec {
  entries: KeywordMapEntry[];
}

/** Non-empty groups in priority order; best opportunities first inside each. */
export function groupKeywordMap(entries: readonly KeywordMapEntry[]): MapGroup[] {
  return MAP_GROUPS.map((spec) => ({
    ...spec,
    entries: entries
      .filter((entry) => entry.verdict === spec.id)
      .sort(
        (left, right) =>
          (right.opportunity ?? -1) - (left.opportunity ?? -1) ||
          right.popularity - left.popularity ||
          left.keyword.localeCompare(right.keyword),
      ),
  })).filter((group) => group.entries.length > 0);
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** One sentence that says where to focus, from the groups as they stand. */
export function mapSummary(entries: readonly KeywordMapEntry[]): string {
  const of = (verdict: OpportunityVerdict) => entries.filter((entry) => entry.verdict === verdict);
  const notTop10 = (list: KeywordMapEntry[]) => list.filter((entry) => rankBand(entry.position) !== "top10");
  const targets = of("target");
  const longtail = of("longtail_win");

  if (targets.length > 0) {
    const open = notTop10(targets).length;
    const head = `${plural(targets.length, "keyword is", "keywords are")} worth targeting`;
    if (open === 0) return `${head}, and you're already in the top 10 for all of them. Look for new ones next.`;
    if (open === targets.length) {
      return `${head} — you're not in the top 10 for ${targets.length === 1 ? "it" : "any of them"} yet. Start there.`;
    }
    return `${head} — you're not in the top 10 for ${open} of them yet. Start there.`;
  }
  if (longtail.length > 0) {
    const open = notTop10(longtail).length;
    const head = "No keyword has both real Apple demand and a beatable first page yet.";
    if (longtail.length === 1) {
      return open === 0
        ? `${head} Your long-tail win already ranks in the top 10 — look for more like it.`
        : `${head} Your long-tail win is the quickest rank — you're not in the top 10 for it yet.`;
    }
    if (open === 0) {
      return `${head} You're in the top 10 for all ${longtail.length} long-tail wins — look for more like them.`;
    }
    return `${head} Of your ${longtail.length} long-tail wins — the quickest ranks — ${open} aren't in your top 10 yet. Start there.`;
  }
  return "None of these keywords has a first page you can easily beat. Try longer, more specific phrases in the explorer.";
}
