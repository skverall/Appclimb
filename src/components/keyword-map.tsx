"use client";

import { useEffect, useRef, useState } from "react";

import { useElementSize } from "@/components/use-element-size";
import { DEMAND_POPULARITY_FLOOR, TARGET_DIFFICULTY_MAX } from "@/lib/aso";

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

// Splits match the verdict logic: no demand at or below the popularity
// floor, a beatable first page at or below the target difficulty.
const X_SPLIT = DEMAND_POPULARITY_FLOOR;
const Y_SPLIT = TARGET_DIFFICULTY_MAX;

const QUADRANTS = [
  { tone: "bad", label: "Skip", side: "left", row: "top" },
  { tone: "warn", label: "Competitive", side: "right", row: "top" },
  { tone: "calm", label: "Easy niche", side: "left", row: "bottom" },
  { tone: "good", label: "Sweet spot", side: "right", row: "bottom" },
] as const;

const LABEL_FONT_SIZE = 11.5;
const QUADRANT_FONT_SIZE = 11;
const DOT_RADIUS = 6.5;

let measureContext: CanvasRenderingContext2D | null | undefined;

/** Rendered text width, so labels are placed by their real size. */
function textWidth(text: string, font: string, fallbackPerChar: number): number {
  if (measureContext === undefined) {
    measureContext =
      typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  }
  if (!measureContext) return text.length * fallbackPerChar;
  measureContext.font = font;
  return measureContext.measureText(text).width;
}

/** Zoom to the data, keep the split visible, and snap to multiples of 5. */
function axisDomain(values: number[], split: number): [number, number] {
  let lo = Math.min(...values, split - 8);
  let hi = Math.max(...values, split + 8);
  const pad = (hi - lo) * 0.06;
  lo = Math.max(0, Math.floor((lo - pad) / 5) * 5);
  hi = Math.min(100, Math.ceil((hi + pad) / 5) * 5);
  return [lo, hi];
}

type Box = { x1: number; y1: number; x2: number; y2: number };

const overlaps = (a: Box, b: Box) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;

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
  const { width } = useElementSize(ref, { width: 900, height: 0 });
  const [fontFamily, setFontFamily] = useState("system-ui, sans-serif");
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    if (ref.current) setFontFamily(getComputedStyle(ref.current).fontFamily);
  }, []);

  if (points.length === 0) return null;

  const height = width < 560 ? 270 : 330;
  const plot = { left: 48, right: width - 12, top: 4, bottom: height - 42 };
  // Quadrant names sit in strips along the top and bottom edges; dots
  // stay out of them, so a name never lands on a dot.
  const strip = 24;
  const data = {
    left: plot.left + 14,
    right: plot.right - 14,
    top: plot.top + strip + DOT_RADIUS + 4,
    bottom: plot.bottom - strip - DOT_RADIUS - 4,
  };
  const [xMin, xMax] = axisDomain(points.map((point) => point.popularity), X_SPLIT);
  const [yMin, yMax] = axisDomain(points.map((point) => point.difficulty), Y_SPLIT);
  const x = (value: number) => data.left + ((value - xMin) / (xMax - xMin || 1)) * (data.right - data.left);
  const y = (value: number) => data.bottom - ((value - yMin) / (yMax - yMin || 1)) * (data.bottom - data.top);
  const splitX = x(X_SPLIT);
  const splitY = y(Y_SPLIT);

  const labelFont = `600 ${LABEL_FONT_SIZE}px ${fontFamily}`;
  const quadrantFont = `700 ${QUADRANT_FONT_SIZE}px ${fontFamily}`;
  const obstacles: Box[] = points.map((point) => {
    const cx = x(point.popularity);
    const cy = y(point.difficulty);
    const r = DOT_RADIUS + 2;
    return { x1: cx - r, y1: cy - r, x2: cx + r, y2: cy + r };
  });

  // Quadrant names: drawn only where their half is wide enough.
  const quadrantLabels = QUADRANTS.flatMap((quadrant) => {
    const text = quadrant.label.toUpperCase();
    const w = textWidth(text, quadrantFont, 7.4) + QUADRANT_FONT_SIZE * 0.04 * text.length;
    const from = quadrant.side === "left" ? plot.left : splitX;
    const to = quadrant.side === "left" ? splitX : plot.right;
    if (to - from < w + 20) return [];
    const tx = quadrant.side === "left" ? from + 10 : to - 10;
    const ty = quadrant.row === "top" ? plot.top + 16 : plot.bottom - 9;
    const box: Box = {
      x1: quadrant.side === "left" ? tx - 4 : tx - w - 4,
      x2: quadrant.side === "left" ? tx + w + 4 : tx + 4,
      y1: ty - 12,
      y2: ty + 4,
    };
    obstacles.push(box);
    return [{ ...quadrant, text, tx, ty }];
  });

  // Greedy labels, most important first (ranked, then popular). A label
  // that fits nowhere is skipped; hovering still names every dot.
  const labels = new Map<string, { x: number; y: number; text: string }>();
  const order = [...points].sort(
    (left, right) =>
      (left.position ?? 999) - (right.position ?? 999) || right.popularity - left.popularity,
  );
  for (const point of order) {
    const text = point.keyword.length > 24 ? `${point.keyword.slice(0, 23)}…` : point.keyword;
    const w = textWidth(text, labelFont, 6.6);
    const h = 13;
    const cx = x(point.popularity);
    const cy = y(point.difficulty);
    const r = DOT_RADIUS;
    const candidates: Box[] = [
      { x1: cx + r + 5, y1: cy - h / 2, x2: cx + r + 5 + w, y2: cy + h / 2 },
      { x1: cx - r - 5 - w, y1: cy - h / 2, x2: cx - r - 5, y2: cy + h / 2 },
      { x1: cx - w / 2, y1: cy - r - 4 - h, x2: cx + w / 2, y2: cy - r - 4 },
      { x1: cx - w / 2, y1: cy + r + 4, x2: cx + w / 2, y2: cy + r + 4 + h },
      { x1: cx + r + 2, y1: cy - r - h + 1, x2: cx + r + 2 + w, y2: cy - r + 1 },
      { x1: cx + r + 2, y1: cy + r - 1, x2: cx + r + 2 + w, y2: cy + r - 1 + h },
      { x1: cx - r - 2 - w, y1: cy - r - h + 1, x2: cx - r - 2, y2: cy - r + 1 },
      { x1: cx - r - 2 - w, y1: cy + r - 1, x2: cx - r - 2, y2: cy + r - 1 + h },
    ];
    const fit = candidates.find(
      (box) =>
        box.x1 >= plot.left + 3 &&
        box.x2 <= plot.right - 3 &&
        box.y1 >= plot.top + 3 &&
        box.y2 <= plot.bottom - 3 &&
        !obstacles.some((other) => overlaps(box, other)),
    );
    if (!fit) continue;
    obstacles.push({ x1: fit.x1 - 2, y1: fit.y1 - 1, x2: fit.x2 + 2, y2: fit.y2 + 1 });
    labels.set(point.normalizedKeyword, { x: fit.x1, y: fit.y2 - 3, text });
  }

  const active = points.find((point) => point.normalizedKeyword === hover) ?? null;
  const activeX = active ? x(active.popularity) : 0;
  const activeY = active ? y(active.difficulty) : 0;
  const hasLongTail = points.some((point) => point.longTail);
  // Ranked dots draw last so they sit on top.
  const drawOrder = [...order].reverse();

  return (
    <section className="km" aria-labelledby="km-title">
      <div className="km-head">
        <h2 id="km-title">Keyword map</h2>
        <ul className="km-legend" aria-label="Dot color: where your app ranks">
          <li>
            <i className="km-key km-key--top10" /> Top 10
          </li>
          <li>
            <i className="km-key km-key--top50" /> 11–50
          </li>
          <li>
            <i className="km-key km-key--top200" /> 51–200
          </li>
          <li>
            <i className="km-key km-key--outside" /> Not ranked
          </li>
          {hasLongTail && (
            <li title="Below Apple's top searches: popularity is a ceiling">
              <i className="km-key km-key--longtail" /> Long tail
            </li>
          )}
        </ul>
      </div>
      <div className="km-chart" ref={ref}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Keyword map: ${points.length} keywords by popularity and difficulty`}
        >
          <rect className="km-q km-q--bad" x={plot.left} y={plot.top} width={splitX - plot.left} height={splitY - plot.top} />
          <rect className="km-q km-q--warn" x={splitX} y={plot.top} width={plot.right - splitX} height={splitY - plot.top} />
          <rect className="km-q km-q--calm" x={plot.left} y={splitY} width={splitX - plot.left} height={plot.bottom - splitY} />
          <rect className="km-q km-q--good" x={splitX} y={splitY} width={plot.right - splitX} height={plot.bottom - splitY} />
          <line className="km-split" x1={splitX} x2={splitX} y1={plot.top} y2={plot.bottom} />
          <line className="km-split" x1={plot.left} x2={plot.right} y1={splitY} y2={splitY} />
          {quadrantLabels.map((quadrant) => (
            <text
              key={quadrant.tone}
              className={`km-q-label km-q-label--${quadrant.tone}`}
              x={quadrant.tx}
              y={quadrant.ty}
              textAnchor={quadrant.side === "left" ? "start" : "end"}
            >
              {quadrant.text}
            </text>
          ))}

          <line className="km-axis" x1={plot.left} x2={plot.left} y1={plot.top} y2={plot.bottom} />
          <line className="km-axis" x1={plot.left} x2={plot.right} y1={plot.bottom} y2={plot.bottom} />
          {[yMin, Y_SPLIT, yMax].map((value) => (
            <text key={`y${value}`} className="km-tick" x={plot.left - 8} y={y(value) + 4} textAnchor="end">
              {value}
            </text>
          ))}
          {[xMin, X_SPLIT, xMax].map((value) => (
            <text key={`x${value}`} className="km-tick" x={x(value)} y={plot.bottom + 15} textAnchor="middle">
              {value}
            </text>
          ))}
          <text
            className="km-axis-label"
            x={(plot.left + plot.right) / 2}
            y={height - 4}
            textAnchor="middle"
          >
            Popularity (Apple) →
          </text>
          <text
            className="km-axis-label"
            x={12}
            y={(plot.top + plot.bottom) / 2}
            textAnchor="middle"
            transform={`rotate(-90 12 ${(plot.top + plot.bottom) / 2})`}
          >
            Difficulty →
          </text>

          {drawOrder.map((point) => {
            const cx = x(point.popularity);
            const cy = y(point.difficulty);
            const isActive = hover === point.normalizedKeyword;
            const label = labels.get(point.normalizedKeyword);
            return (
              <g
                key={point.normalizedKeyword}
                className={`km-point${hover && !isActive ? " is-dimmed" : ""}`}
                onMouseEnter={() => setHover(point.normalizedKeyword)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelect(point.normalizedKeyword)}
              >
                <circle cx={cx} cy={cy} r={DOT_RADIUS + 6} className="km-hit" />
                <circle
                  cx={cx}
                  cy={cy}
                  r={isActive ? DOT_RADIUS + 2 : DOT_RADIUS}
                  className={`km-dot km-dot--${bandOf(point.position)}${point.longTail ? " is-longtail" : ""}`}
                />
                {label && (
                  <text className="km-label" x={label.x} y={label.y}>
                    {label.text}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {active && (
          <div
            className={`km-tooltip${activeY < 110 ? " is-below" : ""}`}
            style={{ left: Math.min(width - 90, Math.max(90, activeX)), top: activeY }}
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
    </section>
  );
}
