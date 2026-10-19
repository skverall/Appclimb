// Weekly email (ADR 0007): the pure part. Pro users get their synced tracker
// plus Apple's latest week; free accounts, whose keywords never leave the
// browser, get the week's biggest risers in Apple's published search terms.
// No I/O here, so every rule is unit-tested.

import {
  matchesStorefrontScript,
  moversFrom,
  normalizeTerm,
  type TermDataset,
  type TermHistoryPoint,
  type TermMover,
} from "@/lib/search-terms";
import type { RankSnapshot, TrackedKeyword, TrackerStore } from "@/lib/tracker";

/** Ranks older than this are called out as stale in the email. */
const STALE_RANK_DAYS = 7;
const MAX_APPS = 5;
const MAX_ROWS = 5;
/** Free email: risers and newcomers shown, and at most this many from one category. */
const FREE_RISERS = 8;
const FREE_NEWCOMERS = 6;
const FREE_PER_CATEGORY = 2;
/** Weeks of Apple history carried per riser (for its mini chart). */
export const RISER_HISTORY_WEEKS = 8;
/** Free email: a former Pro user's synced keywords shown. */
const FREE_KEYWORDS = 8;

export interface DigestKeyword {
  keyword: string;
  /** Apple's score this week; null when the term is below Apple's list. */
  popularity: number | null;
  /** Change since the week before; null when unknown. */
  popularityChange: number | null;
  /** Latest checked position: 1–200, null = outside the top 200, undefined = never checked. */
  position?: number | null;
  /** Position about a week before the latest check (same encoding). */
  previousPosition?: number | null;
}

export interface DigestRisingTerm {
  term: string;
  popularity: number;
  /** Popularity gained over four weeks. */
  delta: number;
  href: string;
}

export interface DigestApp {
  name: string;
  country: string;
  categoryLabel: string | null;
  keywords: DigestKeyword[];
  /** Day of the most recent rank check (YYYY-MM-DD), if any. */
  lastCheckedDate: string | null;
  /** Day the "previous" positions come from. */
  previousDate: string | null;
  rising: DigestRisingTerm[];
}

export interface DigestInput {
  /** Apple week the popularity numbers belong to (Sunday, YYYY-MM-DD). */
  week: string;
  /** Today in UTC (YYYY-MM-DD), for the staleness note. */
  today: string;
  apps: DigestApp[];
  siteUrl: string;
  unsubscribeUrl: string;
}

export interface DigestEmail {
  subject: string;
  text: string;
  html: string;
}

/** A term from Apple's published lists that gained popularity since the week before. */
export interface DigestRiser {
  term: string;
  categoryLabel: string;
  popularity: number;
  /** Apple's popularity in the comparison week (the week before). */
  previousPopularity: number;
  /** Popularity gained since the comparison week. */
  delta: number;
  /**
   * Apple's weekly popularity over the last RISER_HISTORY_WEEKS weeks up to
   * this one, oldest first. Weeks the term wasn't published are absent, and
   * the list is empty when Apple's history couldn't be loaded.
   */
  history: TermHistoryPoint[];
  href: string;
}

/** A term in Apple's lists this week that wasn't in any of them the week before. */
export interface DigestNewcomer {
  term: string;
  categoryLabel: string;
  popularity: number;
  href: string;
}

/** Apple's popularity this week for one keyword a former Pro user synced. */
export interface FreeDigestKeyword {
  keyword: string;
  country: string;
  /** Null when the term is below Apple's published list. */
  popularity: number | null;
  popularityChange: number | null;
}

export interface FreeDigestInput {
  /** Apple week the numbers belong to (Sunday, YYYY-MM-DD). */
  week: string;
  /** The week the risers are compared with. */
  compareWeek: string;
  /** Storefront the risers come from. */
  country: string;
  risers: DigestRiser[];
  newcomers: DigestNewcomer[];
  /**
   * Keywords from the user's last cloud sync. Empty for most free accounts:
   * only a former Pro user can have synced keywords on the server.
   */
  keywords: FreeDigestKeyword[];
  /** Day of that last sync (YYYY-MM-DD). */
  syncedOn: string | null;
  siteUrl: string;
  unsubscribeUrl: string;
}

/** The last snapshot and the one closest to a week before it. */
export function rankPair(
  snapshots: readonly RankSnapshot[],
): { latest: RankSnapshot; previous: RankSnapshot | null } | null {
  if (snapshots.length === 0) return null;
  const sorted = [...snapshots].sort((left, right) => left.date.localeCompare(right.date));
  const latest = sorted[sorted.length - 1];
  const target = shiftDay(latest.date, -7);
  let previous: RankSnapshot | null = null;
  for (const snapshot of sorted) {
    if (snapshot.date >= latest.date) break;
    // Prefer the newest snapshot at least a week old; else the oldest we have.
    if (snapshot.date <= target || previous === null) previous = snapshot;
  }
  return { latest, previous };
}

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Positive = climbed. Entering the top 200 counts as climbing from 201. */
export function rankChange(keyword: DigestKeyword): number | null {
  if (keyword.position === undefined || keyword.previousPosition === undefined) return null;
  const now = keyword.position ?? 201;
  const before = keyword.previousPosition ?? 201;
  if (now === 201 && before === 201) return null;
  return before - now;
}

/** Tracked keywords of one app with their latest and week-earlier positions. */
export function digestKeywordsFor(
  store: TrackerStore,
  appStoreId: string,
  country: string,
): { keywords: Array<Omit<DigestKeyword, "popularity" | "popularityChange">>; lastCheckedDate: string | null; previousDate: string | null } {
  const keywords: Array<Omit<DigestKeyword, "popularity" | "popularityChange">> = [];
  let lastCheckedDate: string | null = null;
  let previousDate: string | null = null;
  const entries = Object.entries(store.keywords).filter(
    ([, keyword]: [string, TrackedKeyword]) =>
      keyword.appStoreId === appStoreId && keyword.country === country,
  );
  for (const [key, keyword] of entries) {
    const pair = rankPair(store.snapshots[key] ?? []);
    if (pair && (!lastCheckedDate || pair.latest.date > lastCheckedDate)) lastCheckedDate = pair.latest.date;
    if (pair?.previous && (!previousDate || pair.previous.date < previousDate)) previousDate = pair.previous.date;
    keywords.push({
      keyword: keyword.keyword,
      position: pair ? pair.latest.position : undefined,
      previousPosition: pair?.previous ? pair.previous.position : undefined,
    });
  }
  return { keywords, lastCheckedDate, previousDate };
}

function formatDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function position(value: number | null | undefined): string {
  if (value === undefined) return "—";
  return value === null ? ">200" : `#${value}`;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

interface AppSummary {
  app: DigestApp;
  climbers: DigestKeyword[];
  fallers: DigestKeyword[];
  popularity: DigestKeyword[];
  inTop10: number;
  inTop200: number;
  checked: number;
  stale: boolean;
}

function summarize(app: DigestApp, today: string): AppSummary {
  const changed = app.keywords
    .map((keyword) => ({ keyword, change: rankChange(keyword) }))
    .filter((item): item is { keyword: DigestKeyword; change: number } => item.change !== null && item.change !== 0);
  const climbers = changed
    .filter((item) => item.change > 0)
    .sort((left, right) => right.change - left.change)
    .slice(0, MAX_ROWS)
    .map((item) => item.keyword);
  const fallers = changed
    .filter((item) => item.change < 0)
    .sort((left, right) => left.change - right.change)
    .slice(0, MAX_ROWS)
    .map((item) => item.keyword);
  const popularity = app.keywords
    .filter((keyword) => keyword.popularityChange !== null && keyword.popularityChange !== 0)
    .sort((left, right) => Math.abs(right.popularityChange ?? 0) - Math.abs(left.popularityChange ?? 0))
    .slice(0, MAX_ROWS);
  const checkedKeywords = app.keywords.filter((keyword) => keyword.position !== undefined);
  return {
    app,
    climbers,
    fallers,
    popularity,
    inTop10: checkedKeywords.filter((keyword) => keyword.position !== null && (keyword.position ?? 999) <= 10).length,
    inTop200: checkedKeywords.filter((keyword) => keyword.position !== null).length,
    checked: checkedKeywords.length,
    stale: app.lastCheckedDate !== null && daysBetween(app.lastCheckedDate, today) > STALE_RANK_DAYS,
  };
}

function subjectFor(summaries: AppSummary[], week: string): string {
  const up = summaries.reduce((sum, item) => sum + item.climbers.length, 0);
  const down = summaries.reduce((sum, item) => sum + item.fallers.length, 0);
  const subject = summaries.length === 1 ? `${summaries[0].app.name}: ` : "Your keywords: ";
  if (up + down > 0) return `${subject}${up} up, ${down} down this week`;
  const moved = summaries.reduce((sum, item) => sum + item.popularity.length, 0);
  if (moved > 0) return `${subject}Apple’s new week moved ${moved} of your keywords`;
  return `${subject}your week of ${formatDay(week)} on the App Store`;
}

const SECTION_TITLE_STYLE =
  "font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#6b777d;margin:16px 0 6px;";
const NOTE_STYLE = "font-size:12px;color:#6b777d;margin:6px 0 0;";
const HONESTY = "Popularity is Apple Ads’ relative 1–100 score, not search volume.";
const PRO_LINE =
  "AppClimb Pro syncs your tracker, and then this email covers your own apps every week: rank changes from your checks and Apple popularity for each keyword you track.";

interface EmailRow {
  left: string;
  right: string;
  /** Small grey label after `left`, e.g. the category. */
  note?: string;
  href?: string;
}

/** A titled two-column table, in both the text and the HTML part. */
function pushRows(text: string[], html: string[], title: string, rows: readonly EmailRow[]): void {
  if (rows.length === 0) return;
  text.push("", title);
  html.push(`<p style="${SECTION_TITLE_STYLE}">${escapeHtml(title)}</p>`);
  html.push('<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">');
  for (const row of rows) {
    const label = row.note ? `${row.left} · ${row.note}` : row.left;
    text.push(`  ${label}  ${row.right}${row.href ? `  ${row.href}` : ""}`);
    const left = row.href
      ? `<a href="${escapeHtml(row.href)}" style="color:#0b5f5a;text-decoration:none;">${escapeHtml(row.left)}</a>`
      : escapeHtml(row.left);
    const note = row.note ? ` <span style="font-size:12px;color:#8a969b;">· ${escapeHtml(row.note)}</span>` : "";
    html.push(
      `<tr><td style="padding:6px 0;border-top:1px solid #eef1f2;font-size:14px;color:#17272d;">${left}${note}</td>` +
        `<td style="padding:6px 0;border-top:1px solid #eef1f2;font-size:14px;color:#3c4a50;text-align:right;white-space:nowrap;">${escapeHtml(row.right)}</td></tr>`,
    );
  }
  html.push("</table>");
}

interface EmailShell {
  subtitle: string;
  sections: readonly string[];
  cta: { label: string; href: string };
  /** HTML between the button and the footer. */
  afterCta?: string;
  footer: string;
  /** Why the reader gets this email. */
  reason: string;
  unsubscribeUrl: string;
}

function renderHtml(shell: EmailShell): string {
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f6f8f9;padding:28px 12px;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e3e8ea;border-radius:16px;padding:28px;">
      <p style="font-size:15px;font-weight:700;color:#0c8e88;margin:0 0 4px;">AppClimb weekly</p>
      <p style="font-size:13px;color:#6b777d;margin:0;">${escapeHtml(shell.subtitle)}</p>
      ${shell.sections.join("\n      ")}
      <p style="margin:28px 0 0;">
        <a href="${escapeHtml(shell.cta.href)}" style="display:inline-block;background:#0c8e88;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;">${escapeHtml(shell.cta.label)}</a>
      </p>${shell.afterCta ? `\n      ${shell.afterCta}` : ""}
      <p style="font-size:12px;color:#8a969b;line-height:1.6;margin:24px 0 0;">
        ${escapeHtml(shell.footer)}<br/>
        ${escapeHtml(shell.reason)} <a href="${escapeHtml(shell.unsubscribeUrl)}" style="color:#6b777d;">Stop these emails</a>.
      </p>
    </div>
  </div>`;
}

/**
 * Build the weekly email, or null when there is nothing worth sending
 * (no tracked keywords at all).
 */
export function buildDigestEmail(input: DigestInput): DigestEmail | null {
  const apps = input.apps.filter((app) => app.keywords.length > 0).slice(0, MAX_APPS);
  if (apps.length === 0) return null;
  const summaries = apps.map((app) => summarize(app, input.today));
  const subject = subjectFor(summaries, input.week);
  const weekLabel = formatDay(input.week);

  const text: string[] = [`AppClimb weekly · Apple data for the week of ${weekLabel}`, ""];
  const html: string[] = [];

  for (const summary of summaries) {
    const { app } = summary;
    const where = [app.country, app.categoryLabel].filter(Boolean).join(" · ");
    text.push(`${app.name} (${where})`);
    html.push(
      `<h2 style="font-size:17px;color:#17272d;margin:28px 0 4px;">${escapeHtml(app.name)}</h2>`,
      `<p style="font-size:13px;color:#6b777d;margin:0 0 12px;">${escapeHtml(where)}</p>`,
    );

    if (summary.checked > 0) {
      const line = `${summary.inTop10} in the top 10 · ${summary.inTop200} of ${summary.checked} in the top 200`;
      const since = summary.app.previousDate
        ? `Ranks from your checks, ${formatDay(summary.app.previousDate)} → ${formatDay(summary.app.lastCheckedDate ?? input.today)}.`
        : `Ranks from your last check, ${formatDay(summary.app.lastCheckedDate ?? input.today)}.`;
      text.push(line, since);
      html.push(
        `<p style="font-size:15px;color:#17272d;font-weight:600;margin:0 0 2px;">${escapeHtml(line)}</p>`,
        `<p style="font-size:12px;color:#6b777d;margin:0 0 12px;">${escapeHtml(since)}</p>`,
      );
    }
    if (summary.stale) {
      const note = `Ranks were last checked ${formatDay(app.lastCheckedDate ?? "")}. Open AppClimb to check today’s.`;
      text.push(note);
      html.push(`<p style="font-size:13px;color:#a8561b;margin:0 0 12px;">${escapeHtml(note)}</p>`);
    }

    const moves = (items: DigestKeyword[]): EmailRow[] =>
      items.map((item) => ({
        left: item.keyword,
        right: `${position(item.previousPosition)} → ${position(item.position)}`,
      }));
    pushRows(text, html, "Climbing", moves(summary.climbers));
    pushRows(text, html, "Falling", moves(summary.fallers));
    pushRows(
      text,
      html,
      "Apple popularity this week",
      summary.popularity.map((item) => ({
        left: item.keyword,
        right: `${item.popularity ?? "—"} (${signed(item.popularityChange ?? 0)})`,
      })),
    );

    if (app.rising.length > 0) {
      const title = `Rising in ${app.categoryLabel ?? "your category"} (4 weeks)`;
      text.push("", title);
      html.push(`<p style="${SECTION_TITLE_STYLE}">${escapeHtml(title)}</p><p style="margin:0;line-height:2;">`);
      for (const term of app.rising) {
        text.push(`  ${term.term}  ${term.popularity} (${signed(term.delta)})  ${term.href}`);
        html.push(
          `<a href="${escapeHtml(term.href)}" style="display:inline-block;margin:0 6px 6px 0;padding:3px 10px;border:1px solid #d7e9e5;border-radius:999px;color:#0b5f5a;text-decoration:none;font-size:13px;">${escapeHtml(term.term)} · ${term.popularity} <span style="color:#24755c;">${escapeHtml(signed(term.delta))}</span></a>`,
        );
      }
      html.push("</p>");
    }
    text.push("");
  }

  const open = `${input.siteUrl}/`;
  const honesty = `${HONESTY} Ranks come from your own checks in AppClimb.`;
  const reason = "You get this weekly because you’re on AppClimb Pro.";
  text.push(`Open your tracker: ${open}`, "", honesty, reason, `Stop these emails: ${input.unsubscribeUrl}`);

  const body = renderHtml({
    subtitle: `Apple data for the week of ${weekLabel}`,
    sections: html,
    cta: { label: "Open your tracker", href: open },
    footer: honesty,
    reason,
    unsubscribeUrl: input.unsubscribeUrl,
  });
  return { subject, text: text.join("\n"), html: body };
}

/** The first `limit` items, at most `perCategory` from one category. */
function spreadByCategory<T extends { genre: string }>(items: readonly T[], limit: number, perCategory: number): T[] {
  const picked: T[] = [];
  const perGenre = new Map<string, number>();
  for (const item of items) {
    if (picked.length >= limit) break;
    const count = perGenre.get(item.genre) ?? 0;
    if (count >= perCategory) continue;
    perGenre.set(item.genre, count + 1);
    picked.push(item);
  }
  return picked;
}

/**
 * The week's biggest risers, at most `perCategory` from one category so one
 * busy category can't fill the email. Ties keep their input order (moversFrom
 * breaks them by rank gain, then popularity).
 */
export function pickRisers<T extends { genre: string; delta: number | null }>(
  rising: readonly T[],
  limit = FREE_RISERS,
  perCategory = FREE_PER_CATEGORY,
): T[] {
  const gains = rising
    .filter((mover) => (mover.delta ?? 0) > 0)
    .sort((left, right) => (right.delta ?? 0) - (left.delta ?? 0));
  return spreadByCategory(gains, limit, perCategory);
}

/**
 * Risers and newcomers for the free email from Apple's latest week and the
 * week before. Terms written in a script the storefront doesn't use are
 * left out. A newcomer must be missing from every category's list the week
 * before, so a term that only changed category isn't "new".
 */
export function marketMovers(
  current: TermDataset,
  previous: TermDataset,
): { risers: TermMover[]; newcomers: TermMover[] } {
  const movers = moversFrom(current, previous, { limit: current.rows.length });
  const fits = (mover: TermMover) => matchesStorefrontScript(mover.term, current.country);
  const newcomers = movers.newcomers
    .filter((mover) => fits(mover) && !previous.byTerm.has(normalizeTerm(mover.term)))
    .sort((left, right) => right.popularity - left.popularity);
  return {
    risers: pickRisers(movers.rising.filter(fits)),
    newcomers: spreadByCategory(newcomers, FREE_NEWCOMERS, FREE_PER_CATEGORY),
  };
}

/** A term's Apple history cut to the `weeks` weeks ending with `throughWeek`. */
export function recentHistory(
  points: readonly TermHistoryPoint[],
  throughWeek: string,
  weeks = RISER_HISTORY_WEEKS,
): TermHistoryPoint[] {
  const from = shiftDay(throughWeek, -7 * (weeks - 1));
  return points.filter((point) => point.week >= from && point.week <= throughWeek);
}

/**
 * A former Pro user's synced keywords that Apple lists this week, once each,
 * biggest popularity moves first.
 */
export function pickKeywordMoves(
  keywords: readonly FreeDigestKeyword[],
  limit = FREE_KEYWORDS,
): Array<FreeDigestKeyword & { popularity: number }> {
  const seen = new Set<string>();
  const listed: Array<FreeDigestKeyword & { popularity: number }> = [];
  for (const keyword of keywords) {
    if (keyword.popularity === null) continue;
    const key = `${keyword.country}:${keyword.keyword.trim().toLocaleLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    listed.push({ ...keyword, popularity: keyword.popularity });
  }
  return listed
    .sort(
      (left, right) =>
        Math.abs(right.popularityChange ?? 0) - Math.abs(left.popularityChange ?? 0) ||
        right.popularity - left.popularity,
    )
    .slice(0, limit);
}

/**
 * The weekly email for a free account: Apple's biggest risers this week
 * (and, for a former Pro user, Apple's numbers for their synced keywords),
 * plus one line on what Pro adds. Null when there is nothing to show.
 */
export function buildFreeDigestEmail(input: FreeDigestInput): DigestEmail | null {
  const listed = pickKeywordMoves(input.keywords, Number.POSITIVE_INFINITY);
  const keywords = listed.slice(0, FREE_KEYWORDS);
  const risers = input.risers.slice(0, FREE_RISERS);
  if (keywords.length === 0 && risers.length === 0) return null;
  const weekLabel = formatDay(input.week);
  const moved = listed.filter((keyword) => (keyword.popularityChange ?? 0) !== 0).length;
  const subject =
    moved > 0
      ? `${moved} of your keywords moved in Apple’s new week`
      : risers.length > 0
        ? `Apple’s latest week: “${risers[0].term}” up ${risers[0].delta} in popularity`
        : `Your keywords in Apple’s week of ${weekLabel}`;

  const text: string[] = [`AppClimb weekly · Apple data for the week of ${weekLabel}`];
  const html: string[] = [];

  if (keywords.length > 0) {
    const severalCountries = new Set(keywords.map((keyword) => keyword.country)).size > 1;
    pushRows(
      text,
      html,
      "Your keywords · Apple popularity this week",
      keywords.map((keyword) => ({
        left: keyword.keyword,
        note: severalCountries ? keyword.country : undefined,
        right:
          keyword.popularityChange === null
            ? `${keyword.popularity}`
            : keyword.popularityChange === 0
              ? `${keyword.popularity} (no change)`
              : `${keyword.popularity} (${signed(keyword.popularityChange)})`,
      })),
    );
    const from = input.syncedOn
      ? `Keywords from your last cloud sync, ${formatDay(input.syncedOn)}.`
      : "Keywords from your last cloud sync.";
    text.push(from);
    html.push(`<p style="${NOTE_STYLE}">${escapeHtml(from)}</p>`);
  }

  if (risers.length > 0) {
    pushRows(
      text,
      html,
      `Biggest risers · ${input.country} App Store`,
      risers.map((riser) => ({
        left: riser.term,
        note: riser.categoryLabel,
        right: `${riser.popularity} (${signed(riser.delta)})`,
        href: riser.href,
      })),
    );
    const how = `From Apple’s published top searches in each category: popularity points gained since the week of ${formatDay(input.compareWeek)}.`;
    text.push(how);
    html.push(`<p style="${NOTE_STYLE}">${escapeHtml(how)}</p>`);
  }

  const open = `${input.siteUrl}/`;
  const pricing = `${input.siteUrl}/pricing`;
  const reason = "You get this weekly because you have a free AppClimb account.";
  const check = "Check any of them for your app (difficulty, Apple’s history, a verdict)";
  html.push(`<p style="font-size:14px;color:#3c4a50;margin:24px 0 0;">${escapeHtml(check)}:</p>`);
  text.push(
    "",
    `${check}: ${open}`,
    "",
    `${PRO_LINE} ${pricing}`,
    "",
    HONESTY,
    reason,
    `Stop these emails: ${input.unsubscribeUrl}`,
  );

  const body = renderHtml({
    subtitle: `Apple data for the week of ${weekLabel}`,
    sections: html,
    cta: { label: "Open the keyword explorer", href: open },
    afterCta: `<p style="font-size:13px;color:#3c4a50;line-height:1.5;margin:20px 0 0;padding:12px 14px;background:#f2f8f7;border-radius:10px;">${escapeHtml(PRO_LINE)} <a href="${escapeHtml(pricing)}" style="color:#0b5f5a;">See Pro</a></p>`,
    footer: HONESTY,
    reason,
    unsubscribeUrl: input.unsubscribeUrl,
  });
  return { subject, text: text.join("\n"), html: body };
}
