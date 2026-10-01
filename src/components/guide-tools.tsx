"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Wand2 } from "lucide-react";

import { METADATA_LIMITS, type MetadataField } from "@/lib/ai-chat";
import { checkMetadata } from "@/lib/ai-metadata";

const FIELDS: Array<{ field: MetadataField; label: string; placeholder: string }> = [
  { field: "title", label: "App name", placeholder: "Ritual: Habit Tracker" },
  { field: "subtitle", label: "Subtitle", placeholder: "Daily Goals & Routine Planner" },
  { field: "keywords", label: "Keyword field", placeholder: "todo,checklist,reminder,streak,journal" },
];

/**
 * Live checker for the three indexed fields: character counts, words
 * repeated across fields, and wasted keyword-field characters, with a
 * one-click fix. Runs entirely in the browser.
 */
export function MetadataChecker() {
  const [values, setValues] = useState<Record<MetadataField, string>>({
    title: "Ritual: Habit Tracker",
    subtitle: "Daily Habit Goals & Routines",
    keywords: "habit, tracker,todo,checklist,reminder,streak,morning routine,journal",
  });
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
      </div>
      <p className="gd-checker-note">Runs in your browser; nothing is sent anywhere.</p>
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
