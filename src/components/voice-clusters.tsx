import { MessageCircleMore } from "lucide-react";

import type { CustomerCluster } from "@/lib/contracts";

export function VoiceClusters({
  clusters,
}: {
  clusters: CustomerCluster[];
}) {
  return (
    <section className="support-card" aria-labelledby="voice-heading">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">Voice of customer</span>
          <h2 id="voice-heading">What users talk about</h2>
        </div>
        <span className="text-button static-label">386 reviews</span>
      </div>
      <p className="support-subtitle">
        Review themes, sized by mentions and colored by sentiment
      </p>
      <div className="cluster-field">
        <svg
          viewBox="0 0 600 250"
          role="img"
          aria-label="Customer feedback clusters"
        >
          <defs>
            <filter id="clusterShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow
                dx="0"
                dy="5"
                stdDeviation="7"
                floodColor="#2b3e49"
                floodOpacity=".08"
              />
            </filter>
          </defs>
          {clusters.map((cluster) => {
            const x = (cluster.x / 100) * 600;
            const y = (cluster.y / 100) * 250;
            return (
              <g key={cluster.id} filter="url(#clusterShadow)">
                <circle
                  cx={x}
                  cy={y}
                  r={cluster.radius}
                  className={`cluster-circle ${cluster.sentiment}`}
                />
                <text
                  x={x}
                  y={y - 4}
                  textAnchor="middle"
                  className="cluster-label"
                >
                  {cluster.label}
                </text>
                <text
                  x={x}
                  y={y + 16}
                  textAnchor="middle"
                  className="cluster-count"
                >
                  {cluster.mentions} mentions
                </text>
              </g>
            );
          })}
        </svg>
        <div className="cluster-source">
          <MessageCircleMore size={14} />
          App Store reviews · last 90 days
        </div>
      </div>
    </section>
  );
}
