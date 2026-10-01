// Small illustrations for the pricing page. They explain plan differences
// with shapes, not numbers, and are labeled as illustrations.

import { PLAN_LIMITS } from "@/lib/plan";

const free = PLAN_LIMITS.free;
const pro = PLAN_LIMITS.pro;

/**
 * A seasonal search pattern seen in October: last December's spike sits
 * ~40 weeks back, outside the free plan's 12-week window.
 */
const SEASON = Array.from({ length: 52 }, (_, week) => {
  const wave = Math.sin((week / 52) * Math.PI * 2 + 0.4) * 5;
  const spike = Math.exp(-((week - 11) ** 2) / 9) * 24;
  const drift = Math.sin(week * 1.7) * 1.4;
  return 44 + wave + spike + drift;
});

/** 52 weeks of Apple history vs the last 12 the free plan shows. */
export function HistoryIllustration() {
  const width = 560;
  const height = 170;
  const top = 12;
  const bottom = 26;
  const lo = Math.min(...SEASON) - 4;
  const hi = Math.max(...SEASON) + 4;
  const x = (index: number) => (index / (SEASON.length - 1)) * width;
  const y = (value: number) => top + (1 - (value - lo) / (hi - lo)) * (height - top - bottom);
  const line = SEASON.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height - bottom} L0,${height - bottom} Z`;
  const cut = x(SEASON.length - free.historyWeeks);
  return (
    <svg className="pr-ill" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Illustration: a full year of weekly popularity with a December spike that a ${free.historyWeeks}-week window misses`}>
      <defs>
        <linearGradient id="pr-hist-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--teal-500)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--teal-500)" stopOpacity="0" />
        </linearGradient>
        <clipPath id="pr-hist-free">
          <rect x={cut} y="0" width={width - cut} height={height} />
        </clipPath>
      </defs>
      <path d={area} fill="url(#pr-hist-fill)" />
      <path d={line} fill="none" stroke="var(--teal-300)" strokeWidth="2" strokeDasharray="4 3" />
      <path d={line} fill="none" stroke="var(--teal-600)" strokeWidth="2.4" clipPath="url(#pr-hist-free)" />
      <rect x={cut} y={top - 6} width={width - cut} height={height - top - bottom + 6} rx="6" className="pr-ill-window" />
      <line x1="0" x2={width} y1={height - bottom} y2={height - bottom} stroke="var(--line)" />
      <text x="0" y={height - 6} className="pr-ill-label">
        Pro sees all {pro.historyWeeks} weeks
      </text>
      <text x={x(11)} y={y(Math.max(...SEASON)) - 6} textAnchor="middle" className="pr-ill-label">
        Last December
      </text>
      <text x={width} y={height - 6} textAnchor="end" className="pr-ill-label pr-ill-label--strong">
        Free sees the last {free.historyWeeks}
      </text>
    </svg>
  );
}

/** Eight daily checks vs no ceiling. */
export function ChecksIllustration() {
  return (
    <div className="pr-checks" aria-hidden="true">
      <div>
        <span className="pr-checks-label">Free</span>
        <span className="pr-checks-row">
          {Array.from({ length: free.explorerChecksPerDay ?? 8 }, (_, index) => (
            <i key={index} />
          ))}
        </span>
        <b>{free.explorerChecksPerDay}/day</b>
      </div>
      <div>
        <span className="pr-checks-label">Pro</span>
        <span className="pr-checks-row is-pro">
          {Array.from({ length: 22 }, (_, index) => (
            <i key={index} style={{ opacity: Math.max(0.12, 1 - index / 24) }} />
          ))}
        </span>
        <b>No limit</b>
      </div>
    </div>
  );
}

/** One tracked app vs a whole portfolio. */
export function AppsIllustration() {
  const names = ["Habit", "Budget", "Focus", "Recipes", "Trips"];
  return (
    <div className="pr-apps" aria-hidden="true">
      <div>
        <span className="pr-checks-label">Free</span>
        <span className="pr-app-row">
          <span className="pr-app">H</span>
          <span className="pr-app-meta">
            {free.trackedApps} app · {free.keywordsPerApp} keywords
          </span>
        </span>
      </div>
      <div>
        <span className="pr-checks-label">Pro</span>
        <span className="pr-app-row">
          {names.map((name, index) => (
            <span key={name} className="pr-app" style={{ zIndex: names.length - index }}>
              {name.charAt(0)}
            </span>
          ))}
          <span className="pr-app-meta">Every app · every keyword</span>
        </span>
      </div>
    </div>
  );
}

/** Assistant allowance as two bars. */
export function AssistantIllustration() {
  const max = pro.aiMessagesPerDay ?? 200;
  return (
    <div className="pr-bars" aria-hidden="true">
      <div>
        <span className="pr-checks-label">Free</span>
        <span className="pr-bar">
          <i style={{ width: `${Math.max(3, ((free.aiMessagesPerDay ?? 0) / max) * 100)}%` }} />
        </span>
        <b>{free.aiMessagesPerDay}</b>
      </div>
      <div>
        <span className="pr-checks-label">Pro</span>
        <span className="pr-bar is-pro">
          <i style={{ width: "100%" }} />
        </span>
        <b>{max}</b>
      </div>
      <p className="pr-bars-caption">messages a day</p>
    </div>
  );
}

/** A limit as two meters (Free vs Pro) for the comparison table. */
export function LimitMeter({ value, max, unlimited }: { value: number; max: number; unlimited?: boolean }) {
  return (
    <span className={`pr-meter${unlimited ? " is-unlimited" : ""}`} aria-hidden="true">
      <i style={{ width: unlimited ? "100%" : `${Math.max(4, Math.min(100, (value / max) * 100))}%` }} />
    </span>
  );
}
