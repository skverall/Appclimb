"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Crown } from "lucide-react";

import { formatWeek, Sparkline } from "@/components/keyword-charts";
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
  suffix,
}: {
  value: number | null;
  betterWhen?: "up" | "down";
  unit?: "count" | "places";
  suffix?: string;
}) {
  if (value === null || Number.isNaN(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  const tail = suffix ? <small> {suffix}</small> : null;
  if (rounded === 0) {
    return (
      <span className="ro-change ro-change--flat">
        no change{tail}
      </span>
    );
  }
  const good = betterWhen === "up" ? rounded > 0 : rounded < 0;
  const text =
    unit === "places"
      ? `${Math.abs(rounded)} ${Math.abs(rounded) === 1 ? "place" : "places"} ${good ? "better" : "worse"}`
      : `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}`;
  return (
    <span className={`ro-change ${good ? "ro-change--good" : "ro-change--bad"}`}>
      {text}
      {tail}
    </span>
  );
}

/** Stacked area of keywords per rank band, one x-step per day. */
function BandChart({ series }: { series: RankBucketPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const height = 150;
  const axis = 26;
  const plotWidth = Math.max(10, width - axis);
  const plotHeight = height - 20;
  const maxTotal = Math.max(1, ...series.map((point) => point.top10 + point.top50 + point.top200));
  const step = series.length > 1 ? plotWidth / (series.length - 1) : plotWidth;
  const y = (value: number) => plotHeight - (value / maxTotal) * (plotHeight - 6);

  const paths: Array<{ key: BandKey; d: string }> = [];
  {
    const cumulative = series.map(() => 0);
    for (const band of BANDS) {
      const lower = [...cumulative];
      series.forEach((point, index) => {
        cumulative[index] += point[band.key];
      });
      const top = series.map((_, index) => `${(index * step).toFixed(1)},${y(cumulative[index]).toFixed(1)}`);
      const bottom = series
        .map((_, index) => `${(index * step).toFixed(1)},${y(lower[index]).toFixed(1)}`)
        .reverse();
      paths.push({ key: band.key, d: `M${top.join(" L")} L${bottom.join(" L")} Z` });
    }
  }

  const active = hover !== null ? series[hover] : null;
  const ticks = [maxTotal, Math.round(maxTotal / 2), 0].filter(
    (value, index, all) => all.indexOf(value) === index,
  );

  return (
    <div className="ro-chart" ref={ref}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Ranked keywords by band over ${series.length} days, from ${series[0].date} to ${series[series.length - 1].date}`}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width) * width - axis;
          setHover(Math.min(series.length - 1, Math.max(0, Math.round(x / step))));
        }}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((value) => (
          <g key={value}>
            <line className="ro-grid" x1={axis} x2={width} y1={y(value)} y2={y(value)} />
            <text className="ro-tick" x={axis - 6} y={y(value) + 4} textAnchor="end">
              {value}
            </text>
          </g>
        ))}
        <g transform={`translate(${axis} 0)`}>
          {paths.map((path) => (
            <path
              key={path.key}
              d={path.d}
              className={`ro-area ${BANDS.find((band) => band.key === path.key)?.className}`}
            />
          ))}
          {hover !== null && (
            <line
              x1={hover * step}
              x2={hover * step}
              y1={0}
              y2={plotHeight}
              stroke="var(--ink)"
              strokeOpacity={0.35}
              strokeDasharray="3 3"
            />
          )}
        </g>
        <text className="ro-tick" x={axis} y={height - 2}>
          {formatWeek(series[0].date)}
        </text>
        <text className="ro-tick" x={width} y={height - 2} textAnchor="end">
          {formatWeek(series[series.length - 1].date)}
        </text>
      </svg>
      {active && hover !== null && (
        <div
          className="ro-tooltip"
          style={{ left: `${((hover * step + axis) / width) * 100}%` }}
        >
          <strong>{formatWeek(active.date)}</strong>
          {BANDS.map((band) => (
            <span key={band.key}>
              <i className={`ro-swatch ${band.className}`} aria-hidden="true" />
              {band.label} <b>{active[band.key]}</b>
            </span>
          ))}
          <span>
            Not in top 200 <b>{active.outside}</b>
          </span>
        </div>
      )}
    </div>
  );
}

/** Position on a log scale so movement near the top reads as big as it is. */
function trackX(position: number | null, width: number): number {
  const value = position === null ? 201 : Math.min(201, Math.max(1, position));
  return 3 + (Math.log(value) / Math.log(201)) * (width - 6);
}

/** "#1 ——●——○ #200": hollow dot where it was, filled dot where it is now. */
function RankTrack({ mover }: { mover: RankMover }) {
  const width = 76;
  const from = trackX(mover.from, width);
  const to = trackX(mover.to, width);
  const color = mover.change > 0 ? "var(--green-500)" : "var(--coral-500)";
  return (
    <svg
      className="ro-track"
      width={width}
      height={14}
      viewBox={`0 0 ${width} 14`}
      role="img"
      aria-label={`From ${mover.from === null ? "outside the top 200" : `#${mover.from}`} to ${
        mover.to === null ? "outside the top 200" : `#${mover.to}`
      }`}
    >
      <line x1={3} x2={width - 3} y1={7} y2={7} stroke="var(--n-200)" strokeWidth={2} strokeLinecap="round" />
      <line x1={from} x2={to} y1={7} y2={7} stroke={color} strokeWidth={3} strokeLinecap="round" />
      <circle cx={from} cy={7} r={3.2} fill="var(--card)" stroke={color} strokeWidth={1.6} />
      <circle cx={to} cy={7} r={4} fill={color} />
    </svg>
  );
}

function MoverRow({
  mover,
  onSelect,
}: {
  mover: RankMover;
  onSelect: (normalizedKeyword: string) => void;
}) {
  const label = (position: number | null) => (position === null ? ">200" : `#${position}`);
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(mover.normalizedKeyword)}
        title={`${mover.keyword}: ${label(mover.from)} → ${label(mover.to)}`}
      >
        <span className="ro-mover-term">{mover.keyword}</span>
        <RankTrack mover={mover} />
        <span className="ro-mover-to">{label(mover.to)}</span>
        <span className={`ro-mover-change ${mover.change > 0 ? "is-up" : "is-down"}`}>
          {mover.change > 0 ? "+" : "−"}
          {Math.abs(mover.change)}
        </span>
      </button>
    </li>
  );
}

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
  const rankedChange =
    hasTrend && first && last
      ? last.top10 + last.top50 + last.top200 - (first.top10 + first.top50 + first.top200)
      : null;
  const top10Change = hasTrend && first && last ? last.top10 - first.top10 : null;
  const outsideChange = hasTrend && first && last ? last.outside - first.outside : null;
  const averageChange =
    hasTrend && first?.averagePosition != null && last?.averagePosition != null
      ? last.averagePosition - first.averagePosition
      : null;
  const since = hasTrend && first ? `since ${formatWeek(first.date)}` : undefined;
  const segments = [
    { key: "top10", label: "Top 10", value: totals.top10, className: "ro-band--top10" },
    { key: "top50", label: "11–50", value: totals.top50, className: "ro-band--top50" },
    { key: "top200", label: "51–200", value: totals.top200, className: "ro-band--top200" },
    { key: "outside", label: "Not in top 200", value: totals.outside, className: "ro-band--outside" },
    { key: "unchecked", label: "Not checked", value: totals.unchecked, className: "ro-band--unchecked" },
  ].filter((segment) => segment.value > 0 || segment.key === "top10");

  return (
    <section className="ro" aria-labelledby="ro-title">
      <div className="ro-main">
        <div className="ro-head">
          <div>
            <h2 id="ro-title">Rankings</h2>
            <p className="ro-headline">
              <strong>{ranked}</strong> of {totals.tracked} keywords rank in the top 200
              <Change value={rankedChange} suffix={since} />
            </p>
          </div>
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

        <div className="ro-dist" aria-label="Where your keywords rank today">
          <div className="ro-dist-bar">
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
                {segment.label} <b>{segment.value}</b>
              </li>
            ))}
          </ul>
        </div>

        {hasTrend ? (
          <BandChart series={series} />
        ) : (
          <p className="ro-empty">
            The trend chart starts once rankings have been checked on two different days. Checks run
            automatically when you open this app.
          </p>
        )}
      </div>

      <aside className="ro-side">
        <div className="ro-kpis">
          <div className="ro-kpi">
            <span>In the top 10</span>
            <strong>{totals.top10}</strong>
            <Change value={top10Change} />
            <div className="ro-kpi-spark">
              <Sparkline values={series.map((point) => point.top10)} width={70} height={24} label="Top 10 keywords per day" />
            </div>
          </div>
          <div className="ro-kpi">
            <span>Average position</span>
            <strong>{totals.averagePosition !== null ? `#${totals.averagePosition}` : "—"}</strong>
            <Change value={averageChange} betterWhen="down" unit="places" />
            <div className="ro-kpi-spark">
              {/* Inverted so the line rises when the average position improves. */}
              <Sparkline
                values={series
                  .filter((point) => point.averagePosition !== null)
                  .map((point) => Math.round(201 - (point.averagePosition ?? 201)))}
                width={70}
                height={24}
                label="Average position, higher is better"
              />
            </div>
          </div>
          <div className="ro-kpi">
            <span>Best position</span>
            {totals.best ? (
              <>
                <strong>
                  {totals.best.position === 1 && <Crown size={15} aria-hidden="true" />}#
                  {totals.best.position}
                </strong>
                <button
                  type="button"
                  className="ro-kpi-link"
                  onClick={() => onSelectKeyword(totals.best!.normalizedKeyword)}
                >
                  {totals.best.keyword}
                </button>
              </>
            ) : (
              <strong>—</strong>
            )}
          </div>
          <div className="ro-kpi">
            <span>Not in top 200</span>
            <strong>{totals.outside}</strong>
            <Change value={outsideChange} betterWhen="down" />
            <div className="ro-kpi-spark">
              <Sparkline
                values={series.map((point) => point.outside)}
                width={70}
                height={24}
                tone="coral"
                label="Keywords outside the top 200 per day"
              />
            </div>
          </div>
        </div>

        <div className="ro-movers">
          <div>
            <h3>
              <ArrowUpRight size={15} aria-hidden="true" /> Climbing
            </h3>
            {movers.up.length > 0 ? (
              <ul>
                {movers.up.map((mover) => (
                  <MoverRow key={mover.normalizedKeyword} mover={mover} onSelect={onSelectKeyword} />
                ))}
              </ul>
            ) : (
              <p className="ro-muted">Nothing climbed in the last {days} days.</p>
            )}
          </div>
          <div>
            <h3>
              <ArrowDownRight size={15} aria-hidden="true" /> Falling
            </h3>
            {movers.down.length > 0 ? (
              <ul>
                {movers.down.map((mover) => (
                  <MoverRow key={mover.normalizedKeyword} mover={mover} onSelect={onSelectKeyword} />
                ))}
              </ul>
            ) : (
              <p className="ro-muted">Nothing dropped in the last {days} days.</p>
            )}
          </div>
        </div>
      </aside>
    </section>
  );
}
