"use client";

import { useId, useMemo, useState } from "react";
import type { KeywordHistoryPoint } from "@/lib/aso";

function buildPath(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  return values
    .map((value, index) => {
      const x = index * stepX;
      const y = height - ((value - min) / span) * (height - 6) - 3;
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
  const gradientId = useId();
  if (values.length === 0) return <span className="sparkline-empty">—</span>;

  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const path = buildPath(values, width, height);
  const areaPath = `${path} L${width},${height} L0,${height} Z`;
  const lastVal = values[values.length - 1];
  const lastY = height - ((lastVal - min) / span) * (height - 6) - 3;

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label="Popularity trend"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--teal-500)" stopOpacity={0.24} />
          <stop offset="100%" stopColor="var(--teal-500)" stopOpacity={0.0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={path}
        fill="none"
        stroke="var(--teal-500)"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={width}
        cy={lastY}
        r={2.2}
        fill="var(--teal-500)"
        className="sparkline-dot"
      />
    </svg>
  );
}

/** Interactive area chart for the keyword detail panel (0–100 metric over time). */
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
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const values = useMemo(() => points.map((p) => p[valueKey]), [points, valueKey]);
  const max = useMemo(() => (values.length > 0 ? Math.max(...values, 0) : 100), [values]);
  const min = useMemo(() => (values.length > 0 ? Math.min(...values, 0) : 0), [values]);
  const span = max - min || 1;
  const stepX = points.length > 1 ? width / (points.length - 1) : width;

  const coords = useMemo(() => {
    return points.map((point, index) => {
      const val = point[valueKey];
      const x = index * stepX;
      const y = height - ((val - min) / span) * (height - 24) - 12;
      return { x, y, point, val };
    });
  }, [points, valueKey, min, span, stepX, height]);

  const path = useMemo(() => {
    return coords
      .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
      .join(" ");
  }, [coords]);

  const areaPath = useMemo(() => {
    if (coords.length === 0) return "";
    return `${path} L${width},${height} L0,${height} Z`;
  }, [path, width, height, coords.length]);

  const first = points[0]?.date ?? "";
  const last = points[points.length - 1]?.date ?? "";
  const activeCoord = hoverIndex !== null && coords[hoverIndex] ? coords[hoverIndex] : null;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * width;
    const closest = Math.min(
      Math.max(0, Math.round(mouseX / stepX)),
      points.length - 1,
    );
    setHoverIndex(closest);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  return (
    <div className="trend-chart-interactive-wrapper">
      <svg
        className="trend-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${valueKey} over the last ${points.length} days`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.32} />
            <stop offset="100%" stopColor={color} stopOpacity={0.0} />
          </linearGradient>
        </defs>

        {/* Grid Lines */}
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

        {/* Gradient fill */}
        {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}

        {/* Trend Polyline */}
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Active Hover Crosshair and Dot */}
        {activeCoord && (
          <g className="trend-chart-hover-group">
            <line
              x1={activeCoord.x}
              x2={activeCoord.x}
              y1={0}
              y2={height - 18}
              stroke="var(--line-strong)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle
              cx={activeCoord.x}
              cy={activeCoord.y}
              r={6}
              fill={color}
              opacity={0.3}
            />
            <circle
              cx={activeCoord.x}
              cy={activeCoord.y}
              r={4}
              fill="#fff"
              stroke={color}
              strokeWidth={2}
            />
          </g>
        )}

        {/* Axis Labels */}
        <text x="4" y={height - 4} className="trend-chart-label">
          {first}
        </text>
        <text
          x={width - 4}
          y={height - 4}
          className="trend-chart-label trend-chart-label-end"
        >
          {last}
        </text>
      </svg>

      {/* Floating Tooltip Bubble */}
      {activeCoord && (
        <div
          className="trend-chart-tooltip"
          style={{
            left: `${(activeCoord.x / width) * 100}%`,
            top: `${(activeCoord.y / height) * 100}%`,
          }}
        >
          <div className="trend-chart-tooltip-header">
            <span>{activeCoord.point.date}</span>
          </div>
          <div className="trend-chart-tooltip-val">
            <strong style={{ color }}>{activeCoord.val}</strong>
            <small>{valueKey}</small>
          </div>
        </div>
      )}
    </div>
  );
}
