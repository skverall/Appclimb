"use client";

import { Globe } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  looksLikeWebDomain,
  normalizeWebDomain,
  webFaviconCandidates,
} from "@/lib/web-favicon";

type WebSiteIconProps = {
  domain?: string | null;
  name?: string;
  /** Stored icon URL, if any — tried first. */
  iconUrl?: string | null;
  size?: number;
  className?: string;
  /** Use letter mark instead of globe when every favicon source fails. */
  fallback?: "letter" | "globe";
  rounded?: number | string;
};

/**
 * Renders a website favicon with a multi-source fallback chain so Web SaaS
 * tabs and the workspace switcher show a real site icon instead of a globe.
 */
export function WebSiteIcon({
  domain,
  name = "",
  iconUrl,
  size = 24,
  className = "",
  fallback = "letter",
  rounded = 6,
}: WebSiteIconProps) {
  const resolvedDomain = useMemo(() => {
    if (domain && looksLikeWebDomain(domain)) return normalizeWebDomain(domain);
    if (name && looksLikeWebDomain(name)) return normalizeWebDomain(name);
    return normalizeWebDomain(domain || "");
  }, [domain, name]);

  const candidates = useMemo(
    () => webFaviconCandidates(resolvedDomain, iconUrl),
    [resolvedDomain, iconUrl],
  );

  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [resolvedDomain, iconUrl]);

  const letter =
    (name || resolvedDomain || "?").trim().charAt(0).toUpperCase() || "?";

  if (index >= candidates.length) {
    if (fallback === "globe") {
      return (
        <span
          className={className}
          style={{
            width: size,
            height: size,
            borderRadius: rounded,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
            background: "linear-gradient(145deg, var(--teal-100), var(--teal-25))",
            color: "var(--teal-dark)",
          }}
          aria-hidden="true"
        >
          <Globe size={Math.max(12, Math.round(size * 0.55))} />
        </span>
      );
    }
    return (
      <span
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: rounded,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          background: "linear-gradient(135deg, #0f766e, #14b8a6)",
          color: "#ffffff",
          fontWeight: 700,
          fontSize: Math.max(10, Math.round(size * 0.42)),
        }}
        aria-hidden="true"
      >
        {letter}
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: rounded,
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
        background: "var(--surface-subtle, #f4f7f6)",
      }}
      aria-hidden="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={candidates[index]}
        alt=""
        width={size}
        height={size}
        onError={() => setIndex((current) => current + 1)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }}
      />
    </span>
  );
}
