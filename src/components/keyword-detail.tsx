"use client";

import { useMemo, useState } from "react";
import { Check, ExternalLink, Link2, Loader2, RefreshCw, Star, X } from "lucide-react";

import {
  recentHistory,
  relatedKeywords,
  type KeywordMetrics,
  type KeywordRecord,
} from "@/lib/aso";
import {
  popularityCaption,
  popularityShortLabel,
  popularitySourceOf,
} from "@/lib/popularity";
import { TrendChart } from "@/components/keyword-charts";

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export function KeywordDetail({
  keyword,
  countryCode,
  countryLabel,
  metrics,
  record,
  busy,
  onClose,
  onRefresh,
  onAnalyze,
}: {
  keyword: string;
  countryCode: string;
  countryLabel: string;
  metrics: KeywordMetrics | null;
  record: KeywordRecord | null;
  busy: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onAnalyze: (keyword: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const history = useMemo(() => (record ? recentHistory(record) : []), [record]);
  const related = useMemo(
    () => (metrics ? relatedKeywords(metrics.topApps, keyword) : []),
    [metrics, keyword],
  );

  const competition =
    !metrics
      ? "—"
      : metrics.saturated
        ? "Heavy"
        : metrics.results > 60
          ? "Moderate"
          : "Light";

  const shareUrl = `${window.location.origin}${window.location.pathname}?kw=${encodeURIComponent(keyword)}&country=${encodeURIComponent(countryCode)}`;

  const copyShareLink = async () => {
    const fallback = () => {
      const textarea = document.createElement("textarea");
      textarea.value = shareUrl;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } catch {
        // Clipboard unavailable; nothing else we can do in this browser.
      }
      textarea.remove();
      setCopied(true);
    };
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
      } else {
        fallback();
      }
    } catch {
      fallback();
    }
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="keyword-detail" aria-labelledby="keyword-detail-title">
      <header className="keyword-detail-header">
        <div>
          <span className="eyebrow">
            {countryLabel} · App Store
          </span>
          <h2 id="keyword-detail-title">{keyword}</h2>
        </div>
        <div className="keyword-detail-actions">
          <button
            type="button"
            className="keyword-detail-share"
            onClick={() => void copyShareLink()}
          >
            {copied ? (
              <Check size={15} aria-hidden="true" />
            ) : (
              <Link2 size={15} aria-hidden="true" />
            )}
            {copied ? "Copied" : "Share"}
          </button>
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
            {busy ? "Checking…" : "Check now"}
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

      {!metrics && !busy && (
        <p className="keyword-detail-pending">
          This keyword is queued — it will be analyzed on the next check.
        </p>
      )}

      {metrics && (
        <>
          <div className="keyword-stat-grid">
            <div className="keyword-stat">
              <span>Popularity</span>
              <strong>{metrics.popularity}</strong>
              <i className="stat-bar stat-bar--popularity">
                <b style={{ width: `${metrics.popularity}%` }} />
              </i>
              <small>{popularityCaption(popularitySourceOf(metrics))}</small>
            </div>
            <div className="keyword-stat">
              <span>Difficulty</span>
              <strong>{metrics.difficulty}</strong>
              <i className="stat-bar stat-bar--difficulty">
                <b style={{ width: `${metrics.difficulty}%` }} />
              </i>
              <small>Harder to rank = higher</small>
            </div>
            <div className="keyword-stat">
              <span>Results</span>
              <strong>{metrics.results}</strong>
              <i className="stat-bar stat-bar--neutral">
                <b style={{ width: `${Math.min(100, metrics.results / 2)}%` }} />
              </i>
              <small>{metrics.saturated ? "Hit the 200-app cap" : "Apps in results"}</small>
            </div>
            <div className="keyword-stat">
              <span>Competition</span>
              <strong>{competition}</strong>
              <i className="stat-bar stat-bar--neutral">
                <b
                  style={{
                    width: metrics.saturated ? "100%" : `${Math.min(100, metrics.results / 2)}%`,
                  }}
                />
              </i>
              <small>From result density</small>
            </div>
          </div>

          <div className="keyword-chart-grid">
            <figure className="keyword-chart-card">
              <figcaption>
                <span>Popularity trend</span>
                <small>
                  {history.length} days · {popularityShortLabel(popularitySourceOf(metrics))}
                  {record?.backfilled ? " + estimated baseline" : ""}
                </small>
              </figcaption>
              <TrendChart
                points={history}
                valueKey="popularity"
                color="var(--teal-500)"
              />
            </figure>
            <figure className="keyword-chart-card">
              <figcaption>
                <span>Difficulty trend</span>
                <small>{history.length} days · estimated</small>
              </figcaption>
              <TrendChart
                points={history}
                valueKey="difficulty"
                color="var(--coral-500)"
              />
            </figure>
          </div>

          {record?.backfilled && (
            <p className="keyword-estimate-note keyword-estimate-note--detail">
              The trend starts with an estimated baseline. Each day you check
              this keyword, a real measurement is recorded
              {popularitySourceOf(metrics) === "official"
                ? " — today's popularity is Apple Ads official."
                : " — today's popularity is the iTunes estimate."}
            </p>
          )}

          {related.length > 0 && (
            <section className="keyword-related">
              <h3>Related keywords</h3>
              <div className="keyword-chip-row">
                {related.map((phrase) => (
                  <button
                    type="button"
                    key={phrase}
                    onClick={() => onAnalyze(phrase)}
                    disabled={busy}
                  >
                    {phrase}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="keyword-top-apps">
            <h3>Top apps for this keyword</h3>
            <ol>
              {metrics.topApps.slice(0, 10).map((app) => (
                <li key={app.appStoreId}>
                  <span className="top-app-rank">{app.position}</span>
                  {app.iconUrl ? (
                    <>
                      {/* Remote iTunes artwork varies by storefront; next/image
                          would require per-origin remote patterns for no gain. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={app.iconUrl}
                        alt=""
                        width={40}
                        height={40}
                        loading="lazy"
                      />
                    </>
                  ) : (
                    <span className="top-app-fallback" aria-hidden="true">
                      {app.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="top-app-meta">
                    <a
                      href={app.storeUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {app.name}
                      <ExternalLink size={12} aria-hidden="true" />
                    </a>
                    <small>
                      {app.developer} · {app.genre}
                    </small>
                  </div>
                  <span className="top-app-ratings">
                    <Star size={13} aria-hidden="true" />
                    {app.ratingAverage > 0 ? app.ratingAverage.toFixed(1) : "—"}
                    <small>
                      {app.ratingsCount > 0 ? formatCount(app.ratingsCount) : "no ratings"}
                    </small>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </section>
  );
}
