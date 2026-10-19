// Weekly email for free accounts (ADR 0007): the pure part. Free keyword data
// never leaves the browser, so this email is built from Apple's published
// search terms: the week's top riser with its recent history, the biggest
// risers, terms new to Apple's lists, and how each category moved, plus
// what Pro adds. A former Pro user whose synced keywords are still stored
// also sees Apple's numbers for them. No I/O here, so every rule is tested.
//
// Email-safe markup only: tables, inline styles, a bgcolor fallback under
// every gradient, no images or SVG, 600px wide at most, readable at 390px.

import { escapeHtml, formatDay, HONESTY, shiftDay, type DigestEmail } from "@/lib/digest";
import { PRO_YEARLY_PER_MONTH_USD, REFUND_WINDOW_DAYS } from "@/lib/plan";
import {
  GENRE_LABELS,
  matchesStorefrontScript,
  moversFrom,
  normalizeTerm,
  type DatasetGenre,
  type TermDataset,
  type TermHistoryPoint,
  type TermMover,
} from "@/lib/search-terms";

/** Risers shown (the top one in the spotlight), one per category. */
const FREE_RISERS = 8;
const RISERS_PER_CATEGORY = 1;
/** Newcomers shown, at most two per category. */
const FREE_NEWCOMERS = 6;
const NEWCOMERS_PER_CATEGORY = 2;
/** A former Pro user's synced keywords shown. */
const FREE_KEYWORDS = 8;
/** Weeks of Apple history carried per riser (the spotlight's chart). */
export const RISER_HISTORY_WEEKS = 8;
/** Category pulse: the most improved and the most declined categories. */
const PULSE_TOP = 3;
const PULSE_BOTTOM = 2;

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
  /** Explorer link that checks the term. */
  href: string;
  /** The term's public keyword page. */
  pageHref: string;
}

/** A term that entered a category's published list this week. */
export interface DigestNewcomer {
  term: string;
  categoryLabel: string;
  popularity: number;
  href: string;
}

/** Terms on both weeks' lists in one category whose popularity went up or down. */
export interface DigestPulse {
  categoryLabel: string;
  rising: number;
  falling: number;
}

/** Apple's popularity this week for one keyword a former Pro user synced. */
export interface FreeDigestKeyword {
  keyword: string;
  country: string;
  /** Null when the term is below Apple's published list. */
  popularity: number | null;
  popularityChange: number | null;
  /** Explorer link for the keyword in its storefront; optional. */
  href?: string;
}

/** Apple's week for one storefront, shared by every free account's email. */
export interface FreeDigestMarket {
  /** Apple week the numbers belong to (Sunday, YYYY-MM-DD). */
  week: string;
  /** The week everything is compared with. */
  compareWeek: string;
  /** Storefront the data comes from. */
  country: string;
  /** Published terms this week, and the categories they span. */
  termCount: number;
  categoryCount: number;
  /** Terms on both weeks' lists (any category) that rose / fell. */
  rose: number;
  fell: number;
  /** Biggest gain first; the first one is the spotlight. */
  risers: DigestRiser[];
  newcomers: DigestNewcomer[];
  /** Every category with terms on both weeks' lists. */
  pulse: DigestPulse[];
}

export interface FreeDigestInput extends FreeDigestMarket {
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

// ---------------------------------------------------------------------------
// Selection

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
 * The week's biggest risers, one per category so the list spans the store.
 * Ties keep their input order (moversFrom breaks them by rank gain, then
 * popularity).
 */
export function pickRisers<T extends { genre: string; delta: number | null }>(
  rising: readonly T[],
  limit = FREE_RISERS,
  perCategory = RISERS_PER_CATEGORY,
): T[] {
  const gains = rising
    .filter((mover) => (mover.delta ?? 0) > 0)
    .sort((left, right) => (right.delta ?? 0) - (left.delta ?? 0));
  return spreadByCategory(gains, limit, perCategory);
}

/** One term contains the other, e.g. "be my eyes" and "be my eyes – helping the blind". */
function overlaps(left: string, right: string): boolean {
  const a = normalizeTerm(left);
  const b = normalizeTerm(right);
  return a.includes(b) || b.includes(a);
}

/**
 * Risers and newcomers from Apple's latest week and the week before. Terms
 * written in a script the storefront doesn't use are left out. A newcomer
 * entered a category's list this week; it is dropped when it repeats a
 * riser or a more popular newcomer ("centier bank" after "centier bank
 * mobile").
 */
export function marketMovers(
  current: TermDataset,
  previous: TermDataset,
): { risers: TermMover[]; newcomers: TermMover[] } {
  const movers = moversFrom(current, previous, { limit: current.rows.length });
  const fits = (mover: TermMover) => matchesStorefrontScript(mover.term, current.country);
  const risers = pickRisers(movers.rising.filter(fits));
  const newcomers: TermMover[] = [];
  const candidates = movers.newcomers
    .filter(fits)
    .sort((left, right) => right.popularity - left.popularity);
  for (const mover of candidates) {
    if (risers.some((riser) => overlaps(riser.term, mover.term))) continue;
    if (newcomers.some((picked) => overlaps(picked.term, mover.term))) continue;
    newcomers.push(mover);
  }
  return { risers, newcomers: spreadByCategory(newcomers, FREE_NEWCOMERS, NEWCOMERS_PER_CATEGORY) };
}

/**
 * How many terms on both weeks' lists rose and fell, overall and per
 * category (a term listed in two categories counts in each). Categories
 * come most improved first; ties go to the larger rising share.
 */
export function weekPulse(
  current: TermDataset,
  previous: TermDataset,
): { rose: number; fell: number; pulse: Array<DigestPulse & { genre: DatasetGenre }> } {
  const before = new Map<string, number>();
  for (const row of previous.rows) before.set(`${row.genre}:${normalizeTerm(row.term)}`, row.popularity);
  const byGenre = new Map<DatasetGenre, { rising: number; falling: number }>();
  let rose = 0;
  let fell = 0;
  for (const row of current.rows) {
    const old = before.get(`${row.genre}:${normalizeTerm(row.term)}`);
    if (old === undefined) continue;
    const counts = byGenre.get(row.genre) ?? { rising: 0, falling: 0 };
    byGenre.set(row.genre, counts);
    if (row.popularity > old) {
      counts.rising += 1;
      rose += 1;
    } else if (row.popularity < old) {
      counts.falling += 1;
      fell += 1;
    }
  }
  const share = (item: { rising: number; falling: number }) =>
    item.rising + item.falling > 0 ? item.rising / (item.rising + item.falling) : 0;
  const pulse = [...byGenre]
    .filter(([, counts]) => counts.rising + counts.falling > 0)
    .map(([genre, counts]) => ({ genre, categoryLabel: GENRE_LABELS[genre], ...counts }))
    .sort(
      (left, right) =>
        right.rising - right.falling - (left.rising - left.falling) ||
        share(right) - share(left) ||
        left.categoryLabel.localeCompare(right.categoryLabel),
    );
  return { rose, fell, pulse };
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
    const key = `${keyword.country}:${normalizeTerm(keyword.keyword)}`;
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

/** The pulse rows the email shows: the most improved and the most declined. */
export function pulseRows(pulse: readonly DigestPulse[]): DigestPulse[] {
  if (pulse.length <= PULSE_TOP + PULSE_BOTTOM) return [...pulse];
  return [...pulse.slice(0, PULSE_TOP), ...pulse.slice(-PULSE_BOTTOM)];
}

// ---------------------------------------------------------------------------
// Rendering

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = "#17272d";
const MUTED = "#617579";
const SOFT = "#8a969b";
const LINE = "#e6eceb";
const TEAL = "#0c8e88";
const TEAL_DARK = "#0b625f";
const DEEP = "#0a4b4a";
const NIGHT = "#10302f";
const GOLD = "#f4c15d";
const GREEN = "#1f9d6e";
const GREEN_BG = "#e3f5ec";
const RED = "#c4574a";
const RED_BG = "#fdecea";
const CORAL = "#efb8ac";
const TRACK = "#e9efee";

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

function count(value: number): string {
  return value.toLocaleString("en-US");
}

function points(value: number): string {
  return `${value} ${Math.abs(value) === 1 ? "point" : "points"}`;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

const e = escapeHtml;

/** A change as a small pill: green ▲, coral ▼, grey for none. */
function pill(delta: number): string {
  const [color, background, label] =
    delta > 0 ? [GREEN, GREEN_BG, `▲ ${delta}`] : delta < 0 ? [RED, RED_BG, `▼ ${Math.abs(delta)}`] : [SOFT, "#eef1f2", "= 0"];
  return `<span style="display:inline-block;padding:3px 8px;border-radius:999px;background:${background};color:${color};font-size:12px;font-weight:700;white-space:nowrap;">${label}</span>`;
}

function arrowText(delta: number): string {
  return delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${Math.abs(delta)}` : "no change";
}

/**
 * Popularity on a 0–100 track: last week's score in teal, the gain in gold
 * (or the loss in coral), the rest empty.
 */
function track(value: number, previous: number | null): string {
  const now = clamp(value);
  const before = previous === null ? now : clamp(previous);
  const cells: Array<[number, string]> = [
    [Math.min(now, before), TEAL],
    [Math.max(0, now - before), GOLD],
    [Math.max(0, before - now), CORAL],
    [100 - Math.max(now, before), TRACK],
  ];
  const tds = cells
    .filter(([width]) => width > 0)
    .map(
      ([width, color]) =>
        `<td width="${width}%" bgcolor="${color}" style="background:${color};height:8px;font-size:0;line-height:0;">&nbsp;</td>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border-radius:999px;overflow:hidden;"><tr>${tds}</tr></table>`;
}

function sectionTitle(title: string, note: string): string {
  return (
    `<p style="margin:0 0 12px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};">${e(title)}` +
    `<span style="font-weight:500;color:${SOFT};text-transform:none;letter-spacing:0;"> · ${e(note)}</span></p>`
  );
}

function section(body: string, top = 30): string {
  return `
      <tr><td style="padding:${top}px 28px 0;">${body}
      </td></tr>`;
}

function legend(items: Array<[string, string]>): string {
  return `<p style="margin:10px 0 0;font-size:12px;color:${SOFT};">${items
    .map(
      ([color, label]) =>
        `<span style="display:inline-block;width:10px;height:6px;background:${color};border-radius:2px;"></span> ${e(label)}`,
    )
    .join("&nbsp;&nbsp; ")}</p>`;
}

/** One row of a ranked list: label, sub-line and track on the left, score and pill on the right. */
function listRow(options: {
  rank?: number;
  label: string;
  href?: string;
  sub: string;
  popularity: number;
  previous: number | null;
  delta: number | null;
}): string {
  const label = options.href
    ? `<a href="${e(options.href)}" style="font-size:15px;font-weight:700;color:${INK};text-decoration:none;">${e(options.label)}</a>`
    : `<span style="font-size:15px;font-weight:700;color:${INK};">${e(options.label)}</span>`;
  const rank =
    options.rank === undefined
      ? ""
      : `<td width="26" valign="middle" style="padding:12px 0;border-top:1px solid ${LINE};font-size:13px;font-weight:700;color:${SOFT};">${options.rank}</td>`;
  return `
          <tr>${rank}
            <td valign="middle" style="padding:12px 10px 12px 0;border-top:1px solid ${LINE};">
              ${label}
              <div style="font-size:12px;color:${SOFT};margin:2px 0 7px;">${e(options.sub)}</div>
              ${track(options.popularity, options.previous)}
            </td>
            <td width="44" valign="middle" align="right" style="padding:12px 10px 12px 0;border-top:1px solid ${LINE};font-size:20px;font-weight:800;color:${INK};">${options.popularity}</td>
            <td width="58" valign="middle" align="right" style="padding:12px 0;border-top:1px solid ${LINE};">${options.delta === null ? "" : pill(options.delta)}</td>
          </tr>`;
}

function listTable(rows: string[]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">${rows.join("")}
        </table>`;
}

interface Parts {
  html: string[];
  text: string[];
}

function header(input: FreeDigestInput, weekLabel: string, parts: Parts): void {
  const top = input.risers[0];
  const intro = `Apple’s own search popularity for the ${input.country} App Store — ${count(input.termCount)} top searches across ${input.categoryCount} ${input.categoryCount === 1 ? "category" : "categories"}, compared with the week before.`;
  const chip = (value: string, color: string, label: string) =>
    `<td style="padding:10px 12px;background:rgba(255,255,255,.1);border-radius:12px;">` +
    `<div style="font-size:19px;font-weight:800;color:${color};white-space:nowrap;">${e(value)}</div>` +
    `<div style="font-size:11px;color:#a9d0c8;white-space:nowrap;">${e(label)}</div></td>`;
  const chips = [
    chip(`▲ ${count(input.rose)}`, "#7fe0b5", "searches rose"),
    chip(`▼ ${count(input.fell)}`, "#f3a99c", "searches fell"),
    ...(top ? [chip(`+${top.delta}`, "#ffffff", "biggest jump")] : []),
  ].join('<td width="10"></td>');
  parts.html.push(`
      <tr><td bgcolor="${DEEP}" style="background:${DEEP};background-image:radial-gradient(120% 90% at 100% 0%,rgba(111,191,178,.35),transparent 60%),linear-gradient(165deg,#0b625f 0%,#0a4b4a 55%,#10302f 100%);padding:26px 28px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
          <td style="font-size:17px;font-weight:800;color:#ffffff;letter-spacing:-.01em;"><span style="color:${GOLD};">▲</span> AppClimb</td>
          <td align="right" style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#a9d0c8;">Weekly · ${e(weekLabel)}</td>
        </tr></table>
        <p style="margin:22px 0 0;font-size:28px;line-height:1.15;font-weight:800;color:#ffffff;letter-spacing:-.02em;">What moved on the App Store this week</p>
        <p style="margin:10px 0 0;font-size:14px;line-height:1.5;color:#b9dcd5;">${e(intro)}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:18px;"><tr>${chips}</tr></table>
      </td></tr>`);
  parts.text.push(
    `AppClimb weekly · ${weekLabel}`,
    "",
    "What moved on the App Store this week",
    intro,
    [`▲ ${count(input.rose)} searches rose`, `▼ ${count(input.fell)} searches fell`, ...(top ? [`+${top.delta} biggest jump`] : [])].join(" · "),
  );
}

function yourKeywords(input: FreeDigestInput, parts: Parts): void {
  const keywords = pickKeywordMoves(input.keywords);
  if (keywords.length === 0) return;
  const note = input.syncedOn ? `from your last cloud sync, ${formatDay(input.syncedOn)}` : "from your last cloud sync";
  const sub = (keyword: FreeDigestKeyword & { popularity: number }) =>
    keyword.popularityChange === null
      ? `${keyword.country} App Store`
      : `${keyword.country} App Store · was ${keyword.popularity - keyword.popularityChange}`;
  const rows = keywords.map((keyword) =>
    listRow({
      label: keyword.keyword,
      href: keyword.href,
      sub: sub(keyword),
      popularity: keyword.popularity,
      previous: keyword.popularityChange === null ? null : keyword.popularity - keyword.popularityChange,
      delta: keyword.popularityChange,
    }),
  );
  const items: Array<[string, string]> = [[TEAL, "last week"]];
  if (keywords.some((keyword) => (keyword.popularityChange ?? 0) > 0)) items.push([GOLD, "gained this week"]);
  if (keywords.some((keyword) => (keyword.popularityChange ?? 0) < 0)) items.push([CORAL, "lost this week"]);
  parts.html.push(section(`
        ${sectionTitle("Your keywords", note)}
        ${listTable(rows)}
        ${legend(items)}`, 24));
  parts.text.push("", `YOUR KEYWORDS · ${note}`);
  for (const keyword of keywords) {
    const change = keyword.popularityChange === null ? "" : ` (${arrowText(keyword.popularityChange)})`;
    parts.text.push(`  ${keyword.keyword} · ${sub(keyword)}  ${keyword.popularity}${change}`);
  }
}

function spotlight(input: FreeDigestInput, riser: DigestRiser, parts: Parts): void {
  const history = riser.history;
  const where = `${riser.categoryLabel} · ${input.country} App Store`;
  const move = `▲ ${riser.delta} from ${riser.previousPopularity}`;
  const button = `Check “${riser.term}” for your app →`;
  let chart = "";
  let caption = "";
  if (history.length >= 2) {
    const values = history.map((point) => point.popularity);
    const high = Math.max(...values);
    const low = Math.max(0, Math.min(...values) - 10);
    const bars = history
      .map((point) => {
        const latest = point.week === input.week;
        const height = Math.round(14 + ((point.popularity - low) / (high - low || 1)) * 70);
        const color = latest ? GOLD : "#3fa69f";
        return (
          `<td valign="bottom" align="center" style="padding:0 3px;">` +
          `<div style="font-size:11px;font-weight:700;color:${latest ? "#ffffff" : "#a9d0c8"};margin-bottom:4px;">${point.popularity}</div>` +
          `<div style="height:${height}px;background:${color};border-radius:5px 5px 0 0;font-size:0;line-height:0;">&nbsp;</div></td>`
        );
      })
      .join("");
    // Dates get their own row so every bar shares one baseline, even when a
    // label wraps ("Aug" over "16") with eight columns on a phone.
    const dates = history
      .map(
        (point) =>
          `<td valign="top" align="center" style="padding:6px 3px 0;font-size:10px;line-height:1.25;color:#8fc4ba;">${e(formatDay(point.week))}</td>`,
      )
      .join("");
    chart = `
          <tr><td style="padding:18px 16px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="table-layout:fixed;"><tr>${bars}</tr><tr>${dates}</tr></table>
          </td></tr>`;
    caption = `Apple Ads popularity, last ${NUMBER_WORDS[history.length] ?? history.length} published weeks.`;
  }
  parts.html.push(`
      <tr><td style="padding:24px 28px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="${DEEP}" style="background:${DEEP};background-image:linear-gradient(160deg,#0b625f 0%,#0a4b4a 55%,#10302f 100%);border-radius:18px;">
          <tr><td style="padding:22px 22px 8px;">
            <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${GOLD};color:#3d2a05;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;">★ Top riser this week</span>
          </td></tr>
          <tr><td style="padding:6px 22px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
              <td valign="top">
                <p style="margin:0;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-.02em;">“${e(riser.term)}”</p>
                <p style="margin:4px 0 0;font-size:13px;color:#b9dcd5;">${e(where)}</p>
              </td>
              <td valign="top" align="right" style="white-space:nowrap;">
                <p style="margin:0;font-size:40px;line-height:1;font-weight:800;color:#ffffff;letter-spacing:-.03em;">${riser.popularity}</p>
                <p style="margin:6px 0 0;font-size:13px;font-weight:700;color:${GOLD};">${e(move)}</p>
              </td>
            </tr></table>
          </td></tr>${chart}
          <tr><td style="padding:14px 22px 20px;">${caption ? `
            <p style="margin:0 0 14px;font-size:12px;color:#8fc4ba;">${e(caption)}</p>` : ""}
            <a href="${e(riser.href)}" style="display:inline-block;background:#ffffff;color:${TEAL_DARK};text-decoration:none;font-size:14px;font-weight:700;padding:10px 16px;border-radius:10px;">${e(button)}</a>
          </td></tr>
        </table>
      </td></tr>`);
  parts.text.push(
    "",
    "★ TOP RISER THIS WEEK",
    `“${riser.term}” · ${where}`,
    `${riser.popularity} (${move})`,
  );
  if (caption) {
    parts.text.push(
      `${caption} ${history.map((point) => `${formatDay(point.week)} ${point.popularity}`).join(" · ")}`,
    );
  }
  parts.text.push(`${button.replace(/ →$/u, "")}: ${riser.href}`);
}

function risersList(risers: readonly DigestRiser[], parts: Parts): void {
  if (risers.length === 0) return;
  const rows = risers.map((riser, index) =>
    listRow({
      rank: index + 2,
      label: riser.term,
      href: riser.pageHref,
      sub: `${riser.categoryLabel} · was ${riser.previousPopularity}`,
      popularity: riser.popularity,
      previous: riser.previousPopularity,
      delta: riser.delta,
    }),
  );
  parts.html.push(section(`
        ${sectionTitle("Biggest risers", "Apple popularity, 1–100")}
        ${listTable(rows)}
        ${legend([[TEAL, "last week"], [GOLD, "gained this week"]])}`));
  parts.text.push("", "BIGGEST RISERS · Apple popularity, 1–100");
  risers.forEach((riser, index) => {
    parts.text.push(
      `  ${index + 2}. ${riser.term} · ${riser.categoryLabel}  ${riser.popularity} (▲ ${riser.delta}, was ${riser.previousPopularity})  ${riser.pageHref}`,
    );
  });
}

function newcomersChips(newcomers: readonly DigestNewcomer[], parts: Parts): void {
  if (newcomers.length === 0) return;
  const chips = newcomers
    .map(
      (item) =>
        `<a href="${e(item.href)}" style="display:inline-block;margin:0 6px 8px 0;padding:8px 12px;border:1px solid ${LINE};border-radius:12px;background:#fafcfb;text-decoration:none;">` +
        `<span style="font-size:14px;font-weight:700;color:${INK};">${e(item.term)}</span> ` +
        `<span style="font-size:13px;font-weight:800;color:${TEAL};">${item.popularity}</span><br/>` +
        `<span style="font-size:11px;color:${SOFT};">${e(item.categoryLabel)}</span></a>`,
    )
    .join("");
  parts.html.push(section(`
        ${sectionTitle("New on Apple’s list", "entered a category’s top 500")}
        <div>${chips}</div>`));
  parts.text.push("", "NEW ON APPLE’S LIST · entered a category’s top 500");
  for (const item of newcomers) parts.text.push(`  ${item.term} · ${item.categoryLabel}  ${item.popularity}  ${item.href}`);
}

/** The note under a category with more terms rising than falling, worded from the data. */
function leadNote(leaders: number): string {
  return leaders === 1
    ? "Only category with more terms rising than falling"
    : `One of ${leaders} categories with more terms rising than falling`;
}

function pulseSection(pulse: readonly DigestPulse[], parts: Parts): void {
  const rows = pulseRows(pulse);
  if (rows.length === 0) return;
  const leaders = pulse.filter((item) => item.rising > item.falling).length;
  const html = rows.map((item) => {
    const total = item.rising + item.falling;
    const up = Math.round((item.rising / total) * 100);
    const bar = [
      [up, GREEN],
      [100 - up, CORAL],
    ]
      .filter(([width]) => (width as number) > 0)
      .map(
        ([width, color]) =>
          `<td width="${width}%" bgcolor="${color}" style="background:${color};height:10px;font-size:0;line-height:0;">&nbsp;</td>`,
      )
      .join("");
    const note =
      item.rising > item.falling
        ? `<tr><td></td><td colspan="2" style="padding:0 0 6px;font-size:11px;color:${GREEN};font-weight:700;">${e(leadNote(leaders))}</td></tr>`
        : "";
    return `
          <tr>
            <td width="96" valign="middle" style="padding:8px 10px 8px 0;font-size:14px;font-weight:700;color:${INK};">${e(item.categoryLabel)}</td>
            <td valign="middle" style="padding:8px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-radius:999px;overflow:hidden;"><tr>${bar}</tr></table>
            </td>
            <td width="92" valign="middle" align="right" style="padding:8px 0 8px 10px;font-size:12px;white-space:nowrap;">
              <span style="color:${GREEN};font-weight:700;">▲ ${count(item.rising)}</span>&nbsp; <span style="color:${RED};font-weight:700;">▼ ${count(item.falling)}</span>
            </td>
          </tr>${note}`;
  });
  parts.html.push(section(`
        ${sectionTitle("Category pulse", "terms up vs down this week")}
        ${listTable(html)}`));
  parts.text.push("", "CATEGORY PULSE · terms up vs down this week");
  for (const item of rows) {
    const note = item.rising > item.falling ? ` (${leadNote(leaders)})` : "";
    parts.text.push(`  ${item.categoryLabel}  ▲ ${count(item.rising)} ▼ ${count(item.falling)}${note}`);
  }
}

const CTA_NOTE = "Difficulty with its evidence, Apple’s weekly history, and a verdict for any search.";
const PRO_BODY =
  "Rank moves for every keyword you track, Apple popularity for each one, and the risers in your category — every week, synced from any device.";
/** Illustrative rows for the Pro block; always labelled as an example. */
const PRO_EXAMPLE: Array<[string, number, number]> = [
  ["habit tracker", 48, 21],
  ["daily planner", 12, 9],
  ["todo list", 31, 37],
];

function callToAction(siteUrl: string, parts: Parts): void {
  const open = `${siteUrl}/`;
  parts.html.push(`
      <tr><td style="padding:30px 28px 0;" align="center">
        <a href="${e(open)}" style="display:block;background:${TEAL};background-image:linear-gradient(180deg,#0c8e88,#08736f);color:#ffffff;text-decoration:none;font-size:16px;font-weight:800;padding:15px 20px;border-radius:14px;">Find keywords your app can win →</a>
        <p style="margin:8px 0 0;font-size:12px;color:${SOFT};">${e(CTA_NOTE)}</p>
      </td></tr>`);
  parts.text.push("", `Find keywords your app can win: ${open}`, CTA_NOTE);
}

function proBlock(siteUrl: string, parts: Parts): void {
  const pricing = `${siteUrl}/pricing`;
  const button = `See Pro — from $${PRO_YEARLY_PER_MONTH_USD}/month`;
  const guarantee = `${REFUND_WINDOW_DAYS}-day money-back guarantee`;
  const rows = PRO_EXAMPLE.map(([keyword, before, after]) => {
    const delta = before - after;
    return (
      `<tr><td style="padding:7px 0;border-top:1px solid rgba(255,255,255,.1);font-size:13px;color:#e8f6f2;">${e(keyword)}</td>` +
      `<td align="right" style="padding:7px 0;border-top:1px solid rgba(255,255,255,.1);font-size:13px;color:#b9dcd5;white-space:nowrap;">#${before} → <b style="color:#ffffff;">#${after}</b>&nbsp; ` +
      `<span style="color:${delta > 0 ? "#7fe0b5" : "#f3a99c"};font-weight:700;">${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)}</span></td></tr>`
    );
  }).join("");
  parts.html.push(`
      <tr><td style="padding:32px 28px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="${NIGHT}" style="background:${NIGHT};border-radius:18px;">
          <tr><td style="padding:22px 22px 6px;">
            <p style="margin:0;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${GOLD};">✦ With AppClimb Pro</p>
            <p style="margin:8px 0 0;font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-.01em;">This email starts with your own app</p>
            <p style="margin:6px 0 0;font-size:13px;line-height:1.5;color:#b9dcd5;">${e(PRO_BODY)}</p>
          </td></tr>
          <tr><td style="padding:12px 22px 0;">
            <p style="margin:0 0 4px;font-size:11px;color:#8fc4ba;">Example — not your data</p>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">${rows}</table>
          </td></tr>
          <tr><td style="padding:18px 22px 22px;">
            <a href="${e(pricing)}" style="display:inline-block;background:${GOLD};color:#3d2a05;text-decoration:none;font-size:14px;font-weight:800;padding:11px 18px;border-radius:10px;">${e(button)}</a>
            <span style="font-size:12px;color:#8fc4ba;">&nbsp; ${e(guarantee)}</span>
          </td></tr>
        </table>
      </td></tr>`);
  parts.text.push(
    "",
    "✦ WITH APPCLIMB PRO",
    "This email starts with your own app",
    PRO_BODY,
    "Example — not your data:",
    ...PRO_EXAMPLE.map(([keyword, before, after]) => `  ${keyword}  #${before} → #${after}  ${arrowText(before - after)}`),
    `${button} (${guarantee}): ${pricing}`,
  );
}

/** Why the reader gets this, where the numbers come from, and the way out. */
function footer(input: FreeDigestInput, parts: Parts): string {
  const honesty = `${HONESTY} Numbers above are Apple’s published top searches for the weeks of ${formatDay(input.compareWeek)} and ${formatDay(input.week)}.`;
  const reason = "You get this weekly because you have a free AppClimb account.";
  parts.html.push(`
      <tr><td style="padding:28px 28px 30px;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:${SOFT};">
          ${e(honesty)}<br/>
          ${e(reason)} <a href="${e(input.unsubscribeUrl)}" style="color:${MUTED};">Stop these emails</a>.
        </p>
      </td></tr>`);
  parts.text.push("", honesty, reason, `Stop these emails: ${input.unsubscribeUrl}`);
  return honesty;
}

function subjectFor(input: FreeDigestInput, moved: number, weekLabel: string): string {
  if (moved > 0) return `${moved} of your keywords moved — your App Store week`;
  const top = input.risers[0];
  if (top) return `“${top.term}” jumped ${points(top.delta)} — your App Store week`;
  return `Your App Store week of ${weekLabel}`;
}

/** The inbox preview line: how the store moved overall. */
function preheaderFor(input: FreeDigestInput): string {
  const moved = `${count(input.rose)} searches rose and ${count(input.fell)} fell on the ${input.country} App Store.`;
  if (input.pulse.length === 0) return moved;
  const leaders = input.pulse.filter((item) => item.rising > item.falling);
  if (leaders.length === 1) return `${moved} ${leaders[0].categoryLabel} was the only category with more risers than fallers.`;
  if (leaders.length === 0) return `${moved} No category had more risers than fallers.`;
  return `${moved} ${leaders.length} categories had more risers than fallers.`;
}

/**
 * The weekly email for a free account, or null when there is nothing to
 * show (no risers and no Apple-listed synced keywords).
 */
export function buildFreeDigestEmail(input: FreeDigestInput): DigestEmail | null {
  const listed = pickKeywordMoves(input.keywords, Number.POSITIVE_INFINITY);
  if (input.risers.length === 0 && listed.length === 0) return null;
  const weekLabel = formatDay(input.week);
  const moved = listed.filter((keyword) => (keyword.popularityChange ?? 0) !== 0).length;
  const subject = subjectFor(input, moved, weekLabel);
  const preheader = preheaderFor(input);
  const parts: Parts = { html: [], text: [] };
  const [top, ...rest] = input.risers.slice(0, FREE_RISERS);

  header(input, weekLabel, parts);
  yourKeywords(input, parts);
  if (top) spotlight(input, top, parts);
  risersList(rest, parts);
  newcomersChips(input.newcomers.slice(0, FREE_NEWCOMERS), parts);
  pulseSection(input.pulse, parts);
  callToAction(input.siteUrl, parts);
  proBlock(input.siteUrl, parts);
  footer(input, parts);

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(subject)}</title></head>
<body style="margin:0;padding:0;background:#eef3f2;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${e(preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#eef3f2" style="background:#eef3f2;font-family:${FONT};">
  <tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#ffffff" style="max-width:600px;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #dde7e4;">${parts.html.join("")}
    </table>
  </td></tr>
</table>
</body></html>
`;
  return { subject, text: parts.text.join("\n"), html };
}
