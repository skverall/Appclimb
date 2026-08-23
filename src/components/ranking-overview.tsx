"use client";

import { useId, useMemo, useState } from "react";
import { Crown, Flame, Rocket, Sparkles, Target, Trophy } from "lucide-react";

import {
  allRankedApps,
  bestPositionSeries,
  formatPosition,
  myRankings,
  type BestPositionPoint,
  type TrackerStore,
  type TrackedApp,
} from "@/lib/tracker";

/**
 * Best-position mini chart with interactive hover tooltip. Y axis is inverted so #1 (best) sits at the top;
 * only measured days are plotted — gaps are never filled in.
 */
function BestPositionChart({ points }: { points: BestPositionPoint[] }) {
  const gradientId = useId();
  const width = 300;
  const height = 90;
  const paddingX = 12;
  const paddingY = 10;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const positions = points.map((point) => point.position);
  const worst = Math.max(...positions);
  const best = Math.min(...positions);
  const span = worst - best || 1;
  const availableWidth = width - 2 * paddingX;
  const availableHeight = height - 2 * paddingY - 16;

  const stepX = points.length > 1 ? availableWidth / (points.length - 1) : availableWidth;
  const coords = points.map((point, index) => {
    const x = paddingX + index * stepX;
    const y = paddingY + ((point.position - best) / span) * availableHeight;
    return { x, y, point };
  });

  const pathD = coords
    .map((pt, index) => `${index === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
    .join(" ");

  const areaD = coords.length > 1
    ? `${pathD} L${coords[coords.length - 1].x.toFixed(1)},${(height - 18).toFixed(1)} L${coords[0].x.toFixed(1)},${(height - 18).toFixed(1)} Z`
    : "";

  const first = points[0]?.date.slice(5) ?? "";
  const last = points[points.length - 1]?.date.slice(5) ?? "";
  const activeCoord = hoverIndex !== null && coords[hoverIndex] ? coords[hoverIndex] : null;

  return (
    <div className="tracker-chart-container">
      <svg
        className="tracker-overview-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Best observed App Store position per day over the last 7 days"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const mouseX = ((e.clientX - rect.left) / rect.width) * width;
          const closest = Math.min(
            Math.max(0, Math.round((mouseX - paddingX) / stepX)),
            points.length - 1,
          );
          setHoverIndex(closest);
        }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--teal-500)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--teal-500)" stopOpacity={0.0} />
          </linearGradient>
        </defs>
        {areaD && <path d={areaD} fill={`url(#${gradientId})`} />}
        <path
          d={pathD}
          fill="none"
          stroke="var(--teal-500)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coords.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={i === hoverIndex ? 4 : 2.5}
            fill={i === hoverIndex ? "var(--teal-600)" : "#fff"}
            stroke="var(--teal-600)"
            strokeWidth={1.5}
          />
        ))}
        {activeCoord && (
          <g>
            <line
              x1={activeCoord.x}
              x2={activeCoord.x}
              y1={paddingY}
              y2={height - 18}
              stroke="var(--line-strong)"
              strokeDasharray="2 2"
            />
          </g>
        )}
        <text x={paddingX} y={height - 3} className="trend-chart-label">
          {first}
        </text>
        <text
          x={width - paddingX}
          y={height - 3}
          textAnchor="end"
          className="trend-chart-label"
        >
          {last}
        </text>
      </svg>
      {activeCoord && (
        <div
          className="tracker-overview-chart-tooltip"
          style={{
            left: `${(activeCoord.x / width) * 100}%`,
            top: `${(activeCoord.y / height) * 100}%`,
          }}
        >
          <span>{activeCoord.point.date}</span>
          <strong>#{activeCoord.point.position} Best</strong>
        </div>
      )}
    </div>
  );
}

/**
 * Right-side overview for a tracked app: best position history, the app's own
 * rankings per keyword (with 7-day surge), and all apps ranked across the
 * tracked keyword set — mirroring the Everank-style panel.
 */
export function RankingOverview({
  app,
  store,
  onSelectKeyword,
}: {
  app: TrackedApp;
  store: TrackerStore;
  onSelectKeyword: (normalizedKeyword: string) => void;
}) {
  const bestSeries = useMemo(
    () => bestPositionSeries(store, app.appStoreId, app.country, 7),
    [store, app.appStoreId, app.country],
  );
  const rankings = useMemo(
    () => myRankings(store, app.appStoreId, app.country, 7),
    [store, app.appStoreId, app.country],
  );
  const rankedApps = useMemo(
    () => allRankedApps(store, app.appStoreId, app.country, 10),
    [store, app.appStoreId, app.country],
  );

  return (
    <aside
      className="tracker-detail tracker-overview"
      aria-label={`Ranking overview for ${app.name}`}
    >
      <section className="tracker-overview-section">
        <div className="tracker-overview-section-header">
          <h3>Best Position History</h3>
          <span className="tracker-overview-sub">7 days · measured</span>
        </div>
        {bestSeries.length >= 2 ? (
          <BestPositionChart points={bestSeries} />
        ) : (
          <p className="tracker-overview-empty">
            No rank history yet — daily checks appear here as they run.
          </p>
        )}
      </section>

      <section className="tracker-overview-section">
        <div className="tracker-overview-section-header">
          <h3>My Rankings</h3>
          <span className="tracker-overview-sub">
            {rankings.length} ranked {rankings.length === 1 ? "keyword" : "keywords"}
          </span>
        </div>
        {rankings.length === 0 ? (
          <p className="tracker-overview-empty">
            The app is not in the first 200 results for any tracked keyword yet.
          </p>
        ) : (
          <ul className="tracker-overview-list">
            {rankings.map((row) => {
              const pos = row.position;
              return (
                <li key={row.normalizedKeyword}>
                  <button
                    type="button"
                    className="tracker-overview-kw-btn"
                    onClick={() => onSelectKeyword(row.normalizedKeyword)}
                    title={`View details for ${row.keyword}`}
                  >
                    <span className="tracker-overview-kw" title={row.keyword}>
                      {row.keyword}
                    </span>
                    <span className="tracker-position-pill">
                      {pos === 1 ? (
                        <Crown size={11} className="pos-icon--crown" aria-hidden="true" />
                      ) : pos <= 3 ? (
                        <Rocket size={11} className="pos-icon--top3" aria-hidden="true" />
                      ) : pos <= 10 ? (
                        <Sparkles size={11} className="pos-icon--top10" aria-hidden="true" />
                      ) : (
                        <Target size={11} className="pos-icon--top50" aria-hidden="true" />
                      )}
                      {formatPosition(row.position)}
                    </span>
                    {row.surge === null ? (
                      <span className="rank-trend rank-trend--new">New</span>
                    ) : row.surge === 0 ? (
                      <span className="rank-trend rank-trend--unchanged">
                        —
                      </span>
                    ) : row.surge > 0 ? (
                      <span className="rank-trend rank-trend--up">
                        ↑ {row.surge}
                      </span>
                    ) : (
                      <span className="rank-trend rank-trend--down">
                        ↓ {Math.abs(row.surge)}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="tracker-overview-section">
        <div className="tracker-overview-section-header">
          <h3>All Ranked Apps</h3>
          <span className="tracker-overview-sub">Top competitors</span>
        </div>
        {rankedApps.length === 0 ? (
          <p className="tracker-overview-empty">
            No competitor apps observed yet — add keywords and check them.
          </p>
        ) : (
          <ul className="tracker-overview-apps">
            {rankedApps.map((item) => (
              <li
                key={item.appStoreId}
                className="tracker-overview-app-item"
                title={`${item.name} — ${item.developer}`}
              >
                {item.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.iconUrl} alt="" width={28} height={28} loading="lazy" />
                ) : (
                  <span className="tracker-app-icon-fallback" aria-hidden="true">
                    {item.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="tracker-overview-app-meta">
                  <strong title={item.name}>{item.name}</strong>
                  <small>
                    {item.keywordCount} {item.keywordCount === 1 ? "keyword" : "keywords"}
                  </small>
                </span>
                <span className="tracker-overview-app-pos">
                  {formatPosition(item.bestPosition)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="tracker-overview-note">
        Position = observed iTunes Search rank (first 200) from real daily
        checks. History is never backfilled.
      </p>
    </aside>
  );
}
