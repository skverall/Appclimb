"use client";

import { useEffect, useRef, useState } from "react";

export interface KeywordMapPoint {
  keyword: string;
  normalizedKeyword: string;
  popularity: number;
  /** Long-tail popularity is a ceiling; drawn hollow. */
  longTail: boolean;
  difficulty: number;
  position: number | null;
}

/** Same bands as the rankings overview. */
function bandOf(position: number | null): "top10" | "top50" | "top200" | "outside" {
  if (position === null || position > 200) return "outside";
  if (position <= 10) return "top10";
  if (position <= 50) return "top50";
  return "top200";
}

const QUADRANTS = [
  { label: "Sweet spot", hint: "demand, beatable", x: "right", y: "bottom", tone: "good" },
  { label: "Competitive", hint: "demand, strong rivals", x: "right", y: "top", tone: "warn" },
  { label: "Easy niche", hint: "low demand, easy", x: "left", y: "bottom", tone: "calm" },
  { label: "Skip", hint: "low demand, hard", x: "left", y: "top", tone: "bad" },
] as const;

/**
 * Scatter of tracked keywords: Apple popularity (x) against difficulty (y),
 * colored by where the app ranks. Click a dot to open the keyword.
 */
export function KeywordMap({
  points,
  onSelect,
}: {
  points: KeywordMapPoint[];
  onSelect: (normalizedKeyword: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (points.length === 0) return null;

  const height = width < 520 ? 240 : 280;
  const pad = { left: 34, right: 12, top: 12, bottom: 28 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  // Apple's published scores live roughly in 40–75; zoom to the data with
  // a sensible minimum span so dots don't pile up on one edge.
  const pops = points.map((point) => point.popularity);
  let xMin = Math.min(...pops);
  let xMax = Math.max(...pops);
  if (xMax - xMin < 20) {
    const mid = (xMin + xMax) / 2;
    xMin = mid - 10;
    xMax = mid + 10;
  }
  xMin = Math.max(0, Math.floor(xMin - 3));
  xMax = Math.min(100, Math.ceil(xMax + 3));
  const xSplit = Math.min(xMax - 1, Math.max(xMin + 1, 50));
  const ySplit = 50;
  const x = (value: number) => pad.left + ((value - xMin) / (xMax - xMin || 1)) * plotW;
  const y = (value: number) => pad.top + (1 - value / 100) * plotH;
  const active = points.find((point) => point.normalizedKeyword === hover) ?? null;

  // Greedy label placement: right, left, above, below — skip a label rather
  // than draw it over another one (hover still names every dot).
  type Box = [number, number, number, number];
  const overlaps = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  const placed: Box[] = points.map((point) => {
    const cx = x(point.popularity);
    const cy = y(point.difficulty);
    return [cx - 8, cy - 8, cx + 8, cy + 8];
  });
  const labels = new Map<string, { x: number; y: number; anchor: "start" | "end" | "middle"; text: string }>();
  const byRank = [...points].sort((left, right) => (left.position ?? 999) - (right.position ?? 999));
  for (const point of byRank) {
    const text = point.keyword.length > 22 ? `${point.keyword.slice(0, 21)}…` : point.keyword;
    const textWidth = text.length * 6.2;
    const cx = x(point.popularity);
    const cy = y(point.difficulty);
    const candidates: Array<{ x: number; y: number; anchor: "start" | "end" | "middle"; box: Box }> = [
      { x: cx + 11, y: cy + 4, anchor: "start", box: [cx + 10, cy - 7, cx + 12 + textWidth, cy + 7] },
      { x: cx - 11, y: cy + 4, anchor: "end", box: [cx - 12 - textWidth, cy - 7, cx - 10, cy + 7] },
      { x: cx, y: cy - 12, anchor: "middle", box: [cx - textWidth / 2, cy - 23, cx + textWidth / 2, cy - 9] },
      { x: cx, y: cy + 20, anchor: "middle", box: [cx - textWidth / 2, cy + 9, cx + textWidth / 2, cy + 23] },
    ];
    const fit = candidates.find(
      (candidate) =>
        candidate.box[0] >= pad.left &&
        candidate.box[2] <= width - 2 &&
        candidate.box[1] >= 0 &&
        candidate.box[3] <= height - pad.bottom + 4 &&
        !placed.some((box, index) => {
          const own = points.indexOf(point) === index;
          return !own && overlaps(candidate.box, box);
        }),
    );
    if (fit) {
      labels.set(point.normalizedKeyword, { x: fit.x, y: fit.y, anchor: fit.anchor, text });
      placed.push(fit.box);
    }
  }

  return (
    <section className="km" aria-labelledby="km-title">
      <div className="km-head">
        <h2 id="km-title">Keyword map</h2>
        <ul className="km-legend" aria-label="Dot color: where your app ranks">
          <li>
            <i className="km-dot km-dot--top10" /> Top 10
          </li>
          <li>
            <i className="km-dot km-dot--top50" /> 11–50
          </li>
          <li>
            <i className="km-dot km-dot--top200" /> 51–200
          </li>
          <li>
            <i className="km-dot km-dot--outside" /> Not ranked
          </li>
        </ul>
      </div>
      <div className="km-chart" ref={ref}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Keyword map: ${points.length} keywords by popularity and difficulty`}
        >
          {/* Quadrant tints */}
          <rect className="km-q km-q--good" x={x(xSplit)} y={y(ySplit)} width={x(xMax) - x(xSplit)} height={y(0) - y(ySplit)} />
          <rect className="km-q km-q--warn" x={x(xSplit)} y={y(100)} width={x(xMax) - x(xSplit)} height={y(ySplit) - y(100)} />
          <rect className="km-q km-q--calm" x={x(xMin)} y={y(ySplit)} width={x(xSplit) - x(xMin)} height={y(0) - y(ySplit)} />
          <rect className="km-q km-q--bad" x={x(xMin)} y={y(100)} width={x(xSplit) - x(xMin)} height={y(ySplit) - y(100)} />
          {QUADRANTS.map((quadrant) => {
            const qx = quadrant.x === "right" ? x(xMax) - 8 : x(xMin) + 8;
            const qy = quadrant.y === "top" ? y(100) + 16 : y(0) - 10;
            return (
              <text
                key={quadrant.label}
                className={`km-q-label km-q-label--${quadrant.tone}`}
                x={qx}
                y={qy}
                textAnchor={quadrant.x === "right" ? "end" : "start"}
              >
                {quadrant.label}
              </text>
            );
          })}
          {/* Axes */}
          <line className="km-axis" x1={pad.left} x2={pad.left} y1={y(100)} y2={y(0)} />
          <line className="km-axis" x1={pad.left} x2={x(xMax)} y1={y(0)} y2={y(0)} />
          {[0, 50, 100].map((value) => (
            <text key={value} className="km-tick" x={pad.left - 6} y={y(value) + 4} textAnchor="end">
              {value}
            </text>
          ))}
          {[xMin, xSplit, xMax].map((value) => (
            <text key={value} className="km-tick" x={x(value)} y={y(0) + 16} textAnchor="middle">
              {value}
            </text>
          ))}
          <text className="km-axis-label" x={x(xMax)} y={height - 2} textAnchor="end">
            Popularity (Apple) →
          </text>
          <text
            className="km-axis-label"
            x={10}
            y={y(50)}
            textAnchor="middle"
            transform={`rotate(-90 10 ${y(50)})`}
          >
            Difficulty →
          </text>
          {/* Dots: not-ranked first so ranked ones sit on top. */}
          {[...points]
            .sort((left, right) => (left.position ?? 999) - (right.position ?? 999))
            .reverse()
            .map((point) => {
              const cx = x(point.popularity);
              const cy = y(point.difficulty);
              const band = bandOf(point.position);
              const isActive = hover === point.normalizedKeyword;
              return (
                <g
                  key={point.normalizedKeyword}
                  className="km-point"
                  onMouseEnter={() => setHover(point.normalizedKeyword)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onSelect(point.normalizedKeyword)}
                >
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isActive ? 9 : 7}
                    className={`km-dot km-dot--${band}${point.longTail ? " is-longtail" : ""}`}
                  />
                  {labels.has(point.normalizedKeyword) && (
                    <text
                      className="km-label"
                      x={labels.get(point.normalizedKeyword)!.x}
                      y={labels.get(point.normalizedKeyword)!.y}
                      textAnchor={labels.get(point.normalizedKeyword)!.anchor}
                    >
                      {labels.get(point.normalizedKeyword)!.text}
                    </text>
                  )}
                </g>
              );
            })}
        </svg>
        {active && (
          <div
            className="km-tooltip"
            style={{
              left: `${(x(active.popularity) / width) * 100}%`,
              top: `${(y(active.difficulty) / height) * 100}%`,
            }}
          >
            <strong>{active.keyword}</strong>
            <span>
              Popularity <b>{active.longTail ? `≤${active.popularity}` : active.popularity}</b>
            </span>
            <span>
              Difficulty <b>{active.difficulty}</b>
            </span>
            <span>
              Your rank <b>{active.position === null ? ">200" : `#${active.position}`}</b>
            </span>
          </div>
        )}
      </div>
      <p className="km-foot">
        Hollow dots are long-tail terms (popularity is a ceiling). Click a dot to open it.
      </p>
    </section>
  );
}
