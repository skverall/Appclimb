"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  Info,
  Layers,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";

import { useModalFocus } from "@/components/use-modal-focus";
import {
  optimizeKeywordField,
  type KeywordOptimizationResult,
} from "@/lib/aso-optimizer";

function AsoOptimizerModalContent({
  initialKeywords = [],
  appTitle = "",
  appSubtitle = "",
  onClose,
}: {
  initialKeywords?: string[];
  appTitle?: string;
  appSubtitle?: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  useModalFocus(true, modalRef);

  const [rawText, setRawText] = useState(() => initialKeywords.join(", "));
  const [title, setTitle] = useState(appTitle);
  const [subtitle, setSubtitle] = useState(appSubtitle);
  const [stripSpaces, setStripSpaces] = useState(true);
  const [removeTitleWords, setRemoveTitleWords] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const result: KeywordOptimizationResult = useMemo(() => {
    return optimizeKeywordField(rawText, {
      appTitle: title,
      appSubtitle: subtitle,
      stripSpaces,
      removeTitleWords,
      limit: 100,
    });
  }, [rawText, title, subtitle, stripSpaces, removeTitleWords]);

  const onCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(result.optimized);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Ignore
    }
  };

  const percentUsed = Math.min(100, (result.charCount / 100) * 100);
  const isOver = result.charCount > 100;
  const isMax = result.charCount >= 90 && result.charCount <= 100;

  return (
    <div
      className="tracker-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="tracker-modal tracker-modal--wide aso-optimizer-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="tracker-modal-header">
          <div className="aso-optimizer-title-group">
            <span className="aso-optimizer-icon-badge">
              <Wand2 size={18} aria-hidden="true" />
            </span>
            <div>
              <h2 id={titleId}>
                100-Character Keyword Optimizer
              </h2>
              <p>
                Maximize App Store Connect keyword field efficiency with zero wasted bytes
              </p>
            </div>
          </div>
          <button
            type="button"
            className="tracker-icon-button"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="aso-optimizer-body">
          <div className="aso-optimizer-tip-banner">
            <Info size={16} aria-hidden="true" />
            <span>
              <strong>ASO Best Practice:</strong> Apple indexes each single word individually. Do not use plural + singular, do not repeat words already present in your Title or Subtitle, and avoid spaces after commas to conserve precious characters.
            </span>
          </div>

          <div className="aso-optimizer-meta-inputs">
            <div className="aso-optimizer-field">
              <label htmlFor="aso-app-title">App Title (30 char)</label>
              <input
                id="aso-app-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Focus Timer: Habit Tracker"
                maxLength={30}
              />
              <small>{title.length} / 30 chars</small>
            </div>
            <div className="aso-optimizer-field">
              <label htmlFor="aso-app-subtitle">App Subtitle (30 char)</label>
              <input
                id="aso-app-subtitle"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="e.g. Daily Pomodoro Study Plan"
                maxLength={30}
              />
              <small>{subtitle.length} / 30 chars</small>
            </div>
          </div>

          <div className="aso-optimizer-field">
            <label htmlFor="aso-raw-keywords">Target Keywords & Phrases</label>
            <textarea
              id="aso-raw-keywords"
              className="aso-optimizer-textarea"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste phrases or single keywords (e.g. focus timer, productivity app, time tracking, study clock)..."
              rows={3}
            />
            <small>
              Phrases will be broken down into deduplicated, non-redundant individual keyword tokens.
            </small>
          </div>

          <div className="aso-optimizer-toggles">
            <label className="aso-optimizer-checkbox">
              <input
                type="checkbox"
                checked={stripSpaces}
                onChange={(e) => setStripSpaces(e.target.checked)}
              />
              <span>Strip spaces after commas (saves ~15% characters)</span>
            </label>
            <label className="aso-optimizer-checkbox">
              <input
                type="checkbox"
                checked={removeTitleWords}
                onChange={(e) => setRemoveTitleWords(e.target.checked)}
              />
              <span>Exclude words already in Title & Subtitle</span>
            </label>
          </div>

          <div className="aso-optimizer-result-card">
            <div className="aso-optimizer-result-header">
              <span className="eyebrow">Optimized App Store Connect String</span>
              <div className="aso-optimizer-meter">
                <div className="aso-optimizer-progress-bar">
                  <div
                    className={`aso-optimizer-progress-fill ${
                      isOver ? "is-over" : isMax ? "is-max" : "is-good"
                    }`}
                    style={{ width: `${percentUsed}%` }}
                  />
                </div>
                <span
                  className={`aso-optimizer-meter-count ${
                    isOver ? "is-over" : isMax ? "is-max" : ""
                  }`}
                >
                  {result.charCount} / 100 chars
                </span>
              </div>
            </div>

            <div className="aso-optimizer-code-box">
              {result.optimized || <em className="text-muted">Enter keywords above…</em>}
            </div>

            <div className="aso-optimizer-pills">
              <span className="aso-pill aso-pill--green">
                <Sparkles size={12} aria-hidden="true" />
                {result.keywordsIncluded.length} unique words included
              </span>
              {result.redundantWordsRemoved.length > 0 && (
                <span className="aso-pill aso-pill--amber">
                  <AlertCircle size={12} aria-hidden="true" />
                  {result.redundantWordsRemoved.length} redundant words removed
                </span>
              )}
              {result.keywordsTruncated.length > 0 && (
                <span className="aso-pill aso-pill--coral">
                  <Layers size={12} aria-hidden="true" />
                  {result.keywordsTruncated.length} words exceeded 100ch limit
                </span>
              )}
            </div>
          </div>
        </div>

        <footer className="tracker-modal-footer">
          <button
            type="button"
            className="tracker-button-secondary"
            onClick={onClose}
          >
            Done
          </button>
          <button
            type="button"
            className="tracker-button-primary"
            onClick={onCopy}
            disabled={!result.optimized}
          >
            {copied ? (
              <Check size={15} aria-hidden="true" />
            ) : (
              <Copy size={15} aria-hidden="true" />
            )}
            {copied ? "Copied 100ch!" : "Copy for App Store Connect"}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function AsoOptimizerModal({
  open,
  initialKeywords = [],
  appTitle = "",
  appSubtitle = "",
  onClose,
}: {
  open: boolean;
  initialKeywords?: string[];
  appTitle?: string;
  appSubtitle?: string;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <AsoOptimizerModalContent
      initialKeywords={initialKeywords}
      appTitle={appTitle}
      appSubtitle={appSubtitle}
      onClose={onClose}
    />
  );
}
