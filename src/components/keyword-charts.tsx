"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeywordHistoryPoint } from "@/lib/aso";

/**
 * Y-axis domain around the data with a minimum span, so a real move from
 * 50 to 56 is visible without turning ±1 noise into a cliff.
 */
export function chartDomain(
  values: readonly number[],
  minSpan = 12,
  bounds: [number, number] = [0, 100],
): [number, number] {
  if (values.length === 0) return bounds;
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  const pad = (hi - lo) * 0.12;
  lo = Math.max(bounds[0], Math.floor(lo - pad));
  hi = Math.min(bounds[1], Math.ceil(hi + pad));
  if (hi - lo < 1) hi = lo + 1;
  return [lo, hi];
}

function pathFor(
  values: readonly number[],
  width: number,
  height: number,
  [lo, hi]: [number, number],
  inset = 3,
): { line: string; points: Array<{ x: number; y: number }> } {
  const span = hi - lo || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values.map((value, index) => ({
    x: values.length > 1 ? index * stepX : width / 2,
    y: inset + (1 - (value - lo) / span) * (height - inset * 2),
  }));
  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");
  return { line, points };
}

/** Compact trend line for table rows. */
export function Sparkline({
  values,
  width = 72,
  height = 24,
  label = "Trend",
  tone = "teal",
  bounds = [0, 100],
  minSpan = 10,
}: {
  values: number[];
  width?: number;
  height?: number;
  label?: string;
  tone?: "teal" | "coral" | "ink";
  /** Value range the domain may not leave (defaults to Apple's 0–100). */
  bounds?: [number, number];
  minSpan?: number;
}) {
  const gradientId = useId();
  if (values.length < 2) return <span className="sparkline-empty">—</span>;
  const domain = chartDomain(values, minSpan, bounds);
  const { line, points } = pathFor(values, width, height, domain);
  const last = points[points.length - 1];
  const color =
    tone === "coral" ? "var(--coral-500)" : tone === "ink" ? "var(--n-700)" : "var(--teal-500)";
  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`${label}: ${values[0]} to ${values[values.length - 1]}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r={2.2} fill={color} />
    </svg>
  );
}

export interface ChartPoint {
  label: string;
  value: number;
}

/**
 * Line chart with a labeled y-axis and hover readout. `invert` puts small
 * values on top (for rank positions, where #1 is best).
 */
export function LineChart({
  points,
  color,
  valueLabel,
  height = 168,
  invert = false,
  domain: fixedDomain,
  formatValue = (value) => String(value),
}: {
  points: ChartPoint[];
  color: string;
  valueLabel: string;
  height?: number;
  invert?: boolean;
  domain?: [number, number];
  formatValue?: (value: number) => string;
}) {
  const gradientId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  // Draw at the container's real width so tick labels stay legible on phones.
  const [width, setWidth] = useState(640);
  const hasPoints = points.length > 0;
  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasPoints]);
  const axis = 34;
  const plotWidth = width - axis;
  const [hover, setHover] = useState<number | null>(null);
  const values = useMemo(() => points.map((point) => point.value), [points]);
  const domain = useMemo(
    () => fixedDomain ?? chartDomain(values, 12, invert ? [1, 200] : [0, 100]),
    [fixedDomain, values, invert],
  );
  const plotted = useMemo(
    () => (invert ? values.map((value) => domain[0] + domain[1] - value) : values),
    [values, invert, domain],
  );
  const { line, points: coords } = useMemo(
    () => pathFor(plotted, plotWidth, height - 22, domain, 8),
    [plotted, plotWidth, height, domain],
  );
  const ticks = useMemo(() => {
    const [lo, hi] = domain;
    const mid = Math.round((lo + hi) / 2);
    return [hi, mid, lo].map((value) => ({
      value: invert ? domain[0] + domain[1] - value : value,
      y: 8 + (1 - (value - lo) / (hi - lo || 1)) * (height - 22 - 16),
    }));
  }, [domain, height, invert]);

  if (points.length === 0) {
    return <div className="line-chart-empty">No data yet</div>;
  }
  const active = hover !== null ? coords[hover] : null;

  return (
    <div className="line-chart" ref={containerRef}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${valueLabel}: ${points.length} points from ${points[0].label} to ${points[points.length - 1].label}`}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - rect.left) / rect.width) * width - axis;
          const step = points.length > 1 ? plotWidth / (points.length - 1) : plotWidth;
          setHover(Math.min(points.length - 1, Math.max(0, Math.round(x / step))));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {ticks.map((tick) => (
          <g key={`${tick.value}-${tick.y}`}>
            <line className="line-chart-grid" x1={axis} x2={width} y1={tick.y} y2={tick.y} />
            <text className="line-chart-tick" x={axis - 6} y={tick.y + 4} textAnchor="end">
              {formatValue(tick.value)}
            </text>
          </g>
        ))}
        <g transform={`translate(${axis} 0)`}>
          {coords.length > 1 && (
            <path
              d={`${line} L${plotWidth},${height - 22} L0,${height - 22} Z`}
              fill={`url(#${gradientId})`}
            />
          )}
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {coords.length === 1 && <circle cx={coords[0].x} cy={coords[0].y} r={4} fill={color} />}
          {active && (
            <g>
              <line
                x1={active.x}
                x2={active.x}
                y1={4}
                y2={height - 22}
                stroke="var(--line-strong)"
                strokeDasharray="3 3"
              />
              <circle cx={active.x} cy={active.y} r={4.5} fill="#fff" stroke={color} strokeWidth={2} />
            </g>
          )}
        </g>
        <text className="line-chart-tick" x={axis} y={height - 4}>
          {points[0].label}
        </text>
        <text className="line-chart-tick" x={width} y={height - 4} textAnchor="end">
          {points[points.length - 1].label}
        </text>
      </svg>
      {active && hover !== null && (
        <div
          className="line-chart-tooltip"
          style={{
            left: `${((active.x + axis) / width) * 100}%`,
            top: `${(active.y / height) * 100}%`,
          }}
        >
          <span>{points[hover].label}</span>
          <strong style={{ color }}>{formatValue(points[hover].value)}</strong>
          <small>{valueLabel}</small>
        </div>
      )}
    </div>
  );
}

/** Daily snapshot chart (tracker detail): popularity or difficulty by date. */
export function TrendChart({
  points,
  valueKey = "popularity",
  color,
  height = 168,
}: {
  points: KeywordHistoryPoint[];
  valueKey?: "popularity" | "difficulty";
  color: string;
  height?: number;
}) {
  return (
    <LineChart
      points={points.map((point) => ({ label: point.date, value: point[valueKey] }))}
      color={color}
      valueLabel={valueKey}
      height={height}
    />
  );
}

/** "Sep 20" from an ISO week start. */
export function formatWeek(week: string): string {
  const date = new Date(`${week}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return week;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
