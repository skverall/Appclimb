// Diagrams for the keyword research guide. Static, accessible, and labeled
// as examples wherever they show numbers.

import { ArrowRight, Download, Eye, MousePointerClick, Search } from "lucide-react";

/** Search → results → product page → install, and which lever moves each step. */
export function SearchFunnel() {
  const stages = [
    { icon: Search, title: "Search", body: "Someone types a term", lever: "Your keywords decide if you appear" },
    { icon: Eye, title: "Results", body: "Your app shows up — or doesn’t", lever: "Name, subtitle & keyword field" },
    { icon: MousePointerClick, title: "Tap", body: "The result earns a look", lever: "Icon, name, rating, screenshots" },
    { icon: Download, title: "Install", body: "The product page converts", lever: "Screenshots, reviews, price" },
  ];
  return (
    <figure className="gd-funnel">
      <ol>
        {stages.map((stage, index) => {
          const Icon = stage.icon;
          return (
            <li key={stage.title} className={index < 2 ? "is-keywords" : undefined}>
              <span className="gd-funnel-icon" aria-hidden="true">
                <Icon size={18} />
              </span>
              <strong>{stage.title}</strong>
              <span>{stage.body}</span>
              <em>{stage.lever}</em>
              {index < stages.length - 1 && <ArrowRight className="gd-funnel-arrow" size={16} aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
      <figcaption>
        <span className="gd-key gd-key--teal" /> Keyword research moves these two steps
        <span className="gd-key gd-key--grey" /> Your product page moves these
      </figcaption>
    </figure>
  );
}

/** Apple's 1–100 scale: the published top lists vs the long tail below them. */
export function PopularityScale() {
  const floor = 45;
  const examples = [
    { term: "habit tracker", value: 61 },
    { term: "calendar", value: 74 },
    { term: "habit app for adhd", value: floor, longTail: true },
  ];
  return (
    <figure className="gd-scale">
      <div className="gd-scale-track" aria-hidden="true">
        <span className="gd-scale-tail" style={{ width: `${floor}%` }}>
          Long tail · ≤{floor}
        </span>
        <span className="gd-scale-published" style={{ left: `${floor}%` }}>
          Apple’s top 500 per category
        </span>
        {examples.map((example) => (
          <span
            key={example.term}
            className={`gd-scale-pin${example.longTail ? " is-tail" : ""}`}
            style={{ left: `${example.value}%` }}
          >
            <b>{example.longTail ? `≤${example.value}` : example.value}</b>
            <small>{example.term}</small>
          </span>
        ))}
      </div>
      <div className="gd-scale-axis" aria-hidden="true">
        <span>1</span>
        <span>50</span>
        <span>100</span>
      </div>
      <figcaption>
        Example values. Apple publishes a score only for each category’s most-searched terms; everything
        below that list is honestly “at or below” the category’s lowest published score.
      </figcaption>
    </figure>
  );
}

/** Page one as evidence: rating weight and name matches drive difficulty. */
export function PageOneEvidence() {
  const apps = [
    { name: "Momentum Daily", ratings: 38_000, inName: false },
    { name: "Habit Tracker — Daily Goals", ratings: 9_400, inName: true },
    { name: "Planwise", ratings: 31_000, inName: false },
    { name: "Tiny Steps: Habit Tracker", ratings: 2_100, inName: true },
    { name: "Ritual — Habit Tracker", ratings: 640, inName: true },
  ];
  const max = Math.max(...apps.map((app) => app.ratings));
  return (
    <figure className="gd-pageone">
      <header>
        <span>Page one for “habit tracker”</span>
        <span>Ratings</span>
      </header>
      <ol>
        {apps.map((app, index) => (
          <li key={app.name}>
            <span className="gd-pageone-rank">#{index + 1}</span>
            <span className="gd-pageone-name">
              {app.name}
              {app.inName && <em>term in name</em>}
            </span>
            <span className="gd-pageone-bar" aria-hidden="true">
              <i style={{ width: `${Math.max(3, (app.ratings / max) * 100)}%` }} />
            </span>
            <span className="gd-pageone-count">
              {app.ratings >= 1000 ? `${(app.ratings / 1000).toFixed(app.ratings >= 10_000 ? 0 : 1)}k` : app.ratings}
            </span>
          </li>
        ))}
      </ol>
      <footer>
        <span className="gd-pageone-weak">#5 has only 640 ratings — page one isn’t closed.</span>
        <span className="gd-pageone-score">
          Difficulty <b>~68</b>
        </span>
      </footer>
      <figcaption>Illustrative apps and numbers.</figcaption>
    </figure>
  );
}

/** Popularity × difficulty, with AppClimb's verdict in each corner. */
export function VerdictMatrix() {
  // Laid out like a chart: popularity grows to the right, difficulty upward.
  const cells = [
    {
      tone: "bad",
      title: "Skip",
      body: "Few searches and a crowded page one — or a page held by entrenched apps or a brand.",
      where: "Long tail above 45 · or difficulty 75+",
    },
    {
      tone: "warn",
      title: "Competitive",
      body: "Real demand, strong incumbents. Needs ratings and the term in your name.",
      where: "Popular · difficulty 51–74",
    },
    {
      tone: "calm",
      title: "Long-tail win",
      body: "Few searches, weak page one. Fast first ranks that add up.",
      where: "Long tail · difficulty ≤ 45",
    },
    {
      tone: "good",
      title: "Worth targeting",
      body: "Apple shows demand and page one is beatable. Your first priority.",
      where: "Popular · difficulty ≤ 50",
    },
  ];
  return (
    <figure className="gd-matrix">
      <div className="gd-matrix-grid">
        {cells.map((cell) => (
          <div key={cell.title} className={`gd-matrix-cell gd-matrix-cell--${cell.tone}`}>
            <strong>{cell.title}</strong>
            <p>{cell.body}</p>
            <small>{cell.where}</small>
          </div>
        ))}
        <span className="gd-matrix-y" aria-hidden="true">
          Difficulty ↑ harder
        </span>
        <span className="gd-matrix-x" aria-hidden="true">
          Popularity → more searches
        </span>
      </div>
      <figcaption>
        The bottom row is where new apps win first. Apple popularity above ~35 counts as real demand;
        brand searches are dominated wherever they land.
      </figcaption>
    </figure>
  );
}

/** A keyword list as a portfolio: a few reach bets, a middle band, a long tail. */
export function ListMix() {
  const parts = [
    { label: "Reach bets", share: 15, note: "3–8 popular terms you grow into", tone: "dark" },
    { label: "Middle band", share: 35, note: "Beatable terms with Apple demand", tone: "mid" },
    { label: "Long tail", share: 50, note: "Specific phrases you can win this month", tone: "light" },
  ];
  return (
    <figure className="gd-mix">
      <div className="gd-mix-bar" aria-hidden="true">
        {parts.map((part) => (
          <span key={part.label} className={`gd-mix-${part.tone}`} style={{ flexGrow: part.share }}>
            {part.share}%
          </span>
        ))}
      </div>
      <ul>
        {parts.map((part) => (
          <li key={part.label}>
            <i className={`gd-mix-${part.tone}`} aria-hidden="true" />
            <strong>{part.label}</strong>
            <span>{part.note}</span>
          </li>
        ))}
      </ul>
      <figcaption>A working list of 30–50 terms, roughly in these proportions.</figcaption>
    </figure>
  );
}

/** Where each field's words go, with App Store Connect limits. */
export function MetadataAnatomy() {
  const fields = [
    { label: "App name", text: "Ritual: Habit Tracker", limit: 30, weight: "Strongest signal" },
    { label: "Subtitle", text: "Daily Goals & Routine Planner", limit: 30, weight: "Strong signal" },
    {
      label: "Keyword field",
      text: "todo,checklist,reminder,discipline,streak,morning,journal,adhd,focus,self,care",
      limit: 100,
      weight: "Hidden, single words",
    },
  ];
  return (
    <figure className="gd-anatomy">
      {fields.map((field) => {
        const length = [...field.text].length;
        return (
          <div key={field.label} className="gd-anatomy-row">
            <div className="gd-anatomy-head">
              <strong>{field.label}</strong>
              <span>{field.weight}</span>
              <b>
                {length}/{field.limit}
              </b>
            </div>
            <p className={field.limit === 100 ? "is-mono" : undefined}>{field.text}</p>
            <span className="gd-anatomy-meter" aria-hidden="true">
              <i style={{ width: `${(length / field.limit) * 100}%` }} />
            </span>
          </div>
        );
      })}
      <figcaption>
        Example. Apple combines words across all three fields, so “habit” in the name plus “planner” in
        the subtitle can rank for “habit planner” without repeating either word.
      </figcaption>
    </figure>
  );
}

/** The weekly loop as a ring of steps. */
export function WeeklyLoop() {
  const steps = [
    "Check ranks",
    "Spot movers",
    "Pick one change",
    "Ship the update",
    "Wait 1–2 weeks",
  ];
  const size = 260;
  const radius = 92;
  const center = size / 2;
  return (
    <figure className="gd-loop">
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Weekly loop: ${steps.join(", then ")}, then repeat`}>
        <defs>
          <marker id="gd-loop-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--teal-400)" />
          </marker>
        </defs>
        <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--teal-100)" strokeWidth="14" />
        {steps.map((step, index) => {
          const angle = (index / steps.length) * Math.PI * 2 - Math.PI / 2;
          const next = ((index + 0.62) / steps.length) * Math.PI * 2 - Math.PI / 2;
          const start = ((index + 0.38) / steps.length) * Math.PI * 2 - Math.PI / 2;
          const px = center + Math.cos(angle) * radius;
          const py = center + Math.sin(angle) * radius;
          return (
            <g key={step}>
              <path
                d={`M${center + Math.cos(start) * radius},${center + Math.sin(start) * radius} A${radius},${radius} 0 0 1 ${center + Math.cos(next) * radius},${center + Math.sin(next) * radius}`}
                fill="none"
                stroke="var(--teal-400)"
                strokeWidth="2"
                markerEnd="url(#gd-loop-arrow)"
              />
              <circle cx={px} cy={py} r="17" fill="var(--teal-600)" />
              <text x={px} y={py + 5} textAnchor="middle" className="gd-loop-num">
                {index + 1}
              </text>
            </g>
          );
        })}
        <text x={center} y={center - 4} textAnchor="middle" className="gd-loop-center">
          Every
        </text>
        <text x={center} y={center + 16} textAnchor="middle" className="gd-loop-center">
          week
        </text>
      </svg>
      <ol className="gd-loop-steps">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </figure>
  );
}
