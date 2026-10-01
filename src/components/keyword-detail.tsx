"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  ExternalLink,
  Link2,
  Loader2,
  Lock,
  RefreshCw,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { useToast } from "@/components/toast";

import {
  assessOpportunity,
  formatRatings,
  recentHistory,
  relatedKeywords,
  titleMatchScore,
  type KeywordMetrics,
  type KeywordRecord,
} from "@/lib/aso";
import {
  formatPopularity,
  popularityCaption,
  popularitySourceOf,
} from "@/lib/popularity";
import { genreLabel, historyDelta } from "@/lib/search-terms";
import { fetchRelatedTerms, type RelatedTermResult } from "@/lib/terms-client";
import { formatWeek, LineChart } from "@/components/keyword-charts";
import { OpportunityPill, DeltaBadge } from "@/components/keyword-badges";

type TrackApp = {
  appStoreId: string;
  name: string;
  iconUrl?: string;
  developer?: string;
  genre?: string;
  storeUrl: string;
};

export function KeywordDetail({
  keyword,
  countryCode,
  countryLabel,
  metrics,
  record,
  busy,
  historyDays = 30,
  historyWeeks = 12,
  canSeeFullHistory = false,
  onUpgrade,
  onClose,
  onRefresh,
  onAnalyze,
  onTrackApp,
  trackTarget,
}: {
  keyword: string;
  countryCode: string;
  countryLabel: string;
  metrics: KeywordMetrics | null;
  record: KeywordRecord | null;
  busy: boolean;
  /** Local snapshot window (30 free, 90 Pro). */
  historyDays?: number;
  /** Apple weekly history window (12 free, 52 Pro). */
  historyWeeks?: number;
  canSeeFullHistory?: boolean;
  onUpgrade?: () => void;
  onClose: () => void;
  onRefresh: () => void;
  onAnalyze: (keyword: string) => void;
  onTrackApp?: (app: TrackApp) => void;
  /** The user's app in this storefront, to track this keyword's rank. */
  trackTarget?: { name: string; iconUrl?: string; tracked: boolean; onTrack: () => void };
}) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [related, setRelated] = useState<{ key: string; items: RelatedTermResult[] } | null>(
    null,
  );

  const source = metrics ? popularitySourceOf(metrics) : "estimated";
  const opportunity = metrics ? assessOpportunity(metrics) : null;
  const appleHistory = useMemo(
    () => (metrics?.popularityHistory ?? record?.popularityHistory ?? []).slice(-historyWeeks),
    [metrics, record, historyWeeks],
  );
  const delta4w = historyDelta(appleHistory, 4);
  const localHistory = useMemo(
    () => (record ? recentHistory(record, historyDays) : []),
    [record, historyDays],
  );

  const relatedKey = `${countryCode}:${keyword.toLocaleLowerCase()}`;
  const genreHint = metrics?.appleGenre;
  useEffect(() => {
    let cancelled = false;
    void fetchRelatedTerms(countryCode, keyword, genreHint).then((items) => {
      if (!cancelled) setRelated({ key: relatedKey, items });
    });
    return () => {
      cancelled = true;
    };
  }, [countryCode, keyword, genreHint, relatedKey]);
  const appleRelated = related?.key === relatedKey ? related.items : null;
  const fallbackRelated = useMemo(
    () => (metrics ? relatedKeywords(metrics.topApps, keyword) : []),
    [metrics, keyword],
  );

  const shareUrl = `${window.location.origin}/?kw=${encodeURIComponent(keyword)}&country=${encodeURIComponent(countryCode)}`;
  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = shareUrl;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } catch {
        // Clipboard unavailable in this browser.
      }
      textarea.remove();
    }
    setCopied(true);
    showToast(`Copied share link for "${keyword}"`);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const evidence = metrics?.evidence;
  const genreName = metrics?.appleGenre ? genreLabel(metrics.appleGenre) : null;

  return (
    <section className="kd" aria-labelledby="keyword-detail-title">
      <header className="kd-head">
        <div className="kd-title">
          <span className="kd-eyebrow">
            {countryLabel} App Store
            {metrics?.dataWeek ? ` · Apple data for week of ${formatWeek(metrics.dataWeek)}` : ""}
          </span>
          <h2 id="keyword-detail-title">{keyword}</h2>
        </div>
        <div className="kd-actions">
          <button type="button" className="kd-btn" onClick={() => void copyShareLink()}>
            {copied ? <Check size={14} aria-hidden="true" /> : <Link2 size={14} aria-hidden="true" />}
            {copied ? "Copied" : "Share"}
          </button>
          <button type="button" className="kd-btn" onClick={onRefresh} disabled={busy}>
            {busy ? (
              <Loader2 className="spin" size={14} aria-hidden="true" />
            ) : (
              <RefreshCw size={14} aria-hidden="true" />
            )}
            {busy ? "Checking…" : "Check now"}
          </button>
          <button
            type="button"
            className="kd-close"
            onClick={onClose}
            aria-label="Close keyword detail"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      {!metrics && busy && <div className="kd-loading" aria-live="polite">Analyzing “{keyword}”…</div>}
      {!metrics && !busy && (
        <p className="kd-muted">This keyword has not been checked yet.</p>
      )}

      {metrics && opportunity && (
        <>
          <div className={`kd-verdict kd-verdict--${opportunity.verdict}`}>
            <OpportunityPill opportunity={opportunity} />
            <p>{opportunity.reason}</p>
          </div>

          {trackTarget && (
            <div className="kd-track">
              {trackTarget.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={trackTarget.iconUrl} alt="" width={28} height={28} />
              ) : null}
              <span>
                {trackTarget.tracked ? (
                  <>
                    Tracking for <b>{trackTarget.name}</b> — see its rank under Tracked Apps.
                  </>
                ) : (
                  <>
                    Where does <b>{trackTarget.name}</b> rank for this?
                  </>
                )}
              </span>
              {!trackTarget.tracked && (
                <button type="button" className="kd-track-btn" onClick={trackTarget.onTrack}>
                  Track rank
                </button>
              )}
            </div>
          )}

          <div className="kd-stats">
            <div className="kd-stat">
              <span className="kd-stat-label">Popularity</span>
              <div className="kd-stat-value">
                <strong>{formatPopularity(metrics)}</strong>
                <small>/100</small>
                {source === "official" && <DeltaBadge delta={delta4w} suffix="4w" />}
              </div>
              <span className={`source-tag source-tag--${source}`}>
                {source === "official" ? "Apple Ads" : source === "longtail" ? "Apple · long tail" : "Estimate"}
              </span>
              <p className="kd-stat-note">
                {source === "official" && metrics.rankInGenre
                  ? `#${metrics.rankInGenre} of the 500 most-searched terms in ${genreName ?? "its category"}.`
                  : popularityCaption(source, metrics.appleGenre)}
              </p>
            </div>
            <div className="kd-stat">
              <span className="kd-stat-label">Difficulty</span>
              <div className="kd-stat-value">
                <strong>{metrics.difficulty}</strong>
                <small>/100</small>
              </div>
              <span className="source-tag source-tag--estimated">Estimate</span>
              <p className="kd-stat-note">From the apps ranking in today&apos;s top 10.</p>
            </div>
            <div className="kd-stat kd-stat--evidence">
              <span className="kd-stat-label">Why this difficulty</span>
              {evidence ? (
                <ul className="kd-evidence">
                  <li>
                    <b>{formatRatings(evidence.medianRatings)}</b> median ratings in the top {evidence.sampled}
                  </li>
                  {evidence.weakestPosition !== null && (
                    <li>
                      Weakest: <b>#{evidence.weakestPosition}</b> with{" "}
                      <b>{formatRatings(evidence.weakestRatings)}</b> ratings
                    </li>
                  )}
                  <li>
                    <b>
                      {evidence.titleMatches}/{evidence.sampled}
                    </b>{" "}
                    have the keyword in their name
                  </li>
                  {evidence.brandApps > 0 && (
                    <li>
                      <b>{evidence.brandApps}</b> from big-brand publishers
                    </li>
                  )}
                </ul>
              ) : (
                <p className="kd-stat-note">Check again to see the top-10 breakdown.</p>
              )}
            </div>
          </div>

          <figure className="kd-card">
            <figcaption className="kd-card-head">
              <div>
                <h3>Apple search popularity</h3>
                <small>
                  {appleHistory.length > 1
                    ? `Weekly, last ${appleHistory.length} weeks · Apple Ads Insights`
                    : "Weekly history from Apple Ads Insights"}
                </small>
              </div>
              {!canSeeFullHistory && appleHistory.length >= historyWeeks && onUpgrade && (
                <button type="button" className="kd-link-btn" onClick={onUpgrade}>
                  <Lock size={12} aria-hidden="true" /> 52 weeks with Pro
                </button>
              )}
            </figcaption>
            {appleHistory.length > 1 ? (
              <LineChart
                points={appleHistory.map((point) => ({
                  label: formatWeek(point.week),
                  value: point.popularity,
                }))}
                color="var(--teal-500)"
                valueLabel="popularity"
              />
            ) : (
              <p className="kd-empty">
                {source === "official"
                  ? "Apple has published only this week for this term so far."
                  : source === "longtail"
                    ? "Apple hasn't listed this term among the 500 most-searched in its category this past year, so there's no official trend. That's normal for long-tail keywords."
                    : "Apple's data is unavailable right now."}
              </p>
            )}
          </figure>

          {localHistory.length >= 3 && (
            <figure className="kd-card">
              <figcaption className="kd-card-head">
                <div>
                  <h3>Difficulty over your checks</h3>
                  <small>{localHistory.length} daily snapshots saved in this browser</small>
                </div>
              </figcaption>
              <LineChart
                points={localHistory.map((point) => ({ label: point.date.slice(5), value: point.difficulty }))}
                color="var(--coral-500)"
                valueLabel="difficulty"
                height={130}
              />
            </figure>
          )}

          <section className="kd-card">
            <div className="kd-card-head">
              <div>
                <h3>Related searches</h3>
                <small>
                  {appleRelated && appleRelated.length > 0
                    ? "Real App Store searches from Apple, with popularity"
                    : "Phrases from the top apps' names"}
                </small>
              </div>
            </div>
            {appleRelated === null ? (
              <div className="kd-related-skeleton" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
            ) : appleRelated.length > 0 ? (
              <ul className="kd-related">
                {appleRelated.map((item) => (
                  <li key={`${item.genre}:${item.term}`}>
                    <button type="button" onClick={() => onAnalyze(item.term)} disabled={busy}>
                      <span className="kd-related-term">{item.term}</span>
                      <span className="kd-related-bar" aria-hidden="true">
                        <i style={{ width: `${item.popularity}%` }} />
                      </span>
                      <span className="kd-related-pop">{item.popularity}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : fallbackRelated.length > 0 ? (
              <div className="kd-chips">
                {fallbackRelated.map((phrase) => (
                  <button type="button" key={phrase} onClick={() => onAnalyze(phrase)} disabled={busy}>
                    {phrase}
                  </button>
                ))}
              </div>
            ) : (
              <p className="kd-empty">No related searches found.</p>
            )}
          </section>

          {metrics.topApps.length > 0 ? (
            <section className="kd-card">
              <div className="kd-card-head">
                <div>
                  <h3>Who ranks today</h3>
                  <small>
                    Top {Math.min(10, metrics.topApps.length)} of{" "}
                    {metrics.saturated ? "200+" : metrics.results} results · public App Store search
                  </small>
                </div>
              </div>
              <ol className="kd-apps">
                {metrics.topApps.slice(0, 10).map((app) => {
                  const match = titleMatchScore(app.name, keyword);
                  return (
                    <li key={app.appStoreId}>
                      <span className="kd-app-rank">{app.position}</span>
                      {app.iconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={app.iconUrl} alt="" width={36} height={36} loading="lazy" />
                      ) : (
                        <span className="kd-app-fallback" aria-hidden="true">
                          {app.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <div className="kd-app-meta">
                        <a href={app.storeUrl} target="_blank" rel="noreferrer">
                          {app.name}
                          <ExternalLink size={11} aria-hidden="true" />
                        </a>
                        <small>
                          {app.developer}
                          {match >= 0.75 && <span className="kd-app-tag">keyword in name</span>}
                        </small>
                      </div>
                      <span className="kd-app-ratings">
                        <Star size={12} aria-hidden="true" />
                        {app.ratingAverage > 0 ? app.ratingAverage.toFixed(1) : "—"}
                        <small>{app.ratingsCount > 0 ? formatRatings(app.ratingsCount) : "no ratings"}</small>
                      </span>
                      {onTrackApp && (
                        <button
                          type="button"
                          className="kd-app-track"
                          onClick={() =>
                            onTrackApp({
                              appStoreId: app.appStoreId,
                              name: app.name,
                              iconUrl: app.iconUrl,
                              developer: app.developer,
                              genre: app.genre,
                              storeUrl: app.storeUrl,
                            })
                          }
                          title={`Track ${app.name} rankings`}
                        >
                          + Track
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : (
            metrics.restored && (
              <p className="kd-muted">Check now to load today&apos;s top apps.</p>
            )
          )}

          <div className="kd-ask">
            <Sparkles size={16} aria-hidden="true" />
            <div>
              <strong>Plan a title and subtitle around “{keyword}”</strong>
              <p>The ASO assistant sees these numbers and suggests where to place the term.</p>
            </div>
            <Link
              href={`/assistant?ask=${encodeURIComponent(
                `Help me rank for "${keyword}" in the ${countryLabel} App Store. Popularity ${formatPopularity(metrics)} (${source === "official" ? "Apple Ads" : source === "longtail" ? "long tail, below Apple's top 500" : "estimate"}), difficulty ${metrics.difficulty}/100. Where should it go in my title, subtitle, and keyword field?`,
              )}`}
              className="kd-ask-btn"
            >
              Ask AI
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
