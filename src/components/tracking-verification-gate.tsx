"use client";

import {
  Check,
  Clipboard,
  Code2,
  LoaderCircle,
  Radio,
  Sparkles,
  Wifi,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { WebProperty } from "@/lib/acquisition";
import { WebSiteIcon } from "@/components/web-site-icon";
import { buildTrackingAgentPrompt } from "@/components/web-tracking/tracking-agent-prompt";

type GateStatus = "listening" | "checking" | "not_found" | "verified";

export function TrackingVerificationGate({
  property,
  snippet,
  collectorOrigin,
  checking,
  lastCheckFailed,
  verified,
  onCheck,
  onVerifiedContinue,
}: {
  property: WebProperty;
  snippet: string;
  collectorOrigin: string;
  checking: boolean;
  lastCheckFailed: boolean;
  verified: boolean;
  onCheck: () => void;
  onVerifiedContinue: () => void;
}) {
  const [tab, setTab] = useState<"agent" | "html">("agent");
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedHtml, setCopiedHtml] = useState(false);

  const status: GateStatus = verified
    ? "verified"
    : checking
      ? "checking"
      : lastCheckFailed
        ? "not_found"
        : "listening";

  // Canonical generator (Task P0.23). This component must not fork the prompt.
  const aiAgentPrompt = useMemo(
    () =>
      buildTrackingAgentPrompt({
        domain: property.domain,
        name: property.name,
        trackingToken: property.trackingToken ?? "",
        collectorOrigin,
      }),
    [property.domain, property.name, property.trackingToken, collectorOrigin],
  );

  return (
    <article className="tracking-verify-gate" aria-live="polite">
      {/* The burst animation ends itself (opacity 0, fill-mode forwards). */}
      {verified && <ConfettiBurst />}

      <div className="tracking-verify-hero">
        <div
          className={`tracking-verify-radar tracking-verify-${status}`}
          aria-hidden="true"
        >
          <span className="tracking-verify-ring ring-a" />
          <span className="tracking-verify-ring ring-b" />
          <span className="tracking-verify-ring ring-c" />
          <span className="tracking-verify-core">
            {status === "verified" ? (
              <Check size={28} strokeWidth={2.4} />
            ) : status === "checking" ? (
              <LoaderCircle className="spin" size={28} />
            ) : (
              <Radio size={26} />
            )}
          </span>
        </div>

        <div className="tracking-verify-copy">
          <span className="eyebrow">
            {status === "verified" ? "Tracking installed" : "Install required"}
          </span>
          <h3>
            {status === "verified"
              ? `${property.domain} is sending data`
              : `Waiting for the script on ${property.domain}`}
          </h3>
          <p>
            {status === "verified"
              ? "First-party visitors and crawlers can now appear in Acquisition Atlas. Charts stay empty until real traffic arrives — that is expected."
              : status === "checking"
                ? "Looking for the first browser page view or crawler hit from this domain…"
                : status === "not_found"
                  ? "No events yet. Deploy the install on the live site, open a page once, then verify again. AppClimb does not invent traffic."
                  : "The website is saved, but analytics are not live until the tracking script is installed and AppClimb receives the first real event — same idea as domain verification at registrars."}
          </p>

          <div className="tracking-verify-property">
            <WebSiteIcon
              domain={property.domain}
              name={property.name}
              size={28}
              rounded={8}
            />
            <div>
              <strong>{property.name}</strong>
              <small>{property.domain}</small>
            </div>
            <span className={`tracking-verify-pill tracking-pill-${status}`}>
              {status === "verified"
                ? "Verified"
                : status === "checking"
                  ? "Checking…"
                  : status === "not_found"
                    ? "Not detected"
                    : "Listening"}
            </span>
          </div>
        </div>
      </div>

      {status !== "verified" && (
        <div className="tracking-verify-install">
          <div className="tracking-verify-install-head">
            <div>
              <strong>1. Install tracking</strong>
              <span>
                Hand this to your coding agent, or paste the HTML snippet
                yourself.
              </span>
            </div>
            <div
              className="atlas-setup-tabs"
              role="tablist"
              aria-label="Installation method"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === "agent"}
                className={tab === "agent" ? "active" : ""}
                onClick={() => setTab("agent")}
              >
                <Sparkles size={14} /> AI Agent Prompt
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "html"}
                className={tab === "html" ? "active" : ""}
                onClick={() => setTab("html")}
              >
                <Code2 size={14} /> HTML Snippet
              </button>
            </div>
          </div>

          {tab === "agent" ? (
            <div className="atlas-code-block atlas-agent-prompt-block">
              <code>{aiAgentPrompt}</code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(aiAgentPrompt).then(() => {
                    setCopiedPrompt(true);
                    window.setTimeout(() => setCopiedPrompt(false), 1600);
                  });
                }}
              >
                {copiedPrompt ? <Check size={15} /> : <Clipboard size={15} />}
                {copiedPrompt ? "Prompt copied" : "Copy AI agent prompt"}
              </button>
            </div>
          ) : (
            <div className="atlas-code-block">
              <code>{snippet}</code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(snippet).then(() => {
                    setCopiedHtml(true);
                    window.setTimeout(() => setCopiedHtml(false), 1600);
                  });
                }}
              >
                {copiedHtml ? <Check size={15} /> : <Clipboard size={15} />}
                {copiedHtml ? "Copied" : "Copy install snippet"}
              </button>
            </div>
          )}

          <ol className="tracking-verify-steps">
            <li>Deploy the script (or agent change) to the live domain.</li>
            <li>
              Open <code>https://{property.domain}</code> once in a normal
              browser.
            </li>
            <li>Come back and verify — we only mark connected after a real event.</li>
          </ol>
        </div>
      )}

      <div className="tracking-verify-actions">
        {status === "verified" ? (
          <button
            type="button"
            className="primary-action tracking-verify-primary"
            onClick={onVerifiedContinue}
          >
            <Wifi size={16} />
            Open live Acquisition Atlas
          </button>
        ) : (
          <button
            type="button"
            className="primary-action tracking-verify-primary"
            onClick={onCheck}
            disabled={checking}
          >
            {checking ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Radio size={16} />
            )}
            {checking ? "Checking connection…" : "Verify connection"}
          </button>
        )}
        {status === "not_found" && (
          <p className="tracking-verify-hint" role="status">
            Tip: hard-refresh the live site after deploy, and make sure the
            script runs on the same hostname ({property.domain}).
          </p>
        )}
      </div>
    </article>
  );
}

function ConfettiBurst() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 28 }, (_, index) => ({
        id: index,
        left: `${4 + ((index * 17) % 92)}%`,
        delay: `${(index % 10) * 0.04}s`,
        hue: (index * 37) % 360,
        rotate: `${(index * 41) % 360}deg`,
      })),
    [],
  );

  return (
    <div className="tracking-confetti" aria-hidden="true">
      {pieces.map((piece) => (
        <i
          key={piece.id}
          style={{
            left: piece.left,
            animationDelay: piece.delay,
            background: `hsl(${piece.hue} 72% 58%)`,
            transform: `rotate(${piece.rotate})`,
          }}
        />
      ))}
    </div>
  );
}
