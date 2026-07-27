// @vitest-environment jsdom

/**
 * Journey B — Website (Decision System V2 plan, section 15.3).
 *
 * Drives the real TrackingInstallWizard through the whole documented journey
 * against a scripted collector API:
 *
 *   1. add domain
 *   2. UI says `Website saved`, not connected
 *   3. copy the AI-agent prompt
 *   4. verify before deploy -> truthful "not detected"
 *   5. deploy the script
 *   6. open the live site
 *   7. first real event received (through the bounded listening poll)
 *   8. verified hostname / path / accepted time shown
 *   9. configure a conversion goal
 *  10. collection progress shown
 *
 * Step 11 (web diagnosis / action plan) belongs to the diagnosis agents and is
 * asserted in their suites; this spec stops where the install journey stops.
 */

import "@testing-library/jest-dom/vitest";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TrackingInstallWizard } from "./tracking-install-wizard";
import { LISTEN_POLL_INTERVAL_MS } from "./use-web-install-state";

const DOMAIN = "cardealertracker.app";
const TOKEN = "acwa1_journey_b";

interface ServerState {
  property: {
    id: string;
    name: string;
    domain: string;
    trackingToken: string;
    tokenVersion: number;
    createdAt: string;
  } | null;
  firstEventAt: string | null;
  lastEventAt: string | null;
  verifiedHostname: string | null;
  primaryConversionGoal: string | null;
  reachedStep: string | null;
  baselineSessions: number | null;
  baselineDays: number | null;
}

let server: ServerState;
let clipboard: string[];
let openedUrls: string[];

function property() {
  return {
    id: "prop-journey-b",
    name: "Car Dealer Tracker",
    domain: DOMAIN,
    trackingToken: TOKEN,
    tokenVersion: 1,
    createdAt: "2026-07-27T10:00:00.000Z",
  };
}

function installResponse() {
  if (!server.property) {
    return {
      data: {
        property: null,
        install: { propertyId: null, reachedStep: "domain" },
        firstEvent: null,
      },
    };
  }
  return {
    data: {
      property: server.property,
      install: {
        propertyId: server.property.id,
        domain: server.property.domain,
        firstEventAt: server.firstEventAt,
        lastEventAt: server.lastEventAt,
        verifiedHostname: server.verifiedHostname,
        installationVersion: 1,
        primaryConversionGoal: server.primaryConversionGoal,
        baselineSessions: server.baselineSessions,
        baselineDays: server.baselineDays,
        reachedStep: server.reachedStep ?? "install",
      },
      firstEvent: server.firstEventAt
        ? {
            acceptedAt: server.firstEventAt,
            hostname: server.verifiedHostname ?? DOMAIN,
            path: "/pricing",
            kind: "page_view",
            source: "browser",
            collectorStatus: "accepted",
          }
        : null,
    },
  };
}

/** Flushes the wizard's timers and the promises they start. */
async function tick(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  server = {
    property: null,
    firstEventAt: null,
    lastEventAt: null,
    verifiedHostname: null,
    primaryConversionGoal: null,
    reachedStep: null,
    baselineSessions: null,
    baselineDays: null,
  };
  clipboard = [];
  openedUrls = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (
        url.startsWith("/api/web-install") &&
        (init?.method ?? "GET") === "GET"
      ) {
        return Response.json(installResponse());
      }
      if (url === "/api/web-install" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          action: string;
          step?: string;
          goal?: string;
        };
        if (body.action === "step") {
          server.reachedStep = body.step ?? server.reachedStep;
          return Response.json({ data: { reachedStep: server.reachedStep } });
        }
        server.primaryConversionGoal = body.goal ?? null;
        return Response.json({
          data: { primaryConversionGoal: server.primaryConversionGoal },
        });
      }
      if (url === "/api/acquisition" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { domain: string };
        server.property = { ...property(), domain: body.domain };
        server.reachedStep = "install";
        return Response.json({ data: server.property }, { status: 201 });
      }
      return new Response("not found", { status: 404 });
    }),
  );

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn(async (text: string) => {
        clipboard.push(text);
      }),
    },
  });
  vi.stubGlobal(
    "open",
    vi.fn((url: string) => {
      openedUrls.push(url);
      return null;
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Journey B — website install", () => {
  it("walks add domain → install → deploy → verify → goal → baseline", async () => {
    render(<TrackingInstallWizard appId="web-app" onFinish={vi.fn()} />);
    await tick();

    // --- 1. Add domain -----------------------------------------------------
    fireEvent.change(screen.getByLabelText(/Website domain/i), {
      target: { value: `https://www.${DOMAIN}/pricing` },
    });
    // The canonical hostname is resolved before anything is saved.
    expect(
      screen.getByText(`Canonical hostname: ${DOMAIN}`),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Save website/i }));
    await tick();

    // --- 2. `Website saved`, explicitly not connected ----------------------
    expect(screen.getByText("Website saved")).toBeInTheDocument();
    expect(screen.queryByText(/Web SaaS connected/i)).toBeNull();
    expect(screen.queryByText(/Website connected/i)).toBeNull();
    expect(screen.queryByText("Tracking installed")).toBeNull();
    // The only mention of a connection is the explicit denial.
    expect(
      screen.getByText(/A saved domain is not a connected source/i),
    ).toBeInTheDocument();

    // --- 3. Copy the AI-agent prompt (default tab) -------------------------
    expect(
      screen.getByRole("tab", { name: /AI coding agent/i }),
    ).toHaveAttribute("aria-selected", "true");
    const tabLabels = screen
      .getAllByRole("tab")
      .map((tab) => tab.textContent ?? "");
    expect(tabLabels[0]).toMatch(/AI coding agent/);
    expect(tabLabels[1]).toMatch(/Next\.js/);
    expect(tabLabels[2]).toMatch(/React \/ Vite/);
    expect(tabLabels[3]).toMatch(/Plain HTML/);
    // Optional crawler forwarding is last and never in the first prompt.
    expect(tabLabels[4]).toMatch(/Advanced/);

    fireEvent.click(
      screen.getByRole("button", { name: /Copy AI agent prompt/i }),
    );
    await tick();
    expect(clipboard).toHaveLength(1);
    expect(clipboard[0]).toContain(`data-token="${TOKEN}"`);
    expect(clipboard[0]).toContain("after it accepts a real browser event");
    expect(clipboard[0]).not.toContain("APPCLIMB_TRACKING_TOKEN");

    // --- 5. Deploy the script ---------------------------------------------
    fireEvent.click(
      screen.getByRole("button", { name: /I added the script/i }),
    );
    await tick();
    expect(
      screen.getByRole("button", {
        name: /Open live site and listen for the first event/i,
      }),
    ).toBeInTheDocument();

    // --- 4. Verify before deploy → truthful "not detected" -----------------
    fireEvent.click(
      screen.getByRole("button", { name: /Check for events now/i }),
    );
    await tick();
    expect(screen.getByText(/Tracking not detected yet/i)).toBeInTheDocument();
    expect(screen.queryByText("Tracking installed")).toBeNull();

    // --- 6. Open the live site and start bounded listening -----------------
    fireEvent.click(
      screen.getByRole("button", {
        name: /Open live site and listen for the first event/i,
      }),
    );
    await tick();
    expect(openedUrls).toEqual([`https://${DOMAIN}`]);
    expect(
      screen.getByText(/Listening for the first real event/i),
    ).toBeInTheDocument();

    // --- 7. The collector accepts the first real browser event -------------
    server.firstEventAt = "2026-07-27T11:30:00.000Z";
    server.lastEventAt = "2026-07-27T11:30:00.000Z";
    server.verifiedHostname = DOMAIN;
    server.baselineSessions = 1;
    server.baselineDays = 1;
    await tick(LISTEN_POLL_INTERVAL_MS + 50);

    // --- 8. Verified hostname / path / accepted time are shown -------------
    // Shown on the header pill and on the verified-event summary.
    expect(screen.getAllByText("Tracking installed").length).toBeGreaterThan(0);
    expect(
      screen.queryByText(/Listening for the first real event/i),
    ).toBeNull();
    const facts = document.querySelector(".wt-event-facts") as HTMLElement;
    expect(facts).not.toBeNull();
    expect(within(facts).getByText("Accepted at")).toBeInTheDocument();
    expect(within(facts).getByText(DOMAIN)).toBeInTheDocument();
    expect(within(facts).getByText("/pricing")).toBeInTheDocument();
    expect(within(facts).getByText("page_view")).toBeInTheDocument();
    expect(within(facts).getByText("browser")).toBeInTheDocument();
    expect(within(facts).getByText("accepted")).toBeInTheDocument();

    // --- 9. Configure a conversion goal ------------------------------------
    fireEvent.click(
      screen.getByRole("button", { name: /configure a conversion goal/i }),
    );
    await tick();
    expect(
      screen.getByRole("radiogroup", { name: /conversion goal/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/conversion diagnosis stays blocked/i),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("radio", { name: /Subscription started/i }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Save conversion goal/i }),
    );
    await tick();
    expect(server.primaryConversionGoal).toBe("subscription_started");

    // --- 10. Real collection progress --------------------------------------
    server.baselineSessions = 12;
    server.baselineDays = 2;
    fireEvent.click(screen.getByRole("button", { name: /Refresh progress/i }));
    await tick();
    const progress = screen.getByRole("progressbar", {
      name: /Baseline collection/i,
    });
    expect(progress).toHaveAttribute("aria-valuenow", "48");
    expect(screen.getByText(/of 40 sessions/i)).toBeInTheDocument();
    expect(screen.getByText(/of 3 days with events/i)).toBeInTheDocument();
    expect(
      screen.getByText(/will not claim a bottleneck before the sample/i),
    ).toBeInTheDocument();
    // Not ready for diagnosis on a 12-session sample.
    expect(screen.queryByText("Ready for diagnosis")).toBeNull();
  });

  it("resumes on the exact incomplete step after a reload", async () => {
    server.property = property();
    server.reachedStep = "deploy";

    render(<TrackingInstallWizard appId="web-app" />);
    await tick();

    // A fresh mount holds no component state: the step comes from the server.
    expect(
      screen.getByRole("button", {
        name: /Open live site and listen for the first event/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Waiting for deploy")).toBeInTheDocument();
  });

  it("never shows baseline progress before a real event", async () => {
    server.property = property();
    server.reachedStep = "install";

    render(<TrackingInstallWizard appId="web-app" />);
    await tick();

    expect(screen.getByText("Website saved")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText("Ready for diagnosis")).toBeNull();
  });

  it("stops the bounded listening poll instead of watching forever", async () => {
    server.property = property();
    server.reachedStep = "verify";

    render(<TrackingInstallWizard appId="web-app" />);
    await tick();

    fireEvent.click(
      screen.getByRole("button", {
        name: /Open live site and listen for the first event/i,
      }),
    );
    await tick();
    expect(
      screen.getByText(/Listening for the first real event/i),
    ).toBeInTheDocument();

    // 30 attempts at 3s: the poll must give up with a truthful message.
    await tick(LISTEN_POLL_INTERVAL_MS * 31);
    expect(
      screen.queryByText(/Listening for the first real event/i),
    ).toBeNull();
    expect(
      screen.getByText(/No event arrived while listening/i),
    ).toBeInTheDocument();
  });
});
