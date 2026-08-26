"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  Clock,
  Eye,
  Globe,
  Laptop,
  Layers,
  Link as LinkIcon,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Tablet,
  Users,
} from "lucide-react";

import { isLocalAdminOptedOut, setLocalAdminOptOut } from "@/components/analytics-beacon";
import type { AnalyticsSummary } from "@/lib/analytics";

export function AdminDashboard() {
  const [range, setRange] = useState<"today" | "7d" | "30d">("7d");
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [optedOut, setOptedOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setOptedOut(isLocalAdminOptedOut());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleOptOut = () => {
    const next = !optedOut;
    setOptedOut(next);
    setLocalAdminOptOut(next);
  };

  const fetchAnalytics = useCallback(async (selectedRange: "today" | "7d" | "30d") => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics?range=${selectedRange}`);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setError("Admin authorization required. Sign in with an authorized administrator account.");
        } else {
          setError("Failed to load analytics data from server.");
        }
        setLoading(false);
        return;
      }
      const json = (await res.json()) as AnalyticsSummary;
      setData(json);
    } catch {
      setError("Network error while loading analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      void fetchAnalytics(range);
    })();
    return () => {
      cancelled = true;
    };
  }, [range, fetchAnalytics]);

  return (
    <div className="admin-dashboard">
      {/* Top Header */}
      <header className="admin-header">
        <div className="admin-header-title-wrap">
          <div className="admin-live-badge">
            <span className="admin-live-pulse" aria-hidden="true" />
            <span>Real-time Insights</span>
          </div>
          <h1>AppClimb Pulse</h1>
          <p>Zero-bot, privacy-first visitor analytics powered by Cloudflare D1.</p>
        </div>

        <div className="admin-header-controls">
          {/* Admin Opt-Out Toggle */}
          <button
            type="button"
            className={`admin-optout-btn ${optedOut ? "is-active" : ""}`}
            onClick={handleToggleOptOut}
            title={
              optedOut
                ? "This browser is excluded from all analytics. Click to include."
                : "Click to exclude this browser from analytics (prevents polluting data)."
            }
          >
            <ShieldCheck size={14} aria-hidden="true" />
            <span>{optedOut ? "Admin Ignored (Active)" : "Exclude my browser"}</span>
          </button>

          {/* Time Range Selector */}
          <div className="admin-range-tabs" role="tablist" aria-label="Time range">
            <button
              type="button"
              className={range === "today" ? "is-active" : ""}
              onClick={() => setRange("today")}
            >
              Today
            </button>
            <button
              type="button"
              className={range === "7d" ? "is-active" : ""}
              onClick={() => setRange("7d")}
            >
              Last 7 Days
            </button>
            <button
              type="button"
              className={range === "30d" ? "is-active" : ""}
              onClick={() => setRange("30d")}
            >
              Last 30 Days
            </button>
          </div>

          <button
            type="button"
            className="admin-refresh-btn"
            onClick={() => void fetchAnalytics(range)}
            disabled={loading}
            aria-label="Refresh analytics"
          >
            <RefreshCw size={15} className={loading ? "spin" : ""} aria-hidden="true" />
          </button>
        </div>
      </header>

      {error && (
        <div className="keyword-error admin-banner-error" role="alert">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="admin-loading-state">
          <Loader2 size={32} className="spin" aria-hidden="true" />
          <span>Aggregating real-time edge metrics…</span>
        </div>
      )}

      {data && (
        <div className="admin-content-grid">
          {/* KPI Summary Cards */}
          <div className="admin-kpis-grid">
            <div className="admin-kpi-card">
              <div className="admin-kpi-icon admin-kpi-icon--blue">
                <Users size={18} aria-hidden="true" />
              </div>
              <div className="admin-kpi-body">
                <span className="admin-kpi-label">Unique Visitors</span>
                <strong className="admin-kpi-val">{data.totalVisitors.toLocaleString()}</strong>
                <span className="admin-kpi-hint">Real distinct people</span>
              </div>
            </div>

            <div className="admin-kpi-card">
              <div className="admin-kpi-icon admin-kpi-icon--green">
                <Eye size={18} aria-hidden="true" />
              </div>
              <div className="admin-kpi-body">
                <span className="admin-kpi-label">Pageviews</span>
                <strong className="admin-kpi-val">{data.totalPageviews.toLocaleString()}</strong>
                <span className="admin-kpi-hint">
                  {data.totalVisitors > 0
                    ? `${(data.totalPageviews / data.totalVisitors).toFixed(1)} views / visitor`
                    : "0 views / visitor"}
                </span>
              </div>
            </div>

            <div className="admin-kpi-card">
              <div className="admin-kpi-icon admin-kpi-icon--amber">
                <Globe size={18} aria-hidden="true" />
              </div>
              <div className="admin-kpi-body">
                <span className="admin-kpi-label">Top Country</span>
                <strong className="admin-kpi-val">
                  {data.topCountry ? `${data.topCountry.flag} ${data.topCountry.code}` : "—"}
                </strong>
                <span className="admin-kpi-hint">
                  {data.topCountry ? `${data.topCountry.name} (${data.topCountry.count})` : "No visits yet"}
                </span>
              </div>
            </div>

            <div className="admin-kpi-card">
              <div className="admin-kpi-icon admin-kpi-icon--purple">
                <LinkIcon size={18} aria-hidden="true" />
              </div>
              <div className="admin-kpi-body">
                <span className="admin-kpi-label">Top Referrer</span>
                <strong className="admin-kpi-val">{data.topReferrer?.name ?? "Direct"}</strong>
                <span className="admin-kpi-hint">
                  {data.topReferrer ? `${data.topReferrer.count} views` : "Direct navigation"}
                </span>
              </div>
            </div>
          </div>

          {/* Timeline Chart */}
          <div className="admin-card admin-chart-card">
            <div className="admin-card-header">
              <div className="admin-card-title">
                <BarChart3 size={16} aria-hidden="true" />
                <h3>Traffic Trend</h3>
              </div>
              <div className="admin-chart-legend">
                <span className="legend-item legend-item--visitors">
                  <span className="legend-dot" /> Unique Visitors
                </span>
                <span className="legend-item legend-item--views">
                  <span className="legend-dot" /> Pageviews
                </span>
              </div>
            </div>

            <div className="admin-chart-wrap">
              {data.timeline.length === 0 ? (
                <div className="admin-empty-chart">
                  <span>No traffic recorded in this period yet. Real visits will plot here.</span>
                </div>
              ) : (
                <div className="admin-timeline-bars">
                  {data.timeline.map((item) => {
                    const maxVal = Math.max(...data.timeline.map((t) => Math.max(t.views, t.visitors, 1)));
                    const visitorHeight = (item.visitors / maxVal) * 100;
                    const viewHeight = (item.views / maxVal) * 100;
                    return (
                      <div key={item.date} className="timeline-col">
                        <div className="timeline-bars-track">
                          <div
                            className="timeline-bar timeline-bar--views"
                            style={{ height: `${Math.max(4, viewHeight)}%` }}
                            title={`${item.date}: ${item.views} pageviews`}
                          />
                          <div
                            className="timeline-bar timeline-bar--visitors"
                            style={{ height: `${Math.max(4, visitorHeight)}%` }}
                            title={`${item.date}: ${item.visitors} unique visitors`}
                          />
                        </div>
                        <span className="timeline-date-label">
                          {item.date.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 2-Column Split: Countries & Referrers */}
          <div className="admin-split-grid">
            {/* Countries Card */}
            <div className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title">
                  <Globe size={16} aria-hidden="true" />
                  <h3>Top Countries</h3>
                </div>
                <span className="admin-card-subtitle">{data.countries.length} locations</span>
              </div>

              {data.countries.length === 0 ? (
                <div className="admin-empty-section">
                  <span>No country data recorded yet.</span>
                </div>
              ) : (
                <div className="admin-table-list">
                  {data.countries.map((c) => (
                    <div key={c.code} className="admin-table-row">
                      <div className="country-row-left">
                        <span className="country-flag" aria-hidden="true">
                          {c.flag}
                        </span>
                        <span className="country-name">{c.name}</span>
                        <span className="country-code-pill">{c.code}</span>
                      </div>
                      <div className="country-row-right">
                        <div className="admin-bar-wrap">
                          <div
                            className="admin-fill-bar admin-fill-bar--teal"
                            style={{ width: `${Math.max(4, c.percentage)}%` }}
                          />
                        </div>
                        <span className="country-visitors-count">{c.visitors}</span>
                        <span className="country-percent-label">{c.percentage}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Referrers Card */}
            <div className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title">
                  <LinkIcon size={16} aria-hidden="true" />
                  <h3>Traffic Sources</h3>
                </div>
                <span className="admin-card-subtitle">{data.referrers.length} sources</span>
              </div>

              {data.referrers.length === 0 ? (
                <div className="admin-empty-section">
                  <span>No referrer sources recorded yet.</span>
                </div>
              ) : (
                <div className="admin-table-list">
                  {data.referrers.map((r) => (
                    <div key={r.domain} className="admin-table-row">
                      <div className="referrer-row-left">
                        <span className="referrer-domain">{r.domain}</span>
                      </div>
                      <div className="referrer-row-right">
                        <div className="admin-bar-wrap">
                          <div
                            className="admin-fill-bar admin-fill-bar--blue"
                            style={{ width: `${Math.max(4, r.percentage)}%` }}
                          />
                        </div>
                        <span className="referrer-views-count">{r.views} views</span>
                        <span className="referrer-percent-label">{r.percentage}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 2-Column Split: Top Pages & Devices */}
          <div className="admin-split-grid">
            {/* Top Pages */}
            <div className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title">
                  <Layers size={16} aria-hidden="true" />
                  <h3>Top Pages Viewed</h3>
                </div>
                <span className="admin-card-subtitle">{data.pages.length} pages</span>
              </div>

              {data.pages.length === 0 ? (
                <div className="admin-empty-section">
                  <span>No pageviews recorded yet.</span>
                </div>
              ) : (
                <div className="admin-table-list">
                  {data.pages.map((p) => (
                    <div key={p.path} className="admin-table-row">
                      <div className="page-row-left">
                        <code className="page-path">{p.path}</code>
                      </div>
                      <div className="page-row-right">
                        <span className="page-views-badge">{p.views} views</span>
                        <span className="page-visitors-badge">{p.visitors} visitors</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Devices & Browsers */}
            <div className="admin-card">
              <div className="admin-card-header">
                <div className="admin-card-title">
                  <Laptop size={16} aria-hidden="true" />
                  <h3>Devices</h3>
                </div>
              </div>

              <div className="admin-devices-wrap">
                {(() => {
                  const totalDevices =
                    data.devices.desktop + data.devices.mobile + data.devices.tablet || 1;
                  const desktopPct = Math.round((data.devices.desktop / totalDevices) * 100);
                  const mobilePct = Math.round((data.devices.mobile / totalDevices) * 100);
                  const tabletPct = Math.round((data.devices.tablet / totalDevices) * 100);

                  return (
                    <div className="device-meters-list">
                      <div className="device-meter-item">
                        <div className="device-meter-label">
                          <Laptop size={15} aria-hidden="true" />
                          <span>Desktop</span>
                        </div>
                        <div className="device-meter-bar-wrap">
                          <div className="device-meter-bar" style={{ width: `${desktopPct}%` }} />
                        </div>
                        <span className="device-meter-val">{desktopPct}% ({data.devices.desktop})</span>
                      </div>

                      <div className="device-meter-item">
                        <div className="device-meter-label">
                          <Smartphone size={15} aria-hidden="true" />
                          <span>Mobile</span>
                        </div>
                        <div className="device-meter-bar-wrap">
                          <div className="device-meter-bar" style={{ width: `${mobilePct}%` }} />
                        </div>
                        <span className="device-meter-val">{mobilePct}% ({data.devices.mobile})</span>
                      </div>

                      <div className="device-meter-item">
                        <div className="device-meter-label">
                          <Tablet size={15} aria-hidden="true" />
                          <span>Tablet</span>
                        </div>
                        <div className="device-meter-bar-wrap">
                          <div className="device-meter-bar" style={{ width: `${tabletPct}%` }} />
                        </div>
                        <span className="device-meter-val">{tabletPct}% ({data.devices.tablet})</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Real-Time Live Activity Feed */}
          <div className="admin-card">
            <div className="admin-card-header">
              <div className="admin-card-title">
                <Activity size={16} aria-hidden="true" />
                <h3>Live Real-Time Activity Feed</h3>
              </div>
              <span className="admin-card-subtitle">Last {data.recent.length} hits</span>
            </div>

            {data.recent.length === 0 ? (
              <div className="admin-empty-section">
                <span>No live activity yet. Real visits will stream here in real time.</span>
              </div>
            ) : (
              <div className="admin-recent-list">
                {data.recent.map((item, idx) => (
                  <div key={`${item.timestamp}-${idx}`} className="admin-recent-item">
                    <div className="recent-country">
                      <span className="recent-flag" aria-hidden="true">
                        {item.flag}
                      </span>
                      <span className="recent-code">{item.country}</span>
                    </div>
                    <code className="recent-path">{item.path}</code>
                    <span className="recent-referrer">
                      {item.referrer !== "direct" ? `via ${item.referrer}` : "direct"}
                    </span>
                    <span className="recent-device-badge">{item.device}</span>
                    <span className="recent-time">
                      <Clock size={12} aria-hidden="true" /> {item.timeAgo}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
