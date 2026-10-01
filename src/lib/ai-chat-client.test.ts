import { afterEach, describe, expect, it, vi } from "vitest";

import { AI_LIMITS } from "@/lib/ai-chat";
import {
  AI_CLIENT_DAY_KEY,
  AI_CONVERSATIONS_KEY,
  AI_MESSAGES_KEY,
  AI_WELCOME,
  clearStoredMessages,
  conversationTitleFromMessages,
  createConversation,
  deleteConversation,
  loadAiChatStore,
  loadChatState,
  loadStoredMessages,
  listTrackedApps,
  loadTrackerContext,
  readClientDayCount,
  readContextChoice,
  ReplyStoppedError,
  requestAssistantReply,
  resolveContextKey,
  writeContextChoice,
  saveStoredMessages,
  setActiveConversation,
  writeClientDayCount,
  type AiChatStore,
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

function conversation(
  id: string,
  messages: UiMessage[] = sample,
  updatedAt = "2026-01-01T00:00:00.000Z",
) {
  return {
    id,
    title: "Chat",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
    messages,
  };
}

/** Seed the conversations store and stub window.localStorage with it. */
function seedStore(
  storage: ReturnType<typeof makeStorage>,
  conversations: AiChatStore["conversations"],
  activeId?: string,
): void {
  const store: AiChatStore = {
    version: 1,
    activeId: activeId ?? conversations[0]?.id ?? null,
    conversations,
  };
  storage.setItem(AI_CONVERSATIONS_KEY, JSON.stringify(store));
  vi.stubGlobal("window", { localStorage: storage });
}

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
    expect(loadChatState()).toEqual({ activeId: null, conversations: [] });
    expect(() => createConversation()).not.toThrow();
    expect(setActiveConversation("c1")).toBe(false);
    expect(deleteConversation("c1")).toBe(false);
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
    const storage = makeStorage();
    seedStore(storage, [conversation("c1", junk as UiMessage[])]);
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
    const empty = makeStorage({ [AI_CONVERSATIONS_KEY]: "[]" });
    vi.stubGlobal("window", { localStorage: empty });
    expect(loadStoredMessages()).toEqual([AI_WELCOME]);

    const corrupt = makeStorage({ [AI_CONVERSATIONS_KEY]: "{bad" });
    vi.stubGlobal("window", { localStorage: corrupt });
    expect(loadStoredMessages()).toEqual([AI_WELCOME]);
  });

  it("drops the welcome from long threads when persisting", () => {
    const storage = makeStorage();
    vi.stubGlobal("window", { localStorage: storage });
    saveStoredMessages([AI_WELCOME, ...sample]);
    const store = JSON.parse(
      storage.getItem(AI_CONVERSATIONS_KEY) ?? "{}",
    ) as AiChatStore;
    const active = store.conversations.find((c) => c.id === store.activeId);
    expect(active?.messages).toHaveLength(2);
    expect(active?.messages.some((m) => m.id === "welcome")).toBe(false);
  });
});

describe("conversation history", () => {
  it("migrates the legacy single thread into the first conversation", () => {
    const storage = makeStorage({
      [AI_MESSAGES_KEY]: JSON.stringify(sample),
    });
    vi.stubGlobal("window", { localStorage: storage });

    const state = loadChatState();
    expect(state.conversations).toHaveLength(1);
    expect(state.conversations[0]?.title).toBe("suggest keywords");
    expect(state.conversations[0]?.messageCount).toBe(2);
    expect(state.activeId).toBe(state.conversations[0]?.id);
    expect(loadStoredMessages()).toEqual([AI_WELCOME, ...sample]);
    expect(storage.getItem(AI_MESSAGES_KEY)).toBeNull();
    expect(storage.getItem(AI_CONVERSATIONS_KEY)).not.toBeNull();
  });

  it("keeps the conversations store and removes the legacy key when both exist", () => {
    const storage = makeStorage({
      [AI_MESSAGES_KEY]: JSON.stringify(sample),
    });
    seedStore(storage, [conversation("c1", sample, "2026-02-01T00:00:00.000Z")]);
    const state = loadChatState();
    expect(state.conversations).toHaveLength(1);
    expect(state.conversations[0]?.id).toBe("c1");
    expect(storage.getItem(AI_MESSAGES_KEY)).toBeNull();
  });

  it("creates, switches, and deletes conversations", () => {
    const storage = makeStorage();
    vi.stubGlobal("window", { localStorage: storage });
    expect(loadStoredMessages()).toEqual([AI_WELCOME]);

    // First real thread.
    saveStoredMessages([AI_WELCOME, ...sample]);
    const firstId = loadChatState().activeId;
    expect(firstId).toBeTruthy();

    // New chat becomes active with the welcome state.
    createConversation();
    const state = loadChatState();
    expect(state.conversations).toHaveLength(2);
    expect(state.activeId).not.toBe(firstId);
    expect(loadStoredMessages()).toEqual([AI_WELCOME]);

    // Switching back restores the first thread.
    expect(setActiveConversation(firstId as string)).toBe(true);
    expect(loadStoredMessages()).toEqual([AI_WELCOME, ...sample]);
    expect(setActiveConversation("missing")).toBe(false);

    // Deleting the active conversation falls back to the remaining one.
    expect(deleteConversation(state.activeId as string)).toBe(true);
    expect(loadChatState().activeId).toBe(firstId);
    expect(loadStoredMessages()).toEqual([AI_WELCOME, ...sample]);

    // Deleting the last conversation creates a fresh one.
    expect(deleteConversation(firstId as string)).toBe(true);
    expect(loadChatState().conversations).toHaveLength(1);
    expect(loadStoredMessages()).toEqual([AI_WELCOME]);
    expect(deleteConversation("missing")).toBe(false);
  });

  it("titles conversations from the first user message", () => {
    expect(conversationTitleFromMessages([])).toBe("New chat");
    expect(conversationTitleFromMessages([AI_WELCOME])).toBe("New chat");
    expect(
      conversationTitleFromMessages([
        AI_WELCOME,
        { id: "u1", role: "user", content: "  suggest   keywords  " },
      ]),
    ).toBe("suggest keywords");

    const long = "x".repeat(60);
    expect(
      conversationTitleFromMessages([
        { id: "u1", role: "user", content: long },
      ]),
    ).toBe(`${"x".repeat(48)}…`);
  });

  it("caps the conversation list and sorts by recency", () => {
    const conversations = Array.from({ length: 55 }, (_, i) =>
      conversation(
        `c${i}`,
        sample,
        `2026-01-01T00:00:${String(i).padStart(2, "0")}.000Z`,
      ),
    );
    const storage = makeStorage();
    seedStore(storage, conversations, "c54");
    const state = loadChatState();
    expect(state.conversations).toHaveLength(50);
    expect(state.conversations[0]?.id).toBe("c54"); // most recent first
    expect(state.activeId).toBe("c54");
  });

  it("falls back to a fresh conversation on a corrupt store", () => {
    const storage = makeStorage({ [AI_CONVERSATIONS_KEY]: "{bad" });
    vi.stubGlobal("window", { localStorage: storage });
    expect(loadChatState().conversations).toHaveLength(1);
    expect(loadStoredMessages()).toEqual([AI_WELCOME]);
    // The corrupt key is replaced with a valid store.
    expect(
      JSON.parse(storage.getItem(AI_CONVERSATIONS_KEY) ?? "null"),
    ).toMatchObject({ version: 1 });
  });

  it("drops malformed conversations during sanitizing", () => {
    const storage = makeStorage();
    seedStore(storage, [
      conversation("c1"),
      { id: "c2" } as unknown as AiChatStore["conversations"][number],
      { ...conversation("c3", []), id: "c3" },
    ]);
    const state = loadChatState();
    expect(state.conversations.map((c) => c.id)).toEqual(["c1"]);
    expect(state.activeId).toBe("c1");
  });

  it("repairs a dangling active id to the most recent conversation", () => {
    const storage = makeStorage();
    seedStore(storage, [
      conversation("old", sample, "2026-01-01T00:00:00.000Z"),
      conversation("newer", sample, "2026-02-01T00:00:00.000Z"),
    ], "ghost");
    const state = loadChatState();
    expect(state.activeId).toBe("newer");
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
    ).rejects.toThrow(/assistant limit/u);
  });

  it("applies a plan-aware daily cap and allows unlimited plans", async () => {
    const storage = makeStorage();
    vi.stubGlobal("window", { localStorage: storage });
    writeClientDayCount(5);
    await expect(
      requestAssistantReply({
        message: "suggest keywords",
        history: [],
        context: null,
        maxPerDay: 5,
      }),
    ).rejects.toThrow(/assistant limit/u);

    // An unlimited (null) cap skips the client-side pre-check entirely.
    const fetchImpl = vi.fn(async () => Response.json({ message: "hi" }, { status: 200 }));
    vi.stubGlobal("fetch", fetchImpl);
    await expect(
      requestAssistantReply({
        message: "suggest keywords",
        history: [],
        context: null,
        maxPerDay: null,
      }),
    ).resolves.toMatchObject({ message: "hi" });
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
      vi.fn(async () => Response.json({}, { status: 401 })),
    );
    await expect(
      requestAssistantReply({ message: "suggest", history: [], context: null }),
    ).rejects.toThrow(/Sign in to use the ASO assistant/u);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ message: "   " }, { status: 200 })),
    );
    await expect(
      requestAssistantReply({ message: "suggest", history: [], context: null }),
    ).rejects.toThrow(/Empty assistant response/u);
  });
});

// Helper: load messages from a seeded store without extra stubbing.
function loadStoredMessagesFrom(
  storage: ReturnType<typeof makeStorage>,
  raw: unknown[],
): UiMessage[] {
  seedStore(storage, [conversation("c1", raw as UiMessage[])]);
  return loadStoredMessages();
}

describe("requestAssistantReply failure bodies", () => {
  const stubFetch = (impl: typeof fetch) => {
    vi.stubGlobal("fetch", impl);
  };
  afterEach(() => vi.unstubAllGlobals());

  it("maps a network rejection to a clean connection error", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(
      requestAssistantReply({ message: "hi", history: [], context: null }),
    ).rejects.toThrow(/Could not reach the assistant/i);
  });

  it("maps a non-JSON 500 body to a clean error, not a parse error", async () => {
    stubFetch(async () => new Response("<html>Bad Gateway</html>", { status: 500 }));
    await expect(
      requestAssistantReply({ message: "hi", history: [], context: null }),
    ).rejects.toThrow("Assistant request failed. Try again in a moment.");
  });

  it("maps a non-JSON 429 body to the rate-limit message", async () => {
    stubFetch(async () => new Response("<html>rate</html>", { status: 429 }));
    await expect(
      requestAssistantReply({ message: "hi", history: [], context: null }),
    ).rejects.toThrow(/Rate limit reached/i);
  });

  it("surfaces the server error field when present", async () => {
    stubFetch(
      async () =>
        new Response(JSON.stringify({ error: "Upstream down" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }),
    );
    await expect(
      requestAssistantReply({ message: "hi", history: [], context: null }),
    ).rejects.toThrow("Upstream down");
  });

  it("returns the message on a valid response", async () => {
    stubFetch(
      async () =>
        new Response(JSON.stringify({ message: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    await expect(
      requestAssistantReply({ message: "hi", history: [], context: null }),
    ).resolves.toMatchObject({ message: "ok" });
  });
});

describe("long CJK history", () => {
  it("caps a 100-message CJK thread to the trailing 80 and titles it", () => {
    const cjk = Array.from({ length: 100 }, (_, i) => ({
      id: `cjk-${i}`,
      role: "user" as const,
      content: `キーワード提案その${i + 1} —— 瞑想・習慣トラッカー`,
    }));
    const store = makeStorage({
      "appclimb:ai:conversations:v1": JSON.stringify({
        version: 1,
        activeId: "c1",
        conversations: [
          {
            id: "c1",
            title: "旧いチャット",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
            messages: cjk,
          },
        ],
      }),
    });
    vi.stubGlobal("window", { localStorage: store });
    const loaded = loadAiChatStore();
    const conv = loaded.conversations[0];
    expect(conv.messages).toHaveLength(80);
    // The trailing 80 survive: first is message #21, last is #100.
    expect(conv.messages[0].id).toBe("cjk-20");
    expect(conv.messages[79].id).toBe("cjk-99");
    // CJK content renders intact through the sanitizer.
    expect(conv.messages[0].content).toContain("キーワード提案その21");
    // Saving again keeps the cap and derives a CJK title.
    saveStoredMessages(cjk);
    const state = loadChatState();
    expect(state.conversations[0].title).toContain("キーワード");
  });
});

describe("streamed replies", () => {
  const ndjson = (events: unknown[]) =>
    new Response(events.map((event) => JSON.stringify(event)).join("\n"), {
      status: 200,
      headers: { "Content-Type": "application/x-ndjson" },
    });
  const card = {
    tool: "lookup_keywords",
    title: "Apple popularity",
    country: "US",
    week: "2026-09-20",
    rows: [{ term: "habit tracker", popularity: 61 }],
  };

  it("forwards events and resolves with the final reply", async () => {
    vi.stubGlobal("window", { localStorage: makeStorage() });
    const fetchImpl = vi.fn(async () =>
      ndjson([
        { type: "meta", model: "m", remainingDay: 3 },
        { type: "status", text: "Thinking" },
        { type: "card", card },
        { type: "delta", text: "Hi" },
        { type: "done", message: "Hi there", followups: ["Next?"] },
      ]),
    );
    vi.stubGlobal("fetch", fetchImpl);
    const seen: string[] = [];
    const result = await requestAssistantReply({
      message: "hello",
      history: [],
      context: null,
      onEvent: (event) => seen.push(event.type),
    });
    expect(seen).toEqual(["meta", "status", "card", "delta", "done"]);
    expect(result).toEqual({
      message: "Hi there",
      followups: ["Next?"],
      cards: [card],
      remainingDay: 3,
      remainingHour: undefined,
    });
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.stream).toBe(true);
    expect(readClientDayCount().count).toBe(1);
  });

  it("surfaces an error event and a cut-off stream", async () => {
    vi.stubGlobal("window", { localStorage: makeStorage() });
    vi.stubGlobal("fetch", vi.fn(async () => ndjson([{ type: "error", error: "Model down" }])));
    await expect(
      requestAssistantReply({ message: "hello", history: [], context: null, onEvent: () => undefined }),
    ).rejects.toThrow("Model down");
    vi.stubGlobal("fetch", vi.fn(async () => ndjson([{ type: "delta", text: "half" }])));
    await expect(
      requestAssistantReply({ message: "hello", history: [], context: null, onEvent: () => undefined }),
    ).rejects.toThrow(/cut off/);
    expect(readClientDayCount().count).toBe(0);
  });

  it("reports a user stop as ReplyStoppedError", async () => {
    vi.stubGlobal("window", { localStorage: makeStorage() });
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        controller.abort();
        throw new DOMException("aborted", "AbortError");
      }),
    );
    await expect(
      requestAssistantReply({
        message: "hello",
        history: [],
        context: null,
        signal: controller.signal,
        onEvent: () => undefined,
      }),
    ).rejects.toBeInstanceOf(ReplyStoppedError);
  });

  it("keeps cards and follow-ups on stored assistant messages", () => {
    const storage = makeStorage();
    seedStore(storage, [
      conversation("c1", [
        { id: "u", role: "user", content: "q" },
        {
          id: "a",
          role: "assistant",
          content: "answer",
          cards: [card, { tool: "bogus", title: "x", rows: [] }],
          followups: ["One", 7, "Two", "Three", "Four"],
          stopped: true,
        } as unknown as UiMessage,
      ]),
    ]);
    const stored = loadStoredMessages();
    const reply = stored.find((message) => message.id === "a");
    expect(reply?.cards).toEqual([card]);
    expect(reply?.followups).toEqual(["One", "Two", "Three"]);
    expect(reply?.stopped).toBe(true);
  });
});

describe("assistant context choice", () => {
  const today = new Date();
  const day = (offset: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const tracker = {
    activeAppKey: "1:US",
    apps: [
      { appStoreId: "1", name: "First", country: "US", description: "About first" },
      { appStoreId: "2", name: "Second", country: "DE" },
    ],
    keywords: {
      "1:US:car dealer": {
        appStoreId: "1",
        country: "US",
        keyword: "car dealer",
        currentMetrics: { popularity: 61, position: 94 },
      },
      "2:DE:auto": { appStoreId: "2", country: "DE", keyword: "auto", currentMetrics: null },
    },
    snapshots: {
      "1:US:car dealer": [
        { date: day(-40), position: 150 },
        { date: day(-20), position: null },
        { date: day(0), position: 94 },
      ],
    },
  };

  it("lists apps, resolves the choice, and adds 30-day movement", () => {
    vi.stubGlobal("window", {
      localStorage: makeStorage({ "appclimb:tracker:v1": JSON.stringify(tracker) }),
    });
    const apps = listTrackedApps();
    expect(apps).toEqual([
      { key: "1:US", name: "First", country: "US", iconUrl: undefined, keywordCount: 1 },
      { key: "2:DE", name: "Second", country: "DE", iconUrl: undefined, keywordCount: 1 },
    ]);
    expect(resolveContextKey("auto", apps)).toBe("1:US");
    expect(resolveContextKey("2:DE", apps)).toBe("2:DE");
    expect(resolveContextKey("9:XX", apps)).toBe("1:US");
    expect(resolveContextKey("none", apps)).toBeNull();
    expect(resolveContextKey("auto", [])).toBeNull();

    const context = loadTrackerContext("1:US");
    expect(context?.description).toBe("About first");
    // The 40-day-old check is outside the window; the first inside it was >200.
    expect(context?.keywords?.[0]).toMatchObject({ position: 94, previousPosition: ">200" });
    expect(loadTrackerContext("2:DE")?.appName).toBe("Second");
    expect(loadTrackerContext(null)).toBeNull();
  });

  it("remembers the choice", () => {
    vi.stubGlobal("window", { localStorage: makeStorage() });
    expect(readContextChoice()).toBe("auto");
    writeContextChoice("none");
    expect(readContextChoice()).toBe("none");
  });
});
