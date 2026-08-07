"use client";

import { useMemo } from "react";

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
 * Best-position mini chart. Y axis is inverted so #1 (best) sits at the top;
 * only measured days are plotted — gaps are never filled in.
 */
function BestPositionChart({ points }: { points: BestPositionPoint[] }) {
  const width = 320;
  const height = 88;
  const positions = points.map((point) => point.position);
  const worst = Math.max(...positions);
  const best = Math.min(...positions);
  const span = worst - best || 1;
  const stepX = points.length > 1 ? width / (points.length - 1) : width;
  const path = points
    .map((point, index) => {
      const x = index * stepX;
      const y = 3 + ((point.position - best) / span) * (height - 6);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const first = points[0]?.date.slice(5) ?? "";
  const last = points[points.length - 1]?.date.slice(5) ?? "";

  return (
    <svg
      className="tracker-overview-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Best observed App Store position per day over the last 7 days"
    >
      <path
        d={path}
        fill="none"
        stroke="var(--teal-500)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text x="0" y={height - 2} className="trend-chart-label">
        {first}
      </text>
      <text
        x={width}
        y={height - 2}
        className="trend-chart-label trend-chart-label-end"
      >
        {last}
      </text>
    </svg>
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
        <h3>Best Position History</h3>
        <span className="tracker-overview-sub">7 days · measured</span>
        {bestSeries.length >= 2 ? (
          <BestPositionChart points={bestSeries} />
        ) : (
          <p className="tracker-overview-empty">
            No rank history yet — daily checks appear here as they run.
          </p>
        )}
      </section>

      <section className="tracker-overview-section">
        <h3>My Rankings</h3>
        <span className="tracker-overview-sub">
          {rankings.length} ranked keyword{rankings.length === 1 ? "" : "s"} ·
          click for details
        </span>
        {rankings.length === 0 ? (
          <p className="tracker-overview-empty">
            The app is not in the first 200 results for any tracked keyword
            yet.
          </p>
        ) : (
          <ul className="tracker-overview-list">
            {rankings.map((row) => (
              <li key={row.normalizedKeyword}>
                <button
                  type="button"
                  onClick={() => onSelectKeyword(row.normalizedKeyword)}
                >
                  <span className="tracker-overview-kw" title={row.keyword}>
                    {row.keyword}
                  </span>
                  <span className="tracker-position">
                    {formatPosition(row.position)}
                  </span>
                  {row.surge === null ? (
                    <span className="rank-trend rank-trend--new">New</span>
                  ) : row.surge === 0 ? (
                    <span className="rank-trend rank-trend--unchanged">
                      No change
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
            ))}
          </ul>
        )}
      </section>

      <section className="tracker-overview-section">
        <h3>All Ranked Apps</h3>
        <span className="tracker-overview-sub">
          Top results across your keywords
        </span>
        {rankedApps.length === 0 ? (
          <p className="tracker-overview-empty">
            No competitor apps observed yet — add keywords and check them.
          </p>
        ) : (
          <ul className="tracker-overview-apps">
            {rankedApps.map((item) => (
              <li
                key={item.appStoreId}
                title={`${item.name} — ${item.developer}`}
              >
                {item.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.iconUrl} alt="" width={30} height={30} loading="lazy" />
                ) : (
                  <span className="tracker-app-icon-fallback" aria-hidden="true">
                    {item.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="tracker-overview-app-meta">
                  <strong>{item.name}</strong>
                  <small>
                    {item.keywordCount} keyword
                    {item.keywordCount === 1 ? "" : "s"} · best{" "}
                    {formatPosition(item.bestPosition)}
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
        checks. History is never backfilled; popularity and difficulty remain
        estimates.
      </p>
    </aside>
  );
}
