"use client";

import { ArrowRight, FileText, Info, Sparkles } from "lucide-react";

import type { DashboardSnapshot } from "@/lib/contracts";

import { evidenceForInsight, planForInsight, selectPrimaryInsight } from "./primary-selection";
import { providerLabel } from "./readiness-copy";

interface PrimaryDiagnosisCardProps {
  snapshot: DashboardSnapshot;
  onOpenActionPlan?: () => void;
  onOpenEvidence?: () => void;
}

const COMPARISON_LABEL: Record<string, string> = {
  same_source_funnel: "Same-source funnel",
  cohort: "Cohort comparison",
  time_baseline: "Own time baseline",
  aggregate_directional: "Aggregate, directional only",
  not_comparable: "Not directly comparable",
};

export function PrimaryDiagnosisCard({
  snapshot,
  onOpenActionPlan,
  onOpenEvidence,
}: PrimaryDiagnosisCardProps) {
  const insight = selectPrimaryInsight(snapshot);
  if (!insight) return null;

  const evidence = evidenceForInsight(snapshot, insight);
  const primaryEvidence = evidence[0];
  const plan = planForInsight(snapshot, insight);
  const stage = snapshot.stages.find((item) => item.id === insight.stageId);
  const limitations = snapshot.diagnosis?.limitations ?? [];

  const observed = primaryEvidence?.after.value ?? stage?.formattedValue;
  const baseline = primaryEvidence?.before.value;
  const evidenceWindow = primaryEvidence
    ? `${formatDay(primaryEvidence.window.from)} – ${formatDay(primaryEvidence.window.to)}`
    : undefined;
  const source = primaryEvidence?.source ?? stage?.source;
  const sampleSize = stage?.sampleSize;
  const comparison = stage?.comparisonType
    ? COMPARISON_LABEL[stage.comparisonType]
    : undefined;

  return (
    <article className="diagnosis-card" aria-label="Primary confirmed bottleneck">
      <div className="diagnosis-card-head">
        <span className="diagnosis-tag">
          <Sparkles size={13} />
          Confirmed constraint
          {stage?.label ? ` · ${stage.label}` : ""}
        </span>
        <span className="diagnosis-impact">
          Expected impact: {insight.impact}
        </span>
      </div>

      <h3 className="diagnosis-title">{insight.title}</h3>
      <p className="diagnosis-summary">{insight.summary}</p>

      <dl className="diagnosis-facts">
        {observed && (
          <div className="diagnosis-fact is-observed">
            <dt>Observed</dt>
            <dd>{observed}</dd>
          </div>
        )}
        {baseline && (
          <div className="diagnosis-fact">
            <dt>{primaryEvidence?.before.label || "Baseline"}</dt>
            <dd>{baseline}</dd>
          </div>
        )}
        <div className="diagnosis-fact">
          <dt>Confidence</dt>
          <dd>{insight.confidence}</dd>
        </div>
        <div className="diagnosis-fact">
          <dt>Sample size</dt>
          <dd>
            {typeof sampleSize === "number" ? (
              sampleSize.toLocaleString("en-US")
            ) : (
              <span className="fact-unreported">Not reported</span>
            )}
          </dd>
        </div>
        <div className="diagnosis-fact">
          <dt>Evidence window</dt>
          <dd>
            {evidenceWindow ?? (
              <span className="fact-unreported">Not reported</span>
            )}
          </dd>
        </div>
        <div className="diagnosis-fact">
          <dt>Source</dt>
          <dd>
            {source ? (
              providerLabel(source)
            ) : (
              <span className="fact-unreported">Not reported</span>
            )}
          </dd>
        </div>
      </dl>

      {comparison && (
        <p className="diagnosis-comparison">
          <Info size={14} />
          Comparison basis: {comparison}
        </p>
      )}

      {limitations.length > 0 && (
        <ul className="diagnosis-limitations">
          {limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      )}

      <div className="diagnosis-actions">
        <button type="button" className="readiness-cta" onClick={onOpenActionPlan}>
          <span>{plan ? "Open action plan" : "Open diagnosis"}</span>
          <ArrowRight size={16} />
        </button>
        {evidence.length > 0 && (
          <button
            type="button"
            className="diagnosis-secondary"
            onClick={onOpenEvidence}
          >
            <FileText size={15} />
            See evidence
          </button>
        )}
      </div>
    </article>
  );
}

function formatDay(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}
