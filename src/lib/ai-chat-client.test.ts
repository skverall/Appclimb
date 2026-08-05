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
  loadChatState,
  loadStoredMessages,
  loadTrackerContext,
  readClientDayCount,
  requestAssistantReply,
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

// Helper: load messages from a seeded store without extra stubbing.
function loadStoredMessagesFrom(
  storage: ReturnType<typeof makeStorage>,
  raw: unknown[],
): UiMessage[] {
  seedStore(storage, [conversation("c1", raw as UiMessage[])]);
  return loadStoredMessages();
}
