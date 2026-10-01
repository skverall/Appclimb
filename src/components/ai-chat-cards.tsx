"use client";

import { useState } from "react";
import { Check, ChevronDown, Copy, Database, Wand2 } from "lucide-react";

import type { AiDataCard, MetadataField } from "@/lib/ai-chat";
import { checkMetadata } from "@/lib/ai-metadata";
import { formatWeek } from "@/components/keyword-charts";
import { explorerLink } from "@/lib/keyword-pages";

const COLLAPSED_ROWS = 6;

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`aic-copy${copied ? " is-copied" : ""}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          // Clipboard blocked (insecure context) — nothing to do.
        }
      }}
    >
      {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      {copied ? "Copied" : label}
    </button>
  );
}

/** Apple data a tool returned: popularity bars the user can click into. */
export function AiDataCardView({ card }: { card: AiDataCard }) {
  const [expanded, setExpanded] = useState(false);
  // Apple-scored terms first (most popular on top), long-tail ceilings last.
  const sorted =
    card.tool === "lookup_keywords"
      ? [...card.rows].sort(
          (left, right) =>
            Number(Boolean(left.longTail)) - Number(Boolean(right.longTail)) ||
            right.popularity - left.popularity,
        )
      : card.rows;
  const rows = expanded ? sorted : sorted.slice(0, COLLAPSED_ROWS);
  const hidden = card.rows.length - rows.length;
  return (
    <section className="aic-data" aria-label={card.title}>
      <header className="aic-data-head">
        <Database size={13} aria-hidden="true" />
        <strong>{card.title}</strong>
        <span>
          Apple Ads · {card.country}
          {card.week ? ` · week of ${formatWeek(card.week)}` : ""}
        </span>
      </header>
      <ul className="aic-data-rows">
        {rows.map((row) => (
          <li key={row.term}>
            <a
              href={explorerLink(row.term, card.country)}
              className="aic-data-term"
              title={`Open “${row.term}” in the Keyword Explorer${row.category ? ` · ${row.category}` : ""}`}
            >
              {row.term}
            </a>
            <span
              className={`aic-data-bar${row.longTail ? " is-longtail" : ""}`}
              aria-hidden="true"
            >
              <i style={{ width: `${Math.max(2, Math.min(100, row.popularity))}%` }} />
            </span>
            <span className="aic-data-value">
              {row.longTail ? `≤${row.popularity}` : row.popularity}
            </span>
            <span className="aic-data-extra">
              {row.isNew ? (
                <em className="aic-pill aic-pill--new">New</em>
              ) : row.longTail ? (
                <em className="aic-pill">Long tail</em>
              ) : typeof row.change === "number" && row.change !== 0 ? (
                <em className={`aic-change ${row.change > 0 ? "is-up" : "is-down"}`}>
                  {row.change > 0 ? "▲" : "▼"}
                  {Math.abs(row.change)}
                </em>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {card.rows.length > COLLAPSED_ROWS && (
        <button
          type="button"
          className="aic-data-more"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
        >
          <ChevronDown size={13} aria-hidden="true" />
          {expanded ? "Show less" : `Show ${hidden} more`}
        </button>
      )}
    </section>
  );
}

const FIELD_LABELS: Record<MetadataField, string> = {
  title: "App name",
  subtitle: "Subtitle",
  keywords: "Keyword field",
};

/** A copy-ready title, subtitle, or keyword field with a live character check. */
export function MetadataCard({
  field,
  text,
  appName,
}: {
  field: MetadataField;
  text: string;
  appName?: string;
}) {
  const [useFixed, setUseFixed] = useState(false);
  const original = checkMetadata(field, text, { appName });
  const check = useFixed && original.fixed ? checkMetadata(field, original.fixed, { appName }) : original;
  const over = check.length > check.limit;
  const ratio = Math.min(1, check.length / check.limit);
  return (
    <figure className={`aic-meta${over ? " is-over" : ""}`}>
      <header className="aic-meta-head">
        <span className="aic-meta-label">{FIELD_LABELS[field]}</span>
        <span className="aic-meta-count" aria-label={`${check.length} of ${check.limit} characters`}>
          <span className="aic-meta-meter" aria-hidden="true">
            <i style={{ width: `${ratio * 100}%` }} />
          </span>
          {check.length}/{check.limit}
        </span>
      </header>
      <blockquote className="aic-meta-text">{check.text}</blockquote>
      {check.issues.length > 0 && (
        <ul className="aic-meta-issues">
          {check.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      <footer className="aic-meta-actions">
        <CopyButton text={check.text} />
        {original.fixed && !useFixed && (
          <button type="button" className="aic-copy aic-copy--fix" onClick={() => setUseFixed(true)}>
            <Wand2 size={13} aria-hidden="true" />
            Fix it
          </button>
        )}
        {useFixed && (
          <button type="button" className="aic-copy" onClick={() => setUseFixed(false)}>
            Show original
          </button>
        )}
      </footer>
    </figure>
  );
}

export { CopyButton };
