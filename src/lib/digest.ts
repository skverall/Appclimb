// Weekly email for Pro users (ADR 0007): the pure part. Turns a user's synced
// tracker plus Apple's latest week into a short, honest email. No I/O here,
// so every rule is unit-tested.

import type { RankSnapshot, TrackedKeyword, TrackerStore } from "@/lib/tracker";

/** Ranks older than this are called out as stale in the email. */
const STALE_RANK_DAYS = 7;
const MAX_APPS = 5;
const MAX_ROWS = 5;

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

    const rows = (title: string, items: DigestKeyword[], render: (item: DigestKeyword) => [string, string]) => {
      if (items.length === 0) return;
      text.push("", title);
      html.push(`<p style="font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#6b777d;margin:16px 0 6px;">${escapeHtml(title)}</p>`);
      html.push('<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">');
      for (const item of items) {
        const [left, right] = render(item);
        text.push(`  ${left}  ${right}`);
        html.push(
          `<tr><td style="padding:6px 0;border-top:1px solid #eef1f2;font-size:14px;color:#17272d;">${escapeHtml(left)}</td>` +
            `<td style="padding:6px 0;border-top:1px solid #eef1f2;font-size:14px;color:#3c4a50;text-align:right;white-space:nowrap;">${escapeHtml(right)}</td></tr>`,
        );
      }
      html.push("</table>");
    };

    rows("Climbing", summary.climbers, (item) => [
      item.keyword,
      `${position(item.previousPosition)} → ${position(item.position)}`,
    ]);
    rows("Falling", summary.fallers, (item) => [
      item.keyword,
      `${position(item.previousPosition)} → ${position(item.position)}`,
    ]);
    rows("Apple popularity this week", summary.popularity, (item) => [
      item.keyword,
      `${item.popularity ?? "—"} (${signed(item.popularityChange ?? 0)})`,
    ]);

    if (app.rising.length > 0) {
      const title = `Rising in ${app.categoryLabel ?? "your category"} (4 weeks)`;
      text.push("", title);
      html.push(`<p style="font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#6b777d;margin:16px 0 6px;">${escapeHtml(title)}</p><p style="margin:0;line-height:2;">`);
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
  const honesty =
    "Popularity is Apple Ads’ relative 1–100 score, not search volume. Ranks come from your own checks in AppClimb.";
  text.push(
    `Open your tracker: ${open}`,
    "",
    honesty,
    "You get this weekly because you’re on AppClimb Pro.",
    `Stop these emails: ${input.unsubscribeUrl}`,
  );

  const body = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f6f8f9;padding:28px 12px;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e3e8ea;border-radius:16px;padding:28px;">
      <p style="font-size:15px;font-weight:700;color:#0c8e88;margin:0 0 4px;">AppClimb weekly</p>
      <p style="font-size:13px;color:#6b777d;margin:0;">Apple data for the week of ${escapeHtml(weekLabel)}</p>
      ${html.join("\n      ")}
      <p style="margin:28px 0 0;">
        <a href="${escapeHtml(open)}" style="display:inline-block;background:#0c8e88;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;">Open your tracker</a>
      </p>
      <p style="font-size:12px;color:#8a969b;line-height:1.6;margin:24px 0 0;">
        ${escapeHtml(honesty)}<br/>
        You get this weekly because you’re on AppClimb Pro. <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#6b777d;">Stop these emails</a>.
      </p>
    </div>
  </div>`;

  return { subject, text: text.join("\n"), html: body };
}
