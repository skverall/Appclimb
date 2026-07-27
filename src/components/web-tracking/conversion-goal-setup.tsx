"use client";

/**
 * Step 5 of the website wizard (Task P0.25).
 *
 * Without a conversion goal AppClimb can still analyse acquisition, and it says
 * so plainly instead of pretending the funnel is complete.
 */

import { Check, Clipboard, LoaderCircle, Target } from "lucide-react";
import { useState } from "react";

import { buildConversionSnippet } from "./tracking-snippet";
import {
  CONVERSION_GOAL_PRESETS,
  type ConversionGoalKind,
} from "./web-install-state";

export function ConversionGoalSetup({
  currentGoal,
  saving,
  error,
  onSave,
  onSkip,
}: {
  currentGoal?: string | null;
  saving?: boolean;
  error?: string;
  onSave: (goal: string) => void | Promise<void>;
  onSkip?: () => void;
}) {
  const savedGoal = (currentGoal ?? "").trim();
  const matchedPreset = CONVERSION_GOAL_PRESETS.find(
    (preset) => preset.goal === savedGoal,
  );
  const [kind, setKind] = useState<ConversionGoalKind>(
    savedGoal ? (matchedPreset?.kind ?? "custom") : "signup",
  );
  const [customGoal, setCustomGoal] = useState(
    matchedPreset ? "" : savedGoal,
  );
  const [copied, setCopied] = useState(false);

  const preset = CONVERSION_GOAL_PRESETS.find((item) => item.kind === kind);
  const goal =
    kind === "custom" ? normalizeGoal(customGoal) : (preset?.goal ?? "");
  const snippet = goal ? buildConversionSnippet(goal) : "";

  return (
    <div className="wt-goal">
      <div className="wt-goal-head">
        <Target size={18} aria-hidden="true" />
        <div>
          <strong>Which conversion should AppClimb diagnose?</strong>
          <p>
            Pick the one event that means a visitor became a customer on this
            site. AppClimb needs it to separate an acquisition problem from a
            conversion problem.
          </p>
        </div>
      </div>

      <div
        className="wt-goal-options"
        role="radiogroup"
        aria-label="Primary conversion goal"
      >
        {CONVERSION_GOAL_PRESETS.map((item) => (
          <button
            key={item.kind}
            type="button"
            role="radio"
            aria-checked={kind === item.kind}
            className={`wt-goal-option${kind === item.kind ? " active" : ""}`}
            onClick={() => setKind(item.kind)}
          >
            <strong>{item.label}</strong>
            <span>{item.description}</span>
            <code>{item.goal}</code>
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={kind === "custom"}
          className={`wt-goal-option${kind === "custom" ? " active" : ""}`}
          onClick={() => setKind("custom")}
        >
          <strong>Custom goal</strong>
          <span>Name the event yourself.</span>
          <code>your_goal_name</code>
        </button>
      </div>

      {kind === "custom" && (
        <label className="wt-field">
          Custom goal name
          <input
            value={customGoal}
            onChange={(event) => setCustomGoal(event.target.value)}
            placeholder="paid_plan_started"
            spellCheck={false}
            autoCapitalize="none"
            maxLength={120}
          />
          <small>
            Lowercase letters, numbers and underscores. This must match the goal
            your site sends.
          </small>
        </label>
      )}

      {snippet && (
        <div className="wt-code-block">
          <pre>
            <code>{snippet}</code>
          </pre>
          <button
            type="button"
            className="wt-copy"
            onClick={() => {
              void navigator.clipboard.writeText(snippet).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1600);
              });
            }}
          >
            {copied ? <Check size={15} /> : <Clipboard size={15} />}
            {copied ? "Copied" : "Copy conversion call"}
          </button>
        </div>
      )}

      {error && (
        <p className="wt-error" role="alert">
          {error}
        </p>
      )}

      <div className="wt-actions">
        <button
          type="button"
          className="wt-primary"
          disabled={!goal || Boolean(saving)}
          onClick={() => void onSave(goal)}
        >
          {saving ? <LoaderCircle className="spin" size={16} /> : null}
          {saving ? "Saving goal…" : "Save conversion goal"}
        </button>
        {onSkip && (
          <button type="button" className="wt-secondary" onClick={onSkip}>
            Skip for now
          </button>
        )}
      </div>

      {!savedGoal && (
        <p className="wt-blocked-note" role="status">
          Without a conversion goal, AppClimb can still analyse acquisition —
          traffic sources, referrers, campaigns and landing pages. Conversion
          diagnosis stays blocked until a goal is configured.
        </p>
      )}
    </div>
  );
}

function normalizeGoal(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 120);
}
