"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  Bot,
  Clock,
  Cpu,
  Eye,
  Globe,
  HardDrive,
  Laptop,
  Layers,
  Link as LinkIcon,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tablet,
  UserCheck,
  UserPlus,
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
          <p>Zero-bot, privacy-first visitor analytics & AI referral intelligence.</p>
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
          <div className="admin-kpis-grid admin-kpis-grid--6">
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
              <div className="admin-kpi-icon admin-kpi-icon--teal">
                <UserCheck size={18} aria-hidden="true" />
              </div>
              <div className="admin-kpi-body">
                <span className="admin-kpi-label">Registered Users</span>
                <strong className="admin-kpi-val">
                  {data.userAnalytics?.totalUsers?.toLocaleString() ?? 0}
                </strong>
                <span className="admin-kpi-hint">
                  +{data.userAnalytics?.newUsersInRange ?? 0} in period · {data.userAnalytics?.conversionRate ?? 0}% conv
                </span>
              </div>
            </div>

            <div className="admin-kpi-card">
              <div className="admin-kpi-icon admin-kpi-icon--ai">
                <Bot size={18} aria-hidden="true" />
              </div>
              <div className="admin-kpi-body">
                <span className="admin-kpi-label">AI Referrals</span>
                <strong className="admin-kpi-val">{data.aiTraffic?.totalVisits ?? 0}</strong>
                <span className="admin-kpi-hint">
                  {data.aiTraffic?.percentage ?? 0}% of all traffic
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
                <span className="legend-item legend-item--ai">
                  <span className="legend-dot" /> AI Search Visits
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
                    const maxVal = Math.max(
                      ...data.timeline.map((t) => Math.max(t.views, t.visitors, t.aiViews || 0, 1)),
                    );
                    const visitorHeight = (item.visitors / maxVal) * 100;
                    const viewHeight = (item.views / maxVal) * 100;
                    const aiHeight = ((item.aiViews || 0) / maxVal) * 100;
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
                          {item.aiViews > 0 && (
                            <div
                              className="timeline-bar timeline-bar--ai"
                              style={{ height: `${Math.max(4, aiHeight)}%` }}
                              title={`${item.date}: ${item.aiViews} visits from AI engines`}
                            />
                          )}
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

          {/* AI Traffic Intelligence Card */}
          <div className="admin-card admin-ai-card">
            <div className="admin-card-header">
              <div className="admin-card-title">
                <Cpu size={16} aria-hidden="true" />
                <h3>AI Referral Intelligence (LLM Searches & Citations)</h3>
                <span className="admin-ai-pulse-badge">
                  <Sparkles size={12} aria-hidden="true" /> {data.aiTraffic?.totalVisits ?? 0} AI visits ({data.aiTraffic?.percentage ?? 0}%)
                </span>
              </div>
              <span className="admin-card-subtitle">ChatGPT · Perplexity · Claude · Gemini · Copilot · DeepSeek · Grok</span>
            </div>

            <div className="admin-ai-grid">
              {/* Models Breakdown */}
              <div className="admin-ai-col">
                <h4 className="admin-subheading">AI Engines & Assistants</h4>
                {(!data.aiTraffic?.models || data.aiTraffic.models.length === 0) ? (
                  <div className="admin-empty-section compact">
                    <span>No AI-referred visits recorded in this period yet. When users click citations in ChatGPT, Perplexity, or Claude, they will appear here.</span>
                  </div>
                ) : (
                  <div className="admin-table-list">
                    {data.aiTraffic.models.map((m) => (
                      <div key={m.name} className="admin-table-row">
                        <div className="referrer-row-left">
                          <span className="ai-model-icon" aria-hidden="true">{m.icon}</span>
                          <span className="referrer-domain">{m.name}</span>
                          <span className="ai-domain-pill">{m.domain}</span>
                        </div>
                        <div className="referrer-row-right">
                          <div className="admin-bar-wrap">
                            <div
                              className="admin-fill-bar admin-fill-bar--ai"
                              style={{ width: `${Math.max(4, m.percentage)}%` }}
                            />
                          </div>
                          <span className="referrer-views-count">{m.visits}</span>
                          <span className="referrer-percent-label">{m.percentage}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top AI Pages */}
              <div className="admin-ai-col">
                <h4 className="admin-subheading">Top Pages Recommended by AI</h4>
                {(!data.aiTraffic?.topPages || data.aiTraffic.topPages.length === 0) ? (
                  <div className="admin-empty-section compact">
                    <span>Awaiting citations from LLM search results.</span>
                  </div>
                ) : (
                  <div className="admin-table-list">
                    {data.aiTraffic.topPages.map((p) => (
                      <div key={p.path} className="admin-table-row">
                        <div className="page-row-left">
                          <code className="page-path">{p.path}</code>
                        </div>
                        <div className="page-row-right">
                          <span className="page-views-badge">{p.visits} AI visits</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
                        {r.isAi && <span className="referrer-ai-tag">AI</span>}
                        <span className="referrer-domain">{r.domain}</span>
                      </div>
                      <div className="referrer-row-right">
                        <div className="admin-bar-wrap">
                          <div
                            className={`admin-fill-bar ${r.isAi ? "admin-fill-bar--ai" : "admin-fill-bar--blue"}`}
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

          {/* User Accounts & Registration Intelligence */}
          <div className="admin-card admin-users-card">
            <div className="admin-card-header">
              <div className="admin-card-title">
                <UserPlus size={16} className="text-teal-600" aria-hidden="true" />
                <h3>User Accounts & Signups</h3>
              </div>
              <div className="admin-users-header-badges">
                <span className="user-stat-badge">
                  Total Users: <strong>{data.userAnalytics?.totalUsers ?? 0}</strong>
                </span>
                <span className="user-stat-badge">
                  Free: <strong>{data.userAnalytics?.freeUsersCount ?? 0}</strong>
                </span>
                <span className="user-stat-badge">
                  Pro: <strong>{data.userAnalytics?.proUsersCount ?? 0}</strong>
                </span>
                <span className="user-stat-badge">
                  Signup Rate: <strong>{data.userAnalytics?.conversionRate ?? 0}%</strong>
                </span>
              </div>
            </div>

            {!data.userAnalytics || data.userAnalytics.recentUsers.length === 0 ? (
              <div className="admin-empty-section">
                <Users size={24} className="text-muted-foreground mb-1" aria-hidden="true" />
                <strong className="text-foreground text-sm">No registered user accounts yet</strong>
                <p className="text-xs text-muted-foreground max-w-md text-center mt-1">
                  Visitors currently browse in 100% Free Guest Mode (8 searches/day without signup). When a user signs in with Google or Email (to track apps or chat with the AI assistant), their profile, plan, and cloud sync status will appear here in real time.
                </p>
              </div>
            ) : (
              <div className="admin-users-table">
                {data.userAnalytics.recentUsers.map((user) => (
                  <div key={user.id} className="admin-user-row">
                    <div className="user-avatar-circle" aria-hidden="true">
                      {user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                    </div>

                    <div className="user-info-wrap">
                      <span className="user-email-text" title={user.email}>
                        {user.email}
                      </span>
                      <span className="user-name-text">
                        {user.name || "No display name"}
                      </span>
                    </div>

                    <div>
                      {user.provider === "google" ? (
                        <span className="user-badge-provider user-badge-provider--google">
                          🔵 Google
                        </span>
                      ) : (
                        <span className="user-badge-provider user-badge-provider--email">
                          ✉️ Magic Link
                        </span>
                      )}
                    </div>

                    <div>
                      {user.plan === "pro" ? (
                        <span className="user-badge-plan user-badge-plan--pro">
                          ⭐ Pro
                        </span>
                      ) : (
                        <span className="user-badge-plan user-badge-plan--free">
                          Free
                        </span>
                      )}
                    </div>

                    <div className="user-sync-badge">
                      <HardDrive size={13} aria-hidden="true" />
                      <span>{user.syncCount > 0 ? `${user.syncCount} synced` : "Local only"}</span>
                    </div>

                    <div className="user-time-wrap">
                      <span className="user-time-active">Active {user.lastSeenAgo}</span>
                      <span>Joined {user.timeAgo}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                      {item.isAi ? (
                        <span className="recent-ai-badge">🤖 {item.aiName || "AI"}</span>
                      ) : item.referrer !== "direct" ? (
                        `via ${item.referrer}`
                      ) : (
                        "direct"
                      )}
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
