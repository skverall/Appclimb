"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Compass,
  Menu,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { AddAppModal } from "@/components/add-app-modal";
import { KeywordExplorer } from "@/components/keyword-explorer";
import { SuggestionsModal } from "@/components/suggestions-modal";
import { TrackerView } from "@/components/tracker-view";
import type { CatalogApp } from "@/lib/itunes";
import {
  addKeywordsToStore,
  addTrackedApp,
  analyzeWithRetry,
  appKey,
  applyAnalysisToStore,
  buildKeywordSuggestions,
  emptyStore,
  humanizeItunesError,
  loadAppMetadata,
  loadTrackerStore,
  listKeywordsForApp,
  markKeywordUnavailable,
  mapWithConcurrency,
  REFRESH_CONCURRENCY,
  REFRESH_GAP_MS,
  removeTrackedApp,
  saveTrackerStore,
  setActiveApp,
  type TrackedApp,
  type TrackerStore,
} from "@/lib/tracker";

type ViewMode = "explorer" | "app";

export function AppWorkspace() {
  const [hydrated, setHydrated] = useState(false);
  const [store, setStore] = useState<TrackerStore>(emptyStore);
  const [view, setView] = useState<ViewMode>("explorer");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [addAppOpen, setAddAppOpen] = useState(false);
  const [pendingSuggestions, setPendingSuggestions] = useState<{
    app: TrackedApp;
    suggestions: Array<{
      keyword: string;
      reason:
        | "App title"
        | "App description"
        | "App Store category"
        | "Related phrase"
        | "Competitor metadata"
        | "Store metadata";
      alreadyTracked: boolean;
    }>;
  } | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const loaded = loadTrackerStore(window.localStorage);
      setStore(loaded);
      if (loaded.activeAppKey && loaded.apps.length > 0) {
        setView("app");
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: TrackerStore) => {
    setStore(next);
    saveTrackerStore(window.localStorage, next);
  }, []);

  const activeApp = useMemo(() => {
    if (!store.activeAppKey) return null;
    return (
      store.apps.find(
        (app) => appKey(app.appStoreId, app.country) === store.activeAppKey,
      ) ?? null
    );
  }, [store]);

  const existingAppKeys = useMemo(
    () => new Set(store.apps.map((app) => appKey(app.appStoreId, app.country))),
    [store.apps],
  );

  const selectExplorer = () => {
    setView("explorer");
    setSidebarOpen(false);
  };

  const selectApp = (app: TrackedApp) => {
    persist(setActiveApp(store, app.appStoreId, app.country));
    setView("app");
    setSidebarOpen(false);
  };

  const handleDeleteApp = (app: TrackedApp) => {
    if (
      !window.confirm(
        `Remove “${app.name}” (${app.country})? All tracked keywords, notes, and rank history for this app on this device will be deleted. Keyword Explorer history is not affected.`,
      )
    ) {
      return;
    }
    const next = removeTrackedApp(store, app.appStoreId, app.country);
    persist(next);
    if (next.apps.length === 0) setView("explorer");
  };

  const handleSelectCatalogApp = async (catalog: CatalogApp, country: string) => {
    setAddAppOpen(false);
    setBootstrapping(true);
    setBanner(null);
    try {
      let description: string | undefined;
      let enriched = catalog;
      try {
        const meta = await loadAppMetadata(catalog.appStoreId, country);
        if (meta) {
          enriched = meta.catalog;
          description =
            typeof meta.raw.description === "string"
              ? meta.raw.description
              : undefined;
        }
      } catch {
        // Metadata enrichment is best-effort; catalog fields are enough to add.
      }

      const { store: withApp, app, added } = addTrackedApp(store, {
        appStoreId: enriched.appStoreId,
        name: enriched.name,
        bundleId: enriched.bundleId,
        developer: enriched.developer,
        genre: enriched.genre,
        iconUrl: enriched.iconUrl,
        storeUrl: enriched.storeUrl,
        country,
        description,
      });
      persist(withApp);
      setView("app");

      if (!added) {
        setBanner("This app is already tracked for that storefront.");
        return;
      }

      const raw = {
        trackName: enriched.name,
        primaryGenreName: enriched.genre,
        description,
        trackId: Number(enriched.appStoreId),
        bundleId: enriched.bundleId,
        sellerName: enriched.developer,
        artworkUrl100: enriched.iconUrl,
        trackViewUrl: enriched.storeUrl,
      };
      const suggestions = buildKeywordSuggestions(raw, enriched.name, {
        existingNormalized: new Set(),
      });
      setPendingSuggestions({ app, suggestions });
    } catch (err) {
      setBanner(humanizeItunesError(err));
    } finally {
      setBootstrapping(false);
    }
  };

  const handleConfirmSuggestions = async (keywords: string[]) => {
    if (!pendingSuggestions) return;
    const { app } = pendingSuggestions;
    setPendingSuggestions(null);
    const { store: withKeys, added } = addKeywordsToStore(
      store,
      app.appStoreId,
      app.country,
      keywords,
    );
    persist(withKeys);
    if (added.length === 0) return;

    setBootstrapping(true);
    setBanner(null);
    try {
      let working = withKeys;
      const outcomes = await mapWithConcurrency(
        added.map((row) => row.keyword),
        REFRESH_CONCURRENCY,
        async (keyword) =>
          analyzeWithRetry(keyword, app.country, app.appStoreId),
        { gapMs: REFRESH_GAP_MS },
      );
      let failures = 0;
      for (const outcome of outcomes) {
        if (outcome.result) {
          working = applyAnalysisToStore(
            working,
            app.appStoreId,
            app.country,
            outcome.item,
            outcome.result,
          );
        } else {
          failures += 1;
          working = markKeywordUnavailable(
            working,
            app.appStoreId,
            app.country,
            outcome.item,
          );
        }
      }
      persist(working);
      if (failures > 0) {
        setBanner(
          `Added keywords; ${failures} could not be checked yet. Existing rows stay available — try Refresh All shortly.`,
        );
      }
    } catch (err) {
      setBanner(humanizeItunesError(err));
    } finally {
      setBootstrapping(false);
    }
  };

  if (!hydrated) {
    return (
      <div className="app-workspace app-workspace--loading" aria-busy="true">
        <div className="tracker-skeleton-row" />
      </div>
    );
  }

  return (
    <div className="app-workspace">
      <button
        type="button"
        className="tracker-sidebar-toggle"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open navigation"
      >
        <Menu size={18} aria-hidden="true" />
        Menu
      </button>

      {sidebarOpen && (
        <button
          type="button"
          className="tracker-sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`tracker-sidebar${sidebarOpen ? " is-open" : ""}`}
        aria-label="AppClimb navigation"
      >
        <div className="tracker-sidebar-top">
          <button
            type="button"
            className="tracker-sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <nav className="tracker-sidebar-nav">
          <button
            type="button"
            className={
              view === "explorer"
                ? "tracker-nav-item is-active"
                : "tracker-nav-item"
            }
            onClick={selectExplorer}
          >
            <Compass size={16} aria-hidden="true" />
            Keyword Explorer
          </button>
        </nav>

        <div className="tracker-sidebar-section">
          <div className="tracker-sidebar-section-label">My Apps</div>
          {store.apps.length === 0 ? (
            <p className="tracker-sidebar-empty">
              Track an app to see keyword suggestions, estimated scores, and
              observed positions.
            </p>
          ) : (
            <ul className="tracker-app-list">
              {store.apps.map((app) => {
                const key = appKey(app.appStoreId, app.country);
                const active =
                  view === "app" && store.activeAppKey === key;
                const count = listKeywordsForApp(
                  store,
                  app.appStoreId,
                  app.country,
                ).length;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      className={
                        active
                          ? "tracker-app-card is-active"
                          : "tracker-app-card"
                      }
                      onClick={() => selectApp(app)}
                    >
                      {app.iconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={app.iconUrl}
                          alt=""
                          width={32}
                          height={32}
                          loading="lazy"
                        />
                      ) : (
                        <span
                          className="tracker-app-icon-fallback tracker-app-icon-fallback--sm"
                          aria-hidden="true"
                        >
                          {app.name.charAt(0)}
                        </span>
                      )}
                      <span className="tracker-app-card-meta">
                        <strong>{app.name}</strong>
                        <small>
                          {app.country} · {count} kw
                        </small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="tracker-app-delete"
                      aria-label={`Remove ${app.name}`}
                      onClick={() => handleDeleteApp(app)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="tracker-sidebar-footer">
          <button
            type="button"
            className="tracker-button-primary tracker-button-block"
            onClick={() => setAddAppOpen(true)}
          >
            <Plus size={16} aria-hidden="true" />
            Add App
          </button>
          <p className="tracker-sidebar-footnote">
            Free · local only · no account
          </p>
        </div>
      </aside>

      <div className="tracker-workspace-main">
        {banner && (
          <div className="keyword-error tracker-banner" role="status">
            {banner}
            <button type="button" onClick={() => setBanner(null)} aria-label="Dismiss">
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}

        {bootstrapping && (
          <div className="tracker-bootstrap" role="status" aria-live="polite">
            Loading app metadata…
          </div>
        )}

        {view === "explorer" || !activeApp ? (
          <KeywordExplorer />
        ) : (
          <TrackerView
            app={activeApp}
            store={store}
            onStoreChange={persist}
          />
        )}
      </div>

      <AddAppModal
        open={addAppOpen}
        existingKeys={existingAppKeys}
        onClose={() => setAddAppOpen(false)}
        onSelect={(app, country) => {
          void handleSelectCatalogApp(app, country);
        }}
      />

      <SuggestionsModal
        open={Boolean(pendingSuggestions)}
        appName={pendingSuggestions?.app.name ?? ""}
        suggestions={pendingSuggestions?.suggestions ?? []}
        onClose={() => setPendingSuggestions(null)}
        onConfirm={(keywords) => {
          void handleConfirmSuggestions(keywords);
        }}
      />
    </div>
  );
}
