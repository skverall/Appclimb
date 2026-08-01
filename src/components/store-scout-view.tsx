"use client";

import { ExternalLink, Settings2, Store } from "lucide-react";

import { KeywordTerrain } from "@/components/product-pulse-workspace";
import type { DashboardSnapshot } from "@/lib/contracts";

/**
 * A bounded App Store utility that works before PostHog setup is complete.
 * The rank surface is powered by public iTunes catalog search results; it
 * deliberately does not invent Apple Ads popularity or private App Store data.
 */
export function StoreScoutView({
  snapshot,
  onOpenSettings,
}: {
  snapshot: DashboardSnapshot;
  onOpenSettings: () => void;
}) {
  const isIos = snapshot.app.platform === "iOS";
  const storeUrl = snapshot.app.appStoreId
    ? `https://apps.apple.com/${snapshot.app.storefront.toLowerCase()}/app/id${snapshot.app.appStoreId}`
    : null;

  return (
    <div className="store-scout-view">
      <header className="store-scout-header">
        <div className="store-scout-title">
          <span className="store-scout-mark" aria-hidden="true">
            <Store size={18} />
          </span>
          <div>
            <h2>Store Scout</h2>
            <p>
              Track where your app appears in App Store search and decide which
              keywords deserve the next release.
            </p>
          </div>
        </div>
        <div className="store-scout-actions">
          {storeUrl ? (
            <a
              className="growth-ci-btn growth-ci-btn--ghost"
              href={storeUrl}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={15} /> Open App Store
            </a>
          ) : null}
          <button
            type="button"
            className="growth-ci-btn growth-ci-btn--ghost"
            onClick={onOpenSettings}
          >
            <Settings2 size={15} /> App data
          </button>
        </div>
      </header>

      {isIos && snapshot.app.appStoreId ? (
        <KeywordTerrain snapshot={snapshot} />
      ) : (
        <section className="store-scout-empty">
          <Store size={22} />
          <div>
            <h3>Add an App Store listing to use Store Scout</h3>
            <p>
              This workspace needs an iOS App Store app ID before public search
              positions can be checked.
            </p>
          </div>
          <button type="button" className="growth-ci-btn" onClick={onOpenSettings}>
            Add App Store app
          </button>
        </section>
      )}
    </div>
  );
}
