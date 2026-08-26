"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Cloud,
  CloudOff,
  Compass,
  Loader2,
  Lock,
  LogIn,
  Menu,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { AddAppModal } from "@/components/add-app-modal";
import { KeywordExplorer } from "@/components/keyword-explorer";
import { OnboardingModal } from "@/components/onboarding-modal";
import { SuggestionsModal } from "@/components/suggestions-modal";
import { TrackerView } from "@/components/tracker-view";
import { useAccount } from "@/components/account-provider";
import { canTrackApps } from "@/lib/access";
import { proEnabled } from "@/lib/flags";
import type { CatalogApp } from "@/lib/itunes";
import { notifySyncChange } from "@/lib/sync-client";
import { enrichAnalysisResult } from "@/lib/popularity";
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
  STARTER_APP_ID,
  STARTER_APP_NAME,
  STARTER_KEYWORDS,
  trackAppInStorefront,
  type TrackedApp,
  type TrackerStore,
} from "@/lib/tracker";

type ViewMode = "explorer" | "app";

const ONBOARDED_KEY = "appclimb:onboarded:v1";

export function AppWorkspace() {
  const [hydrated, setHydrated] = useState(false);
  const [store, setStore] = useState<TrackerStore>(emptyStore);
  const [view, setView] = useState<ViewMode>("explorer");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [addAppOpen, setAddAppOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
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
  const [bootstrapLabel, setBootstrapLabel] = useState("Loading…");
  const [analyzeProgress, setAnalyzeProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const storeRef = useRef(store);

  const {
    account,
    signedIn,
    accountsLive,
    role,
    loading: accountLoading,
    isPro,
    openAuth,
    requireAccount,
    openUpgrade,
    signOut,
    syncState,
    syncVersion,
  } = useAccount();
  const proOn = proEnabled();
  const limitsOn = proOn || accountsLive;
  const appLimit = limitsOn ? account.limits.trackedApps : null;
  const keywordLimit = limitsOn ? account.limits.keywordsPerApp : null;
  const accessReady = !accountLoading;
  const trackingAllowed = accessReady && canTrackApps(role, accountsLive);
  const isGuest = accessReady && accountsLive && !signedIn;

  const atAppLimit = () =>
    appLimit !== null && storeRef.current.apps.length >= appLimit;

  useEffect(() => {
    storeRef.current = store;
  }, [store]);

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

  // A cloud-sync pull rewrote the local store — reload it into the workspace.
  useEffect(() => {
    if (syncVersion === 0) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const loaded = loadTrackerStore(window.localStorage);
      setStore(loaded);
      if (loaded.activeAppKey && loaded.apps.length > 0) {
        setView("app");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [syncVersion]);

  // First sign-in: show the welcome wizard once per account.
  const userId = account.user?.id ?? null;
  useEffect(() => {
    if (!userId) return;
    if (window.localStorage.getItem(ONBOARDED_KEY) === userId) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setOnboardingOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const dismissOnboarding = useCallback(() => {
    if (userId) {
      try {
        window.localStorage.setItem(ONBOARDED_KEY, userId);
      } catch {
        // Non-fatal: the wizard may simply re-appear next visit.
      }
    }
    setOnboardingOpen(false);
  }, [userId]);

  const persist = useCallback((next: TrackerStore) => {
    storeRef.current = next;
    setStore(next);
    saveTrackerStore(window.localStorage, next);
    notifySyncChange("tracker");
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
    persist(setActiveApp(storeRef.current, app.appStoreId, app.country));
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
    const next = removeTrackedApp(
      storeRef.current,
      app.appStoreId,
      app.country,
    );
    persist(next);
    if (next.apps.length === 0) setView("explorer");
  };

  const handleTrackInStorefront = (country: string) => {
    if (!activeApp) return;
    if (!requireAccount("track")) return;
    // A storefront variant of a tracked app is a new tracked entry: it counts
    // against the plan's tracked-app limit just like any other add path.
    if (atAppLimit()) {
      openUpgrade();
      return;
    }
    const {
      store: next,
      added,
      app,
    } = trackAppInStorefront(storeRef.current, activeApp, country);
    persist(next);
    setView("app");
    if (!added) {
      setBanner(`Already tracking this app in ${country}.`);
      return;
    }
    setBanner(
      `Now tracking ${app.name} in ${country}. Keyword history is separate per storefront.`,
    );
    // Offer suggestions for the new storefront entry.
    const raw = {
      trackName: app.name,
      primaryGenreName: app.genre,
      description: app.description,
      trackId: Number(app.appStoreId),
      bundleId: app.bundleId,
      sellerName: app.developer,
      artworkUrl100: app.iconUrl,
      trackViewUrl: app.storeUrl,
    };
    const suggestions = buildKeywordSuggestions(raw, app.name, {
      existingNormalized: new Set(),
    });
    setPendingSuggestions({ app, suggestions });
  };

  /** Map a catalog hit to a tracked app entry and persist it. */
  const trackCatalogApp = (
    catalog: CatalogApp,
    country: string,
    description?: string,
  ) => {
    return addTrackedApp(storeRef.current, {
      appStoreId: catalog.appStoreId,
      name: catalog.name,
      bundleId: catalog.bundleId,
      developer: catalog.developer,
      genre: catalog.genre,
      iconUrl: catalog.iconUrl,
      storeUrl: catalog.storeUrl,
      country,
      description,
    });
  };

  const requestAddApp = () => {
    if (!requireAccount("track")) return;
    setAddAppOpen(true);
  };

  const handleSelectCatalogApp = async (
    catalog: CatalogApp,
    country: string,
  ) => {
    if (!requireAccount("track")) {
      setAddAppOpen(false);
      return;
    }
    if (atAppLimit()) {
      setAddAppOpen(false);
      openUpgrade();
      return;
    }
    setAddAppOpen(false);
    setBootstrapping(true);
    setBootstrapLabel("Loading app metadata from the App Store…");
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

      const {
        store: withApp,
        app,
        added,
      } = trackCatalogApp(enriched, country, description);
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
      setBootstrapLabel("Loading…");
    }
  };

  /**
   * One-click sample: add the Fish Identifier starter app and analyze its
   * curated keyword set, so a fresh visitor sees the whole flow working.
   */
  const handleQuickStart = async (country: string) => {
    if (!requireAccount("track")) {
      setAddAppOpen(false);
      return;
    }
    if (atAppLimit()) {
      setAddAppOpen(false);
      openUpgrade();
      return;
    }
    setAddAppOpen(false);
    setBootstrapping(true);
    setBootstrapLabel(`Loading ${STARTER_APP_NAME} from the App Store…`);
    setBanner(null);
    try {
      const meta = await loadAppMetadata(STARTER_APP_ID, country);
      if (!meta) {
        setBanner(
          `Could not load the ${STARTER_APP_NAME} sample from the App Store catalog.`,
        );
        return;
      }
      const description =
        typeof meta.raw.description === "string"
          ? meta.raw.description
          : undefined;
      const {
        store: withApp,
        app,
        added,
      } = trackCatalogApp(meta.catalog, country, description);
      persist(withApp);
      setView("app");

      if (!added) {
        setBanner(
          `${STARTER_APP_NAME} is already tracked for that storefront.`,
        );
        return;
      }
      await runKeywordAnalysis(app, [...STARTER_KEYWORDS]);
    } catch (err) {
      setBanner(humanizeItunesError(err));
    } finally {
      setBootstrapping(false);
      setBootstrapLabel("Loading…");
    }
  };

  /**
   * Add the given keywords to the app and immediately analyze each one so the
   * table fills in without a manual "Refresh All". Shared by the suggestions
   * flow and the Fish Identifier quick start.
   */
  const runKeywordAnalysis = async (app: TrackedApp, keywords: string[]) => {
    setBanner(null);

    // Always read the latest store so we don't drop the newly added app.
    const {
      store: withKeys,
      added,
      capped,
    } = addKeywordsToStore(
      storeRef.current,
      app.appStoreId,
      app.country,
      keywords,
      keywordLimit,
    );
    persist(withKeys);
    if (capped) {
      setBanner(
        `Free plan tracks up to ${keywordLimit} keywords per app. Upgrade to Pro for unlimited keywords.`,
      );
    }
    if (added.length === 0) return;

    setBootstrapping(true);
    setBootstrapLabel(
      `Checking ${added.length} keyword${added.length === 1 ? "" : "s"} against the App Store…`,
    );
    setAnalyzeProgress({ done: 0, total: added.length });
    try {
      let working = withKeys;
      let done = 0;
      let failures = 0;
      const outcomes = await mapWithConcurrency(
        added.map((row) => row.keyword),
        REFRESH_CONCURRENCY,
        async (keyword) =>
          enrichAnalysisResult(
            await analyzeWithRetry(keyword, app.country, app.appStoreId),
          ),
        { gapMs: REFRESH_GAP_MS },
      );
      // Merge onto latest store (notes / other tabs may have changed).
      working = storeRef.current;
      for (const outcome of outcomes) {
        done += 1;
        setAnalyzeProgress({ done, total: added.length });
        setBootstrapLabel(`Checking keywords… ${done}/${added.length}`);
        if (outcome.result) {
          working = applyAnalysisToStore(
            working,
            app.appStoreId,
            app.country,
            outcome.item,
            outcome.result,
          );
          // Persist incrementally so the table lights up as rows finish.
          persist(working);
        } else {
          failures += 1;
          working = markKeywordUnavailable(
            working,
            app.appStoreId,
            app.country,
            outcome.item,
          );
          persist(working);
        }
      }
      if (failures > 0) {
        setBanner(
          failures === added.length
            ? humanizeItunesError(
                outcomes.find((item) => item.error)?.error ??
                  new Error("app_store_catalog_unavailable:429"),
              )
            : `Checked ${added.length - failures} of ${added.length} keywords. Some requests failed — existing data is kept; try Refresh All shortly.`,
        );
      }
    } catch (err) {
      setBanner(humanizeItunesError(err));
    } finally {
      setBootstrapping(false);
      setAnalyzeProgress(null);
      setBootstrapLabel("Loading…");
    }
  };

  const handleConfirmSuggestions = async (keywords: string[]) => {
    if (!pendingSuggestions) return;
    const { app } = pendingSuggestions;
    setPendingSuggestions(null);
    await runKeywordAnalysis(app, keywords);
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
      <div className="tracker-workspace-main">
        {/* Sleek, Centralized Workspace Sub-Header */}
        <div className="tracker-workspace-topbar marketing-container">
          <div className="tracker-mode-switcher" aria-label="Workspace views">
            <button
              type="button"
              className={`tracker-mode-tab ${view === "explorer" ? "is-active" : ""}`}
              onClick={selectExplorer}
            >
              <Compass size={15} aria-hidden="true" />
              Keyword Explorer
            </button>
            <button
              type="button"
              className={`tracker-mode-tab ${view === "app" ? "is-active" : ""}`}
              onClick={() => {
                if (store.apps.length > 0) {
                  selectApp(activeApp || store.apps[0]);
                  return;
                }
                if (!trackingAllowed) {
                  setView("app");
                  setSidebarOpen(false);
                  return;
                }
                requestAddApp();
              }}
            >
              <span>Tracked Apps</span>
              {store.apps.length > 0 && (
                <span className="tracker-count-badge">{store.apps.length}</span>
              )}
            </button>
          </div>

          <div className="tracker-workspace-topbar-actions">
            {view === "app" && store.apps.length > 0 && (
              <div className="tracker-app-pill-list" role="tablist" aria-label="Tracked apps">
                {store.apps.map((a) => {
                  const active = store.activeAppKey === appKey(a.appStoreId, a.country);
                  return (
                    <button
                      key={appKey(a.appStoreId, a.country)}
                      type="button"
                      role="button"
                      aria-label={`Select ${a.name}`}
                      className={`tracker-app-pill ${active ? "is-active" : ""}`}
                      onClick={() => selectApp(a)}
                    >
                      {a.iconUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.iconUrl} alt="" width={16} height={16} />
                      )}
                      <span>{a.name}</span>
                      <span className="tracker-app-store-badge">{a.country}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {view === "app" && store.apps.length > 0 && signedIn && !isPro && (
              <button
                type="button"
                className="tracker-sync-status-pill is-local"
                onClick={openUpgrade}
                title="Data saved in local browser storage. Upgrade to Pro for Cloud Sync across devices."
              >
                <CloudOff size={13} aria-hidden="true" />
                <span>Local storage &middot; <strong className="sync-upgrade-text">Sync with Pro ↗</strong></span>
              </button>
            )}

            {view === "app" && store.apps.length > 0 && signedIn && isPro && syncState !== "off" && (
              <div
                className="tracker-sync-status-pill is-synced"
                title="Cloud sync active across all your devices."
              >
                <Cloud size={13} aria-hidden="true" />
                <span>Cloud synced</span>
              </div>
            )}

            {accessReady && trackingAllowed ? (
              <button
                type="button"
                className="tracker-button-primary tracker-topbar-add-btn"
                onClick={requestAddApp}
              >
                <Plus size={15} aria-hidden="true" />
                Add App
              </button>
            ) : accessReady && isGuest && view === "app" ? (
              <button
                type="button"
                className="tracker-button-primary tracker-topbar-add-btn"
                onClick={() => openAuth("track")}
              >
                <LogIn size={15} aria-hidden="true" />
                Sign in to track
              </button>
            ) : null}

            <button
              type="button"
              className="tracker-sidebar-toggle"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={16} aria-hidden="true" />
              Apps
            </button>
          </div>
        </div>

        {banner && (
          <div className="keyword-error tracker-banner marketing-container" role="status">
            {banner}
            <button
              type="button"
              onClick={() => setBanner(null)}
              aria-label="Dismiss"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}

        {bootstrapping && (
          <div className="tracker-bootstrap marketing-container" role="status" aria-live="polite">
            <Loader2 className="spin" size={15} aria-hidden="true" />
            <span>
              {bootstrapLabel}
              {analyzeProgress
                ? ` (${analyzeProgress.done}/${analyzeProgress.total})`
                : ""}
            </span>
            {analyzeProgress && analyzeProgress.total > 0 && (
              <i className="tracker-bootstrap-bar" aria-hidden="true">
                <b
                  style={{
                    width: `${(analyzeProgress.done / analyzeProgress.total) * 100}%`,
                  }}
                />
              </i>
            )}
          </div>
        )}

        {view === "app" && !activeApp && isGuest && store.apps.length === 0 ? (
          <section
            className="guest-lock-panel marketing-container"
            aria-label="Sign in to track apps"
          >
            <span className="guest-lock-icon" aria-hidden="true">
              <Lock size={18} />
            </span>
            <div className="guest-lock-copy">
              <h2>Tracking needs a free account</h2>
              <p>
                You&apos;re browsing as a guest. Keyword Explorer stays open —
                add an app after you sign in. Free accounts can track 1 app and
                25 keywords in this browser.
              </p>
            </div>
            <div className="guest-lock-actions">
              <button
                type="button"
                className="tracker-button-primary"
                onClick={() => openAuth("track")}
              >
                <LogIn size={16} aria-hidden="true" />
                Sign in free
              </button>
              <button
                type="button"
                className="tracker-button-secondary"
                onClick={selectExplorer}
              >
                Keep searching keywords
              </button>
            </div>
          </section>
        ) : view === "explorer" || !activeApp ? (
          <>
            <KeywordExplorer />
            {accessReady && store.apps.length === 0 && (
              <section
                className="tracker-cta-strip marketing-container"
                aria-label="Track your app"
              >
                <div className="tracker-cta-copy">
                  <h2>
                    {isGuest ? "Sign in to track your app" : "Track your own app"}
                  </h2>
                  <p>
                    {isGuest
                      ? "Keyword search is open as a guest. A free account unlocks one tracked app, rank history, and the ASO assistant."
                      : "Add an app to watch its keywords — popularity, difficulty, and rank in the public App Store results."}
                  </p>
                </div>
                <div className="tracker-cta-actions">
                  {isGuest ? (
                    <button
                      type="button"
                      className="tracker-button-primary"
                      onClick={() => openAuth("track")}
                    >
                      <LogIn size={16} aria-hidden="true" />
                      Sign in to track
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="tracker-button-primary"
                        onClick={requestAddApp}
                      >
                        <Plus size={16} aria-hidden="true" />
                        Add your first app
                      </button>
                      <button
                        type="button"
                        className="tracker-button-secondary"
                        disabled={bootstrapping}
                        onClick={() => void handleQuickStart("US")}
                      >
                        <Sparkles size={16} aria-hidden="true" />
                        Try a sample app
                      </button>
                    </>
                  )}
                </div>
              </section>
            )}
          </>
        ) : (
          <div className="marketing-container">
            <TrackerView
              app={activeApp}
              store={store}
              onStoreChange={persist}
              suspendAutoRefresh={bootstrapping}
              onTrackInStorefront={handleTrackInStorefront}
            />
          </div>
        )}
      </div>

      {sidebarOpen && (
        <button
          type="button"
          className="tracker-sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Slide-out drawer (used on mobile or when toggled) */}
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
            onClick={() => {
              selectExplorer();
              setSidebarOpen(false);
            }}
          >
            <Compass size={16} aria-hidden="true" />
            Keyword Explorer
          </button>
        </nav>

        <div
          className={`tracker-sidebar-section${
            store.apps.length === 0 ? " is-empty" : ""
          }`}
        >
          <div className="tracker-sidebar-section-label">My Apps</div>
          {store.apps.length === 0 ? (
            <p className="tracker-sidebar-empty">
              No apps yet — add one to track its keywords and rank.
            </p>
          ) : (
            <ul className="tracker-app-list">
              {store.apps.map((app) => {
                const key = appKey(app.appStoreId, app.country);
                const active = view === "app" && store.activeAppKey === key;
                const count = listKeywordsForApp(
                  store,
                  app.appStoreId,
                  app.country,
                ).length;
                return (
                  <li
                    key={key}
                    className={
                      active ? "tracker-app-row is-active" : "tracker-app-row"
                    }
                  >
                    <button
                      type="button"
                      className="tracker-app-card"
                      onClick={() => {
                        selectApp(app);
                        setSidebarOpen(false);
                      }}
                      aria-current={active ? "true" : undefined}
                    >
                      {app.iconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={app.iconUrl}
                          alt=""
                          width={36}
                          height={36}
                          loading="lazy"
                        />
                      ) : (
                        <span
                          className="tracker-app-icon-fallback"
                          aria-hidden="true"
                        >
                          {app.name.charAt(0)}
                        </span>
                      )}
                      <span className="tracker-app-card-meta">
                        <strong title={app.name}>{app.name}</strong>
                        <small>
                          <span className="tracker-app-store-badge">
                            {app.country}
                          </span>
                          <span>
                            {count} keyword{count === 1 ? "" : "s"}
                          </span>
                        </small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="tracker-app-delete"
                      aria-label={`Remove ${app.name}`}
                      title={`Remove ${app.name}`}
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
          {accessReady && trackingAllowed ? (
            <button
              type="button"
              className="tracker-button-primary tracker-button-block"
              onClick={() => {
                requestAddApp();
                setSidebarOpen(false);
              }}
            >
              <Plus size={16} aria-hidden="true" />
              Add App
            </button>
          ) : accessReady && isGuest ? (
            <button
              type="button"
              className="tracker-button-primary tracker-button-block"
              onClick={() => {
                openAuth("track");
                setSidebarOpen(false);
              }}
            >
              <LogIn size={16} aria-hidden="true" />
              Sign in to track
            </button>
          ) : null}
          {accountsLive && (
            <div className="tracker-sidebar-account">
              {signedIn ? (
                <>
                  <span
                    className={`account-plan-chip ${isPro ? "is-pro" : "is-free"}`}
                  >
                    {isPro ? "Pro" : "Free"}
                  </span>
                  <span className="tracker-sidebar-footnote">
                    {account.user?.email}
                  </span>
                  <button
                    type="button"
                    className="tracker-sidebar-link"
                    onClick={() => void signOut()}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <span className="account-plan-chip is-guest">Guest</span>
                  <span className="tracker-sidebar-footnote">
                    Search is open. Tracking and the assistant need a free account.
                  </span>
                  <button
                    type="button"
                    className="tracker-sidebar-link"
                    onClick={() => openAuth("default")}
                  >
                    Sign in free
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </aside>

      <OnboardingModal
        open={onboardingOpen}
        isPro={isPro}
        onAddApp={() => {
          dismissOnboarding();
          setAddAppOpen(true);
        }}
        onClose={dismissOnboarding}
      />

      <AddAppModal
        open={addAppOpen}
        existingKeys={existingAppKeys}
        onClose={() => setAddAppOpen(false)}
        onSelect={(app, country) => {
          void handleSelectCatalogApp(app, country);
        }}
        onQuickStart={(country) => void handleQuickStart(country)}
        quickStartBusy={bootstrapping}
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
