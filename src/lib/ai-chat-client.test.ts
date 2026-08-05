import { afterEach, describe, expect, it, vi } from "vitest";

import { AI_LIMITS } from "@/lib/ai-chat";
import {
  AI_CLIENT_DAY_KEY,
  AI_MESSAGES_KEY,
  AI_WELCOME,
  clearStoredMessages,
  loadStoredMessages,
  loadTrackerContext,
  readClientDayCount,
  requestAssistantReply,
  saveStoredMessages,
  writeClientDayCount,
  type UiMessage,
} from "@/lib/ai-chat-client";

function makeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

const today = () => new Date().toISOString().slice(0, 10);

const sample: UiMessage[] = [
  {
    id: "m1",
    role: "user",
    content: "suggest keywords",
  },
  {
    id: "m2",
    role: "assistant",
    content: "try meditation",
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ai-chat-client SSR guards", () => {
  it("returns safe defaults without a window", () => {
    expect(readClientDayCount()).toEqual({ day: "", count: 0 });
    expect(() => writeClientDayCount(3)).not.toThrow();
    expect(loadStoredMessages()).toEqual([AI_WELCOME]);
    expect(() => saveStoredMessages([AI_WELCOME])).not.toThrow();
    expect(() => clearStoredMessages()).not.toThrow();
    expect(loadTrackerContext()).toBeNull();
  });
});

describe("readClientDayCount / writeClientDayCount", () => {
  it("starts at zero and persists the count for the same day", () => {
    const storage = makeStorage();
    vi.stubGlobal("window", { localStorage: storage });
    expect(readClientDayCount()).toEqual({ day: today(), count: 0 });
    writeClientDayCount(2);
    expect(readClientDayCount()).toEqual({ day: today(), count: 2 });
  });

  it("resets the count when the stored day is stale or corrupt", () => {
    const stale = makeStorage({
      [AI_CLIENT_DAY_KEY]: JSON.stringify({ day: "2000-01-01", count: 9 }),
    });
    vi.stubGlobal("window", { localStorage: stale });
    expect(readClientDayCount()).toEqual({ day: today(), count: 0 });

    const corrupt = makeStorage({ [AI_CLIENT_DAY_KEY]: "{nope" });
    vi.stubGlobal("window", { localStorage: corrupt });
    expect(readClientDayCount()).toEqual({ day: today(), count: 0 });
  });
});

describe("stored messages", () => {
  it("round-trips messages and clears them", () => {
    const storage = makeStorage();
    vi.stubGlobal("window", { localStorage: storage });
    expect(loadStoredMessages()).toEqual([AI_WELCOME]);

    // The welcome is kept while the thread is short (<= 2 messages).
    saveStoredMessages(sample);
    expect(loadStoredMessages()).toEqual([AI_WELCOME, ...sample]);

    clearStoredMessages();
    expect(loadStoredMessages()).toEqual([AI_WELCOME]);
  });

  it("filters invalid rows, caps the tail, and prepends the welcome", () => {
    const junk: unknown[] = [
      null,
      { id: "x", role: "system", content: "nope" },
      { id: "y", role: "user", content: "   " },
      { id: "z", role: "assistant" },
      ...sample,
    ];
    const storage = makeStorage({
      [AI_MESSAGES_KEY]: JSON.stringify(junk),
    });
    vi.stubGlobal("window", { localStorage: storage });
    expect(loadStoredMessages()).toEqual([AI_WELCOME, ...sample]);

    const long = Array.from({ length: 90 }, (_, i) => ({
      id: `m${i}`,
      role: "user" as const,
      content: `msg ${i}`,
    }));
    const tail = loadStoredMessagesFrom(storage, long);
    expect(tail).toHaveLength(81); // welcome + last 80
    expect(tail[tail.length - 1]?.id).toBe("m89");
  });

  it("returns the welcome for empty or corrupt storage", () => {
    const empty = makeStorage({ [AI_MESSAGES_KEY]: "[]" });
    vi.stubGlobal("window", { localStorage: empty });
    expect(loadStoredMessages()).toEqual([AI_WELCOME]);

    const corrupt = makeStorage({ [AI_MESSAGES_KEY]: "{bad" });
    vi.stubGlobal("window", { localStorage: corrupt });
    expect(loadStoredMessages()).toEqual([AI_WELCOME]);
  });

  it("drops the welcome from long threads when persisting", () => {
    const storage = makeStorage();
    vi.stubGlobal("window", { localStorage: storage });
    saveStoredMessages([AI_WELCOME, ...sample]);
    const saved = JSON.parse(storage.getItem(AI_MESSAGES_KEY) ?? "[]") as unknown[];
    expect(saved).toHaveLength(2);
    expect(saved.some((m) => (m as UiMessage).id === "welcome")).toBe(false);
  });
});

describe("loadTrackerContext", () => {
  it("returns null without a tracker store or on corrupt JSON", () => {
    const empty = makeStorage();
    vi.stubGlobal("window", { localStorage: empty });
    expect(loadTrackerContext()).toBeNull();

    const corrupt = makeStorage({ "appclimb:tracker:v1": "{bad" });
    vi.stubGlobal("window", { localStorage: corrupt });
    expect(loadTrackerContext()).toBeNull();
  });

  it("loads the active app and its keywords", () => {
    const raw = {
      activeAppKey: "222:DE",
      apps: [
        { appStoreId: "111", name: "Old App", country: "US" },
        {
          appStoreId: "222",
          name: "Calm Focus",
          developer: "Indie Labs",
          genre: "Health",
          country: "DE",
        },
      ],
      keywords: {
        a: {
          appStoreId: "222",
          country: "DE",
          keyword: "meditation",
          note: "strong",
          currentMetrics: { popularity: 70, difficulty: 30, position: 12 },
        },
        b: {
          appStoreId: "222",
          country: "DE",
          keyword: "unranked",
          currentMetrics: { position: null },
        },
        c: {
          appStoreId: "222",
          country: "DE",
          keyword: "offline",
          currentMetrics: { unavailable: true },
        },
        d: { appStoreId: "111", country: "US", keyword: "other app" },
      },
    };
    vi.stubGlobal("window", {
      localStorage: makeStorage({
        "appclimb:tracker:v1": JSON.stringify(raw),
      }),
    });
    const context = loadTrackerContext();
    expect(context?.appName).toBe("Calm Focus");
    expect(context?.appStoreId).toBe("222");
    expect(context?.country).toBe("DE");
    const keywords = context?.keywords ?? [];
    expect(keywords).toHaveLength(3);
    expect(keywords[0]).toMatchObject({
      keyword: "meditation",
      note: "strong",
      popularity: 70,
      position: 12,
    });
    expect(keywords[1]).toMatchObject({
      keyword: "unranked",
      position: ">200",
    });
    expect(keywords[2]).toMatchObject({
      keyword: "offline",
      popularity: null,
      position: "Unavailable",
    });
  });

  it("falls back to the first app and tolerates missing keyword metrics", () => {
    const raw = {
      apps: [{ appStoreId: "111", name: "Solo App", country: "US" }],
      keywords: {
        a: {
          appStoreId: "111",
          country: "US",
          keyword: "yoga",
          currentMetrics: null,
        },
      },
    };
    vi.stubGlobal("window", {
      localStorage: makeStorage({
        "appclimb:tracker:v1": JSON.stringify(raw),
      }),
    });
    const context = loadTrackerContext();
    expect(context?.appName).toBe("Solo App");
    expect(context?.keywords?.[0]).toMatchObject({
      keyword: "yoga",
      popularity: null,
      position: null,
    });
  });
});

describe("requestAssistantReply", () => {
  const reply = {
    message: "Try meditation and habit tracker.",
    remainingDay: 4,
    remainingHour: 11,
  };

  it("rejects messages that are too short before any fetch", async () => {
    await expect(
      requestAssistantReply({ message: "x", history: [], context: null }),
    ).rejects.toThrow(/too short/u);
  });

  it("blocks when today's local limit is reached", async () => {
    const storage = makeStorage();
    vi.stubGlobal("window", { localStorage: storage });
    writeClientDayCount(AI_LIMITS.maxMessagesPerDay);
    await expect(
      requestAssistantReply({ message: "suggest keywords", history: [], context: null }),
    ).rejects.toThrow(/local assistant limit/u);
  });

  it("posts trimmed content and history without the welcome, then persists", async () => {
    const storage = makeStorage();
    vi.stubGlobal("window", { localStorage: storage });
    const fetchImpl = vi.fn(async () =>
      Response.json(reply, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchImpl);

    const result = await requestAssistantReply({
      message: "  suggest keywords  ",
      history: [AI_WELCOME, ...sample],
      context: null,
    });

    expect(result).toEqual(reply);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/chat");
    const body = JSON.parse(String(init.body)) as {
      message: string;
      messages: unknown[];
    };
    expect(body.message).toBe("suggest keywords");
    expect(body.messages).toEqual(
      sample.map(({ role, content }) => ({ role, content })),
    );
    expect(readClientDayCount().count).toBe(1);
  });

  it("surfaces server errors, rate limits, and empty replies", async () => {
    const storage = makeStorage();
    vi.stubGlobal("window", { localStorage: storage });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "server said no" }, { status: 500 }),
      ),
    );
    await expect(
      requestAssistantReply({ message: "suggest", history: [], context: null }),
    ).rejects.toThrow("server said no");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({}, { status: 429 })),
    );
    await expect(
      requestAssistantReply({ message: "suggest", history: [], context: null }),
    ).rejects.toThrow(/Rate limit reached/u);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ message: "   " }, { status: 200 })),
    );
    await expect(
      requestAssistantReply({ message: "suggest", history: [], context: null }),
    ).rejects.toThrow(/Empty assistant response/u);
  });
});

// Helper: load messages from a raw storage without restubbing window.
function loadStoredMessagesFrom(
  storage: ReturnType<typeof makeStorage>,
  raw: unknown[],
): UiMessage[] {
  storage.setItem(AI_MESSAGES_KEY, JSON.stringify(raw));
  vi.stubGlobal("window", { localStorage: storage });
  return loadStoredMessages();
}
