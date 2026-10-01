"use client";

import { useRef, useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Crown } from "lucide-react";

import { formatWeek, Sparkline } from "@/components/keyword-charts";
import { useElementSize } from "@/components/use-element-size";
import type { RankBucketPoint, RankMover } from "@/lib/tracker";

const BANDS = [
  { key: "top10", label: "Top 10", className: "ro-band--top10" },
  { key: "top50", label: "11–50", className: "ro-band--top50" },
  { key: "top200", label: "51–200", className: "ro-band--top200" },
] as const;

type BandKey = (typeof BANDS)[number]["key"];

export interface OverviewTotals {
  tracked: number;
  top10: number;
  top50: number;
  top200: number;
  outside: number;
  unchecked: number;
  averagePosition: number | null;
  best: { keyword: string; normalizedKeyword: string; position: number } | null;
}

/**
 * A change, colored by whether it is good news. Counts read "+2" / "−1";
 * positions read "12.8 places better" so a smaller number never looks bad.
 */
function Change({
  value,
  betterWhen = "up",
  unit = "count",
}: {
  value: number | null;
  betterWhen?: "up" | "down";
  unit?: "count" | "places";
}) {
  if (value === null || Number.isNaN(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return <span className="ro-change ro-change--flat">no change</span>;
  const good = betterWhen === "up" ? rounded > 0 : rounded < 0;
  const size = Math.abs(rounded);
  const text =
    unit === "places"
      ? `${size} ${size === 1 ? "place" : "places"} ${good ? "better" : "worse"}`
      : `${rounded > 0 ? "+" : "−"}${size}`;
  return (
    <span className={`ro-change ${good ? "ro-change--good" : "ro-change--bad"}`}>
      {good ? <ArrowUpRight size={13} aria-hidden="true" /> : <ArrowDownRight size={13} aria-hidden="true" />}
      {text}
    </span>
  );
}

/** One stat in the strip: label, big value, change, and a sparkline. */
function Kpi({
  label,
  value,
  sub,
  spark,
}: {
  label: string;
  value: ReactNode;
  sub: ReactNode;
  spark: ReactNode;
}) {
  return (
    <div className="ro-kpi">
      <span className="ro-kpi-label">{label}</span>
      <strong className="ro-kpi-value">{value}</strong>
      <span className="ro-kpi-sub">{sub}</span>
      <span className="ro-kpi-spark">{spark}</span>
    </div>
  );
}

/**
 * Day indexes to label on the x-axis: every day, every other day, or
 * weekly, counted back from today so the steps stay even.
 */
function dateTicks(count: number, plotWidth: number): number[] {
  const last = count - 1;
  if (last <= 0) return [0];
  const dayWidth = plotWidth / last;
  const step = [1, 2, 7, 14].find((candidate) => candidate * dayWidth >= 72) ?? 14;
  const ticks: number[] = [];
  for (let index = last; index >= 0; index -= step) ticks.unshift(index);
  // The first day always gets a label; drop a neighbour that would crowd it.
  if (ticks[0] !== 0) {
    if (ticks[0] * dayWidth < 72) ticks[0] = 0;
    else ticks.unshift(0);
  }
  return ticks;
}

/** Stacked area of keywords per rank band, one x-step per day. Fills its box. */
function BandChart({ series }: { series: RankBucketPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(ref, { width: 560, height: 190 });
  const [hover, setHover] = useState<number | null>(null);

  const axis = 30;
  const top = 8;
  const bottom = 22;
  const plotWidth = Math.max(10, width - axis - 4);
  const plotHeight = Math.max(40, height - top - bottom);
  const maxTotal = Math.max(1, ...series.map((point) => point.top10 + point.top50 + point.top200));
  const step = series.length > 1 ? plotWidth / (series.length - 1) : plotWidth;
  const x = (index: number) => axis + index * step;
  const y = (value: number) => top + plotHeight - (value / maxTotal) * plotHeight;

  const paths: Array<{ key: BandKey; className: string; d: string }> = [];
  const cumulative = series.map(() => 0);
  for (const band of BANDS) {
    const lower = [...cumulative];
    series.forEach((point, index) => {
      cumulative[index] += point[band.key];
    });
    const upper = series.map((_, index) => `${x(index).toFixed(1)},${y(cumulative[index]).toFixed(1)}`);
    const base = series.map((_, index) => `${x(index).toFixed(1)},${y(lower[index]).toFixed(1)}`).reverse();
    paths.push({ key: band.key, className: band.className, d: `M${upper.join(" L")} L${base.join(" L")} Z` });
  }

  const yTicks = [0, Math.round(maxTotal / 2), maxTotal].filter(
    (value, index, all) => all.indexOf(value) === index,
  );
  const xTicks = dateTicks(series.length, plotWidth);
  const active = hover !== null ? series[hover] : null;
  const tooltipLeft =
    hover !== null ? Math.min(width - 84, Math.max(84, x(hover))) : 0;

  return (
    <div className="ro-chart" ref={ref}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Ranked keywords by band over ${series.length} days, from ${series[0].date} to ${series[series.length - 1].date}`}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const offset = event.clientX - rect.left - axis;
          setHover(Math.min(series.length - 1, Math.max(0, Math.round(offset / step))));
        }}
        onMouseLeave={() => setHover(null)}
      >
        {yTicks.map((value) => (
          <g key={value}>
            <line className="ro-grid" x1={axis} x2={axis + plotWidth} y1={y(value)} y2={y(value)} />
            <text className="ro-tick" x={axis - 8} y={y(value) + 4} textAnchor="end">
              {value}
            </text>
          </g>
        ))}
        {paths.map((path) => (
          <path key={path.key} d={path.d} className={`ro-area ${path.className}`} />
        ))}
        {hover !== null && (
          <line
            className="ro-cursor"
            x1={x(hover)}
            x2={x(hover)}
            y1={top}
            y2={top + plotHeight}
          />
        )}
        {xTicks.map((index, position) => (
          <text
            key={index}
            className="ro-tick"
            x={x(index)}
            y={height - 4}
            textAnchor={position === 0 ? "start" : position === xTicks.length - 1 ? "end" : "middle"}
          >
            {formatWeek(series[index].date)}
          </text>
        ))}
      </svg>
      {active && (
        <div className="ro-tooltip" style={{ left: tooltipLeft }}>
          <strong>{formatWeek(active.date)}</strong>
          {BANDS.map((band) => (
            <span key={band.key}>
              <i className={`ro-swatch ${band.className}`} aria-hidden="true" />
              {band.label}
              <b>{active[band.key]}</b>
            </span>
          ))}
          <span>
            <i className="ro-swatch ro-band--outside" aria-hidden="true" />
            Not in top 200
            <b>{active.outside}</b>
          </span>
        </div>
      )}
    </div>
  );
}

/* ---------- Movers ---------- */

const TRACK_WIDTH = 104;
const TRACK_END = TRACK_WIDTH - 16;

/** 1–200 on a log scale, so movement near the top reads as big as it is; >200 sits apart at the end. */
function trackX(position: number | null): number {
  if (position === null || position > 200) return TRACK_WIDTH - 5;
  return 4 + (Math.log(Math.max(1, position)) / Math.log(200)) * (TRACK_END - 4);
}

/** "#1 ——○————●— >200": hollow dot where it was, filled dot where it is now. */
function RankTrack({ mover }: { mover: RankMover }) {
  const from = trackX(mover.from);
  const to = trackX(mover.to);
  const color = mover.change > 0 ? "var(--green-500)" : "var(--coral-500)";
  return (
    <svg className="ro-track" width={TRACK_WIDTH} height={16} viewBox={`0 0 ${TRACK_WIDTH} 16`} aria-hidden="true">
      <line x1={4} x2={TRACK_END} y1={8} y2={8} className="ro-track-base" />
      <circle cx={TRACK_WIDTH - 5} cy={8} r={1.6} className="ro-track-out" />
      {[10, 50].map((tick) => (
        <line key={tick} x1={trackX(tick)} x2={trackX(tick)} y1={5} y2={11} className="ro-track-tick" />
      ))}
      <line x1={from} x2={to} y1={8} y2={8} stroke={color} strokeWidth={3} strokeLinecap="round" />
      <circle cx={from} cy={8} r={3.6} fill="var(--card)" stroke={color} strokeWidth={1.8} />
      <circle cx={to} cy={8} r={4.4} fill={color} />
    </svg>
  );
}

function rankLabel(position: number | null): string {
  return position === null ? ">200" : `#${position}`;
}

function MoverRow({
  mover,
  onSelect,
}: {
  mover: RankMover;
  onSelect: (normalizedKeyword: string) => void;
}) {
  const up = mover.change > 0;
  // Entering or leaving the top 200 has no honest place count.
  const badge =
    mover.from === null ? "New" : mover.to === null ? "Out" : `${up ? "+" : "−"}${Math.abs(mover.change)}`;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(mover.normalizedKeyword)}
        title={`${mover.keyword}: ${rankLabel(mover.from)} → ${rankLabel(mover.to)}`}
      >
        <span className="ro-mover-term">{mover.keyword}</span>
        <RankTrack mover={mover} />
        <span className="ro-mover-path">
          <span>{rankLabel(mover.from)}</span>
          <span aria-hidden="true">→</span>
          <b>{rankLabel(mover.to)}</b>
        </span>
        <span className={`ro-mover-change ${up ? "is-up" : "is-down"}`}>{badge}</span>
      </button>
    </li>
  );
}

function MoverList({
  direction,
  movers,
  days,
  onSelect,
}: {
  direction: "up" | "down";
  movers: RankMover[];
  days: number;
  onSelect: (normalizedKeyword: string) => void;
}) {
  return (
    <div className={`ro-movers ro-movers--${direction}`}>
      <h3>
        {direction === "up" ? (
          <ArrowUpRight size={15} aria-hidden="true" />
        ) : (
          <ArrowDownRight size={15} aria-hidden="true" />
        )}
        {direction === "up" ? "Climbing" : "Falling"}
      </h3>
      {movers.length > 0 ? (
        <ul>
          {movers.map((mover) => (
            <MoverRow key={mover.normalizedKeyword} mover={mover} onSelect={onSelect} />
          ))}
        </ul>
      ) : (
        <p className="ro-muted">
          {direction === "up" ? "Nothing climbed" : "Nothing dropped"} in the last {days} days.
        </p>
      )}
    </div>
  );
}

/* ---------- Overview ---------- */

export function RankingsOverview({
  totals,
  series,
  movers,
  days,
  onDaysChange,
  onSelectKeyword,
}: {
  totals: OverviewTotals;
  series: RankBucketPoint[];
  movers: { up: RankMover[]; down: RankMover[] };
  days: 7 | 30;
  onDaysChange: (days: 7 | 30) => void;
  onSelectKeyword: (normalizedKeyword: string) => void;
}) {
  const ranked = totals.top10 + totals.top50 + totals.top200;
  const first = series[0];
  const last = series[series.length - 1];
  const hasTrend = series.length >= 2;
  const rankedOf = (point: RankBucketPoint) => point.top10 + point.top50 + point.top200;
  const delta = (pick: (point: RankBucketPoint) => number | null): number | null => {
    if (!hasTrend || !first || !last) return null;
    const start = pick(first);
    const end = pick(last);
    return start === null || end === null ? null : end - start;
  };
  // Positions are drawn inverted (201 − position) so every sparkline rises on good news.
  const inverted = (pick: (point: RankBucketPoint) => number | null) =>
    series.flatMap((point) => {
      const value = pick(point);
      return value === null ? [] : [201 - value];
    });
  const segments = [
    { key: "top10", label: "Top 10", value: totals.top10, className: "ro-band--top10" },
    { key: "top50", label: "11–50", value: totals.top50, className: "ro-band--top50" },
    { key: "top200", label: "51–200", value: totals.top200, className: "ro-band--top200" },
    { key: "outside", label: "Not in top 200", value: totals.outside, className: "ro-band--outside" },
    { key: "unchecked", label: "Not checked", value: totals.unchecked, className: "ro-band--unchecked" },
  ].filter((segment) => segment.value > 0 || segment.key === "top10");

  return (
    <section className="ro" aria-labelledby="ro-title">
      <div className="ro-head">
        <h2 id="ro-title">Rankings</h2>
        <div className="ro-head-right">
          {hasTrend && first && <span className="ro-since">Changes since {formatWeek(first.date)}</span>}
          <div className="ro-period" role="group" aria-label="History period">
            {([7, 30] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={days === value}
                className={days === value ? "is-active" : undefined}
                onClick={() => onDaysChange(value)}
              >
                {value} days
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="ro-kpis">
        <Kpi
          label="In the top 200"
          value={
            <>
              {ranked}
              <small>of {totals.tracked}</small>
            </>
          }
          sub={<Change value={delta(rankedOf)} />}
          spark={
            <Sparkline
              values={series.map(rankedOf)}
              width={88}
              height={32}
              bounds={[0, 100000]}
              minSpan={4}
              label="Keywords in the top 200 per day"
            />
          }
        />
        <Kpi
          label="In the top 10"
          value={totals.top10}
          sub={<Change value={delta((point) => point.top10)} />}
          spark={
            <Sparkline
              values={series.map((point) => point.top10)}
              width={88}
              height={32}
              bounds={[0, 100000]}
              minSpan={4}
              label="Keywords in the top 10 per day"
            />
          }
        />
        <Kpi
          label="Average position"
          value={totals.averagePosition !== null ? `#${totals.averagePosition}` : "—"}
          sub={<Change value={delta((point) => point.averagePosition)} betterWhen="down" unit="places" />}
          spark={
            <Sparkline
              values={inverted((point) => point.averagePosition)}
              width={88}
              height={32}
              bounds={[0, 200]}
              label="Average position per day, higher is better"
            />
          }
        />
        <Kpi
          label="Best position"
          value={
            totals.best ? (
              <>
                {totals.best.position === 1 && <Crown size={17} aria-hidden="true" />}#{totals.best.position}
              </>
            ) : (
              "—"
            )
          }
          sub={
            totals.best ? (
              <button
                type="button"
                className="ro-kpi-link"
                onClick={() => onSelectKeyword(totals.best!.normalizedKeyword)}
              >
                {totals.best.keyword}
              </button>
            ) : null
          }
          spark={
            <Sparkline
              values={inverted((point) => point.best)}
              width={88}
              height={32}
              bounds={[0, 200]}
              minSpan={4}
              label="Best position per day, higher is better"
            />
          }
        />
      </div>

      <div className={`ro-body${hasTrend ? "" : " ro-body--single"}`}>
        <div className="ro-main">
          <h3 className="ro-caption">Where your keywords rank today</h3>
          <div className="ro-dist-bar" aria-hidden="true">
            {segments.map((segment) =>
              segment.value > 0 ? (
                <i
                  key={segment.key}
                  className={segment.className}
                  style={{ flexGrow: segment.value }}
                  title={`${segment.label}: ${segment.value}`}
                />
              ) : null,
            )}
          </div>
          <ul className="ro-legend">
            {segments.map((segment) => (
              <li key={segment.key}>
                <i className={`ro-swatch ${segment.className}`} aria-hidden="true" />
                {segment.label}
                <b>{segment.value}</b>
              </li>
            ))}
          </ul>
          {hasTrend ? (
            <>
              <h3 className="ro-caption ro-caption--chart">Day by day</h3>
              <BandChart series={series} />
            </>
          ) : (
            <p className="ro-empty">
              The daily chart, changes, and biggest climbers and fallers appear once rankings have been
              checked on two different days. Checks run automatically when you open this app.
            </p>
          )}
        </div>

        {hasTrend && (
          <aside className="ro-side" aria-label="Biggest moves">
            <MoverList direction="up" movers={movers.up} days={days} onSelect={onSelectKeyword} />
            <MoverList direction="down" movers={movers.down} days={days} onSelect={onSelectKeyword} />
          </aside>
        )}
      </div>
    </section>
  );
}
