"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, Eraser, Wand2 } from "lucide-react";

import { METADATA_LIMITS, type MetadataField } from "@/lib/ai-chat";
import { checkMetadata } from "@/lib/ai-metadata";
import { cleanWord, extractMetadataWords } from "@/lib/aso-optimizer";
import { explorerLink } from "@/lib/keyword-pages";

const FIELDS: Array<{ field: MetadataField; label: string; placeholder: string }> = [
  { field: "title", label: "App name", placeholder: "Ritual: Habit Tracker" },
  { field: "subtitle", label: "Subtitle", placeholder: "Daily Goals & Routine Planner" },
  { field: "keywords", label: "Keyword field", placeholder: "todo,checklist,reminder,streak,journal" },
];

const EXAMPLE: Record<MetadataField, string> = {
  title: "Ritual: Habit Tracker",
  subtitle: "Daily Habit Goals & Routines",
  keywords: "habit, tracker,todo,checklist,reminder,streak,morning routine,journal",
};

const FIELD_SHORT: Record<MetadataField, string> = {
  title: "Name",
  subtitle: "Subtitle",
  keywords: "Keywords",
};

/** Each distinct word Apple can match, tagged with the first field it came from. */
export function indexedWords(values: Record<MetadataField, string>): Array<{ word: string; field: MetadataField }> {
  const out = new Map<string, MetadataField>();
  for (const field of ["title", "subtitle"] as const) {
    for (const word of extractMetadataWords(values[field])) if (!out.has(word)) out.set(word, field);
  }
  for (const term of values.keywords.split(/[,\n]+/u)) {
    for (const raw of term.split(/\s+/u)) {
      const word = cleanWord(raw);
      if (word.length > 1 && !out.has(word)) out.set(word, "keywords");
    }
  }
  return [...out].map(([word, field]) => ({ word, field }));
}

/**
 * Live checker for the three indexed fields: character counts, words
 * repeated across fields, and wasted keyword-field characters, with a
 * one-click fix. Runs entirely in the browser. `showIndex` adds the list of
 * words Apple can match, each linking to its popularity in the explorer.
 */
export function MetadataChecker({
  showIndex = false,
  country = "US",
}: {
  showIndex?: boolean;
  country?: string;
} = {}) {
  const [values, setValues] = useState<Record<MetadataField, string>>(EXAMPLE);
  const [copied, setCopied] = useState(false);

  const checks = {
    title: checkMetadata("title", values.title),
    subtitle: checkMetadata("subtitle", values.subtitle, { appName: values.title }),
    keywords: checkMetadata("keywords", values.keywords, {
      appName: `${values.title} ${values.subtitle}`,
    }),
  };
  const issues = Object.values(checks).reduce((sum, check) => sum + check.issues.length, 0);

  return (
    <div className="gd-checker">
      <div className="gd-checker-head">
        <strong>Check your metadata</strong>
        <span className={issues === 0 ? "is-ok" : "is-warn"}>
          {issues === 0 ? (
            <>
              <Check size={13} aria-hidden="true" /> No wasted characters
            </>
          ) : (
            `${issues} thing${issues === 1 ? "" : "s"} to fix`
          )}
        </span>
      </div>
      {FIELDS.map(({ field, label, placeholder }) => {
        const check = checks[field];
        const over = check.length > check.limit;
        const ratio = Math.min(1, check.length / METADATA_LIMITS[field]);
        return (
          <label key={field} className={`gd-checker-field${over ? " is-over" : ""}`}>
            <span className="gd-checker-label">
              {label}
              <b>
                {check.length}/{check.limit}
              </b>
            </span>
            {field === "keywords" ? (
              <textarea
                value={values[field]}
                placeholder={placeholder}
                rows={3}
                spellCheck={false}
                onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))}
              />
            ) : (
              <input
                value={values[field]}
                placeholder={placeholder}
                spellCheck={false}
                onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))}
              />
            )}
            <span className="gd-checker-meter" aria-hidden="true">
              <i style={{ width: `${ratio * 100}%` }} />
            </span>
            {check.issues.length > 0 && (
              <ul className="gd-checker-issues">
                {check.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
          </label>
        );
      })}
      <div className="gd-checker-actions">
        {checks.keywords.fixed && (
          <button
            type="button"
            className="gd-btn gd-btn--primary"
            onClick={() => setValues((current) => ({ ...current, keywords: checks.keywords.fixed ?? current.keywords }))}
          >
            <Wand2 size={14} aria-hidden="true" /> Fix the keyword field
          </button>
        )}
        <button
          type="button"
          className="gd-btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(checks.keywords.text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              // Clipboard blocked; nothing to do.
            }
          }}
        >
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied ? "Copied" : "Copy keyword field"}
        </button>
        {showIndex && (
          <button
            type="button"
            className="gd-btn"
            onClick={() => setValues({ title: "", subtitle: "", keywords: "" })}
          >
            <Eraser size={14} aria-hidden="true" /> Clear to paste yours
          </button>
        )}
      </div>
      {showIndex && <IndexedWords values={values} country={country} />}
      <p className="gd-checker-note">Runs in your browser; nothing is sent anywhere.</p>
    </div>
  );
}

function IndexedWords({ values, country }: { values: Record<MetadataField, string>; country: string }) {
  const words = indexedWords(values);
  const free = Math.max(0, METADATA_LIMITS.keywords - [...values.keywords.trim()].length);
  if (words.length === 0) return null;
  return (
    <div className="gd-index">
      <div className="gd-index-head">
        <strong>{`${words.length} words Apple can match`}</strong>
        <span>{`${free} keyword-field characters left`}</span>
      </div>
      <ul>
        {words.map(({ word, field }) => (
          <li key={word}>
            <Link href={explorerLink(word, country)} className={`gd-index-word is-${field}`} title={`Check “${word}” popularity`}>
              {word}
              <small>{FIELD_SHORT[field]}</small>
            </Link>
          </li>
        ))}
      </ul>
      <p>
        Apple combines these words into phrases on its own, so “habit” plus “tracker” also
        matches “habit tracker”. Click any word to see its Apple popularity and who ranks for it.
      </p>
    </div>
  );
}

/** Table of contents that highlights the section being read. */
export function GuideToc({ sections }: { sections: ReadonlyArray<{ id: string; label: string }> }) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? "");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [sections]);
  const index = Math.max(0, sections.findIndex((section) => section.id === active));
  return (
    <nav className="gd-toc" aria-label="Guide sections">
      <strong>In this guide</strong>
      <span className="gd-toc-progress" aria-hidden="true">
        <i style={{ height: `${((index + 1) / sections.length) * 100}%` }} />
      </span>
      <ol>
        {sections.map((section, position) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className={section.id === active ? "is-active" : position < index ? "is-done" : undefined}
              aria-current={section.id === active ? "location" : undefined}
            >
              <span>{position + 1}</span>
              {section.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
