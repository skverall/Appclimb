"use client";

import {
  ArrowRight,
  ChevronRight,
  CircleDot,
  FlaskConical,
  Layers3,
  TrendingDown,
} from "lucide-react";

import type {
  ActionProposal,
  Evidence,
  Insight,
} from "@/lib/contracts";

export function InsightPanel({
  insights,
  evidence,
  actionProposals,
  selectedInsightId,
  onSelectInsight,
  onOpenInsight,
}: {
  insights: Insight[];
  evidence: Evidence[];
  actionProposals: ActionProposal[];
  selectedInsightId: string;
  onSelectInsight: (id: string) => void;
  onOpenInsight: (id: string) => void;
}) {
  const selected =
    insights.find((insight) => insight.id === selectedInsightId) ?? insights[0];
  const selectedEvidenceItems = evidence.filter((item) =>
    selected?.evidenceIds.includes(item.id),
  );
  const selectedEvidence = selectedEvidenceItems[0];
  const proposal = actionProposals.find(
    (item) => item.insightId === selected?.id,
  );

  return (
    <aside className="insight-panel" aria-labelledby="opportunities-heading">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Diagnose</span>
          <h2 id="opportunities-heading">What to fix next</h2>
        </div>
        <span className="opportunity-count">{insights.length}</span>
      </div>

      <div className="opportunity-list">
        {insights.map((insight) => (
          <button
            className={
              insight.id === selected?.id
                ? "opportunity-card selected"
                : "opportunity-card"
            }
            key={insight.id}
            type="button"
            onClick={() => onSelectInsight(insight.id)}
          >
            <span className={`opportunity-rank rank-${insight.rank}`}>
              {insight.rank}
            </span>
            <span className="opportunity-copy">
              <span className="opportunity-meta">
                <i className={`kind-${insight.kind.toLowerCase()}`}>
                  {insight.kind}
                </i>
                <i>{insight.confidence} confidence</i>
              </span>
              <strong>{insight.title}</strong>
              <small>{insight.summary}</small>
            </span>
            <ChevronRight size={18} />
          </button>
        ))}
      </div>

      {!selected && (
        <div className="insight-empty">
          <Layers3 size={21} />
          <strong>No ranked opportunity yet</strong>
          <p>
            AppClimb will keep this panel empty until a source-backed
            bottleneck has enough evidence.
          </p>
        </div>
      )}

      {selected && selectedEvidence && proposal && (
        <div className="selected-opportunity-detail">
          <div className="detail-title-row">
            <span className="detail-icon">
              {selected.stageId === "activate" ? (
                <TrendingDown size={18} />
              ) : (
                <CircleDot size={18} />
              )}
            </span>
            <div>
              <span className="eyebrow">Evidence</span>
              <strong>{selectedEvidence.title}</strong>
            </div>
          </div>

          <div className="before-after">
            <div>
              <span>{selectedEvidence.before.label}</span>
              <strong>{selectedEvidence.before.value}</strong>
            </div>
            <ArrowRight size={17} />
            <div className="after">
              <span>{selectedEvidence.after.label}</span>
              <strong>{selectedEvidence.after.value}</strong>
            </div>
          </div>

          <div className="proposal-preview">
            <span className="proposal-icon">
              <FlaskConical aria-hidden="true" size={18} strokeWidth={2.1} />
            </span>
            <div>
              <span>Recommended experiment</span>
              <strong>{proposal.title}</strong>
            </div>
          </div>

          <button
            className="primary-action"
            type="button"
            onClick={() => onOpenInsight(selected.id)}
          >
            Open evidence
            <ArrowRight size={17} />
          </button>
          <p className="readonly-note">
            <Layers3 size={14} />
            {selectedEvidenceItems.length} evidence{" "}
            {selectedEvidenceItems.length === 1 ? "record" : "records"} ·
            Proposal only · no external changes
          </p>
        </div>
      )}
    </aside>
  );
}
