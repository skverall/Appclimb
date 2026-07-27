"use client";

/**
 * Global, server-derived website setup state (Task P0.27).
 *
 * The previous implementation kept the wizard position in component state, so a
 * reload lost the user's next step. Everything here is read from and written
 * back to the API, which is why Pulse, the app tab and the wizard can all agree
 * on the same incomplete step.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { VerifiedEventDetails } from "./tracking-status";
import {
  deriveWebInstallState,
  type WebInstallFacts,
  type WebInstallState,
  type WebInstallStep,
} from "./web-install-state";

export interface WebInstallProperty {
  id: string;
  name: string;
  domain: string;
  trackingToken?: string;
  tokenVersion?: number;
  createdAt?: string;
}

export interface WebInstallSnapshot {
  property: WebInstallProperty | null;
  facts: WebInstallFacts;
  firstEvent: VerifiedEventDetails | null;
  collectorOrigin?: string;
}

/** Bounded verification polling — never an unbounded background loop. */
export const LISTEN_POLL_INTERVAL_MS = 3_000;
export const LISTEN_MAX_ATTEMPTS = 30;

const EMPTY_SNAPSHOT: WebInstallSnapshot = {
  property: null,
  facts: {},
  firstEvent: null,
};

interface InstallEnvelope {
  data?: {
    property?: WebInstallProperty | null;
    install?: WebInstallFacts;
    firstEvent?: VerifiedEventDetails | null;
    collectorOrigin?: string;
  };
  error?: string;
}

export function useWebInstallState({
  appId = "",
  enabled = true,
}: {
  appId?: string;
  enabled?: boolean;
} = {}) {
  const [snapshot, setSnapshot] = useState<WebInstallSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(enabled);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [listenAttempts, setListenAttempts] = useState(0);
  const [listenTimedOut, setListenTimedOut] = useState(false);
  const listeningRef = useRef(false);

  const load = useCallback(async (): Promise<WebInstallSnapshot | null> => {
    if (!enabled) return null;
    setLoading(true);
    try {
      const query = appId ? `?appId=${encodeURIComponent(appId)}` : "";
      const response = await fetch(`/api/web-install${query}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(
          response.status === 401 ? "authentication_required" : "load_failed",
        );
      }
      const payload = (await response.json()) as InstallEnvelope;
      const next: WebInstallSnapshot = {
        property: payload.data?.property ?? null,
        facts: payload.data?.install ?? {},
        firstEvent: payload.data?.firstEvent ?? null,
        collectorOrigin: payload.data?.collectorOrigin,
      };
      setSnapshot(next);
      setError("");
      return next;
    } catch (loadError) {
      setError(
        loadError instanceof Error &&
          loadError.message === "authentication_required"
          ? "Sign in again to continue website setup."
          : "Website setup state could not be loaded. Nothing was changed.",
      );
      return null;
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [appId, enabled]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const timer = window.setTimeout(() => {
      if (active) void load();
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [enabled, load]);

  // Bounded verification polling with a visible listening state.
  useEffect(() => {
    if (!listening) return;
    listeningRef.current = true;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      setListenAttempts(attempts);
      void load().then((next) => {
        if (next?.facts.firstEventAt) {
          listeningRef.current = false;
          setListening(false);
          setListenTimedOut(false);
        } else if (attempts >= LISTEN_MAX_ATTEMPTS) {
          listeningRef.current = false;
          setListening(false);
          setListenTimedOut(true);
        }
      });
    }, LISTEN_POLL_INTERVAL_MS);
    return () => {
      listeningRef.current = false;
      window.clearInterval(timer);
    };
  }, [listening, load]);

  const startListening = useCallback(() => {
    setListenTimedOut(false);
    setListenAttempts(0);
    setListening(true);
  }, []);

  const stopListening = useCallback(() => {
    setListening(false);
  }, []);

  const saveStep = useCallback(
    async (step: WebInstallStep) => {
      setSnapshot((current) => ({
        ...current,
        facts: { ...current.facts, reachedStep: step },
      }));
      try {
        await fetch("/api/web-install", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "step", step, appId }),
        });
      } catch {
        // Local state already advanced; the next load reconciles with the API.
      }
    },
    [appId],
  );

  const saveGoal = useCallback(
    async (goal: string): Promise<boolean> => {
      try {
        const response = await fetch("/api/web-install", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "goal", goal, appId }),
        });
        if (!response.ok) return false;
        await load();
        return true;
      } catch {
        return false;
      }
    },
    [appId, load],
  );

  const state: WebInstallState = useMemo(
    () =>
      deriveWebInstallState({
        ...snapshot.facts,
        propertyId: snapshot.property?.id ?? snapshot.facts.propertyId ?? null,
        domain: snapshot.property?.domain ?? snapshot.facts.domain ?? null,
        listening,
      }),
    [snapshot, listening],
  );

  return {
    snapshot,
    setSnapshot,
    state,
    loading,
    loaded,
    error,
    refresh: load,
    listening,
    listenAttempts,
    listenTimedOut,
    startListening,
    stopListening,
    saveStep,
    saveGoal,
  };
}
