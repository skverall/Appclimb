import { MessageCircleMore } from "lucide-react";

import type { CustomerCluster } from "@/lib/contracts";

/**
 * Bubbles are HTML (not SVG) so the field scales to any card width without
 * aspect-ratio letterboxing or distorted circles.
 */
export function VoiceClusters({
  clusters,
}: {
  clusters: CustomerCluster[];
}) {
  const totalMentions = clusters.reduce(
    (sum, cluster) => sum + cluster.mentions,
    0,
  );
  return (
    <section className="support-card" aria-labelledby="voice-heading">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">Voice of customer</span>
          <h2 id="voice-heading">What users talk about</h2>
        </div>
        {clusters.length > 0 && (
          <span className="text-button static-label">
            {totalMentions} mentions
          </span>
        )}
      </div>
      <p className="support-subtitle">
        Review themes, sized by mentions and colored by sentiment
      </p>
      {clusters.length === 0 ? (
        <div className="support-empty" role="status">
          Review themes appear here once App Store reviews are ingested.
        </div>
      ) : (
        <div className="cluster-field">
          {clusters.map((cluster) => (
            <div
              key={cluster.id}
              className={`cluster-bubble ${cluster.sentiment}`}
              style={{
                left: `${cluster.x}%`,
                top: `${cluster.y}%`,
                width: cluster.radius * 2,
                height: cluster.radius * 2,
              }}
              role="img"
              aria-label={`${cluster.label}: ${cluster.mentions} mentions, ${cluster.sentiment} sentiment`}
            >
              <strong>{cluster.label}</strong>
              <span>{cluster.mentions} mentions</span>
            </div>
          ))}
          <div className="cluster-legend" aria-label="Sentiment legend">
            <span>
              <i className="cluster-key positive" /> Positive
            </span>
            <span>
              <i className="cluster-key mixed" /> Mixed
            </span>
            <span>
              <i className="cluster-key negative" /> Negative
            </span>
          </div>
          <div className="cluster-source">
            <MessageCircleMore size={14} />
            App Store reviews · last 90 days
          </div>
        </div>
      )}
    </section>
  );
}
