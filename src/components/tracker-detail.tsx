"use client";

import { useMemo } from "react";
import {
  ExternalLink,
  Loader2,
  RefreshCw,
  Star,
  Trash2,
  X,
} from "lucide-react";

import { TrendChart } from "@/components/keyword-charts";
import {
  describeRankTrend,
  formatPosition,
  snapshotsToChartPoints,
  type RankSnapshot,
  type TrackedApp,
  type TrackedKeyword,
} from "@/lib/tracker";

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export function TrackerDetail({
  app,
  keyword,
  snapshots,
  historyDays,
  busy,
  onClose,
  onRefresh,
  onDelete,
}: {
  app: TrackedApp;
  keyword: TrackedKeyword;
  snapshots: RankSnapshot[];
  historyDays: 7 | 30;
  busy: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onDelete: () => void;
}) {
  const metrics = keyword.currentMetrics;
  const chartPoints = useMemo(
    () => snapshotsToChartPoints(snapshots.slice(-historyDays)),
    [snapshots, historyDays],
  );
  const previous = snapshots.length >= 2 ? snapshots[snapshots.length - 2] : undefined;
  const trend = describeRankTrend(
    previous,
    metrics
      ? { position: metrics.unavailable ? null : metrics.position }
      : null,
  );
  // For rank chart we invert so lower rank (#1) is higher on the chart.
  const rankValues = snapshots
    .slice(-historyDays)
    .map((snap) => (snap.position === null ? null : snap.position));
  const hasRealRankHistory = snapshots.length >= 2;

  return (
    <aside className="tracker-detail" aria-labelledby="tracker-detail-title">
      <header className="keyword-detail-header">
        <div>
          <span className="eyebrow">
            {app.name} · {keyword.country}
          </span>
          <h2 id="tracker-detail-title">{keyword.keyword}</h2>
        </div>
        <div className="keyword-detail-actions">
          <button
            type="button"
            className="keyword-detail-refresh"
            onClick={onRefresh}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="spin" size={15} aria-hidden="true" />
            ) : (
              <RefreshCw size={15} aria-hidden="true" />
            )}
            Refresh
          </button>
          <button
            type="button"
            className="tracker-icon-button"
            onClick={onDelete}
            aria-label={`Delete keyword ${keyword.keyword}`}
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="keyword-detail-close"
            onClick={onClose}
            aria-label="Close keyword detail"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="keyword-stat-grid">
        <div className="keyword-stat">
          <span>Position</span>
          <strong>
            {formatPosition(
              metrics?.position ?? null,
              Boolean(metrics?.unavailable && !metrics?.sampledAt),
            )}
          </strong>
          <small>
            Observed in public iTunes results for {keyword.country}
          </small>
        </div>
        <div className="keyword-stat">
          <span>Rank trend</span>
          <strong className={`rank-trend rank-trend--${trend.kind}`}>
            {metrics?.unavailable ? "Unavailable" : trend.label}
          </strong>
          <small>From real daily checks only</small>
        </div>
        <div className="keyword-stat">
          <span>Popularity</span>
          <strong>{metrics && !metrics.unavailable ? metrics.popularity : "—"}</strong>
          <small>Estimated</small>
        </div>
        <div className="keyword-stat">
          <span>Difficulty</span>
          <strong>{metrics && !metrics.unavailable ? metrics.difficulty : "—"}</strong>
          <small>Estimated</small>
        </div>
      </div>

      {metrics && (
        <p className="keyword-estimate-note keyword-estimate-note--detail">
          Popularity and difficulty are estimates from competition and top-result
          strength in public iTunes data — not Apple Search Ads volume.
          {metrics.saturated
            ? " Results hit the 200-app cap (heavy competition)."
            : ` ${metrics.results} apps observed in results.`}
        </p>
      )}

      <div className="keyword-chart-grid">
        <figure className="keyword-chart-card">
          <figcaption>
            <span>Rank ({historyDays}d)</span>
            <small>Measured · lower is better</small>
          </figcaption>
          {!hasRealRankHistory ? (
            <p className="tracker-chart-empty">
              Rank trend appears after at least two real daily checks. No
              synthetic rank history is generated.
            </p>
          ) : (
            <RankHistoryChart values={rankValues} dates={chartPoints.map((p) => p.date)} />
          )}
        </figure>
        <figure className="keyword-chart-card">
          <figcaption>
            <span>Popularity / Difficulty</span>
            <small>{chartPoints.length} days · estimated</small>
          </figcaption>
          {chartPoints.length === 0 ? (
            <p className="tracker-chart-empty">
              Charts fill in after the first successful check.
            </p>
          ) : (
            <div className="tracker-dual-charts">
              <TrendChart
                points={chartPoints}
                valueKey="popularity"
                color="var(--teal-500)"
                height={120}
              />
              <TrendChart
                points={chartPoints}
                valueKey="difficulty"
                color="var(--coral-500)"
                height={120}
              />
            </div>
          )}
        </figure>
      </div>

      {metrics && metrics.topApps.length > 0 && (
        <section className="keyword-top-apps">
          <h3>Top apps in results</h3>
          <ol>
            {metrics.topApps.slice(0, 10).map((top) => (
              <li key={top.appStoreId}>
                <span className="top-app-rank">{top.position}</span>
                {top.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={top.iconUrl}
                    alt=""
                    width={40}
                    height={40}
                    loading="lazy"
                  />
                ) : (
                  <span className="top-app-fallback" aria-hidden="true">
                    {top.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="top-app-meta">
                  <a href={top.storeUrl || undefined} target="_blank" rel="noreferrer">
                    {top.name}
                    {top.storeUrl ? <ExternalLink size={12} aria-hidden="true" /> : null}
                  </a>
                  <small>
                    {top.developer}
                    {top.genre ? ` · ${top.genre}` : ""}
                    {top.appStoreId === app.appStoreId ? " · Your app" : ""}
                  </small>
                </div>
                <span className="top-app-ratings">
                  <Star size={13} aria-hidden="true" />
                  {top.ratingAverage > 0 ? top.ratingAverage.toFixed(1) : "—"}
                  <small>
                    {top.ratingsCount > 0
                      ? formatCount(top.ratingsCount)
                      : "no ratings"}
                  </small>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {app.storeUrl && (
        <a
          className="tracker-store-link"
          href={app.storeUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open {app.name} in App Store
          <ExternalLink size={14} aria-hidden="true" />
        </a>
      )}
    </aside>
  );
}

function RankHistoryChart({
  values,
  dates,
}: {
  values: Array<number | null>;
  dates: string[];
}) {
  const width = 640;
  const height = 160;
  const numeric = values.filter((value): value is number => value !== null);
  if (numeric.length === 0) {
    return (
      <p className="tracker-chart-empty">
        No in-window positions yet (all checks were &gt;200).
      </p>
    );
  }
  const max = Math.max(...numeric, 1);
  const min = Math.min(...numeric, 1);
  const span = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const points = values
    .map((value, index) => {
      if (value === null) return null;
      const x = index * stepX;
      // Invert: rank 1 at top.
      const y = ((value - min) / span) * (height - 24) + 8;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean);
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point}`)
    .join(" ");

  return (
    <svg
      className="trend-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Rank over time"
    >
      <path
        d={path}
        fill="none"
        stroke="var(--teal-500)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text x="0" y={height - 4} className="trend-chart-label">
        {dates[0] ?? ""}
      </text>
      <text
        x={width}
        y={height - 4}
        className="trend-chart-label trend-chart-label-end"
      >
        {dates[dates.length - 1] ?? ""}
      </text>
    </svg>
  );
}
