"use client";

import { useId } from "react";

import type { KeywordHistoryPoint } from "@/lib/aso";

function buildPath(values: number[], width: number, height: number): string {
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  return values
    .map((value, index) => {
      const x = index * stepX;
      const y = height - ((value - min) / span) * (height - 2) - 1;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Compact polyline used in the keyword table's Trend column. */
export function Sparkline({
  values,
  width = 96,
  height = 30,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length === 0) return <span className="sparkline-empty">—</span>;
  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label="Popularity trend"
    >
      <path
        d={buildPath(values, width, height)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Area chart for the keyword detail panel (0–100 metric over time). */
export function TrendChart({
  points,
  valueKey = "popularity",
  color,
  height = 180,
}: {
  points: KeywordHistoryPoint[];
  valueKey?: "popularity" | "difficulty";
  color: string;
  height?: number;
}) {
  const gradientId = useId();
  const width = 640;
  const values = points.map((point) => point[valueKey]);
  const path = buildPath(values, width, height);
  const areaPath = `${path} L${width},${height} L0,${height} Z`;
  const first = points[0]?.date ?? "";
  const last = points[points.length - 1]?.date ?? "";

  return (
    <svg
      className="trend-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${valueKey} over the last ${points.length} days`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {[25, 50, 75].map((tick) => (
        <line
          key={tick}
          className="trend-chart-grid"
          x1="0"
          x2={width}
          y1={(height / 100) * tick}
          y2={(height / 100) * tick}
        />
      ))}
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text x="0" y={height - 6} className="trend-chart-label">
        {first}
      </text>
      <text x={width} y={height - 6} className="trend-chart-label trend-chart-label-end">
        {last}
      </text>
    </svg>
  );
}
