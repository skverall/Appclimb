import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildMagicLinkEmail, readResendCredentials, sendEmail } from "@/lib/email";

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

describe("readResendCredentials", () => {
  const original = process.env.RESEND_API_KEY;
  const originalFrom = process.env.RESEND_FROM;

  afterEach(() => {
    if (original === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = original;
    if (originalFrom === undefined) delete process.env.RESEND_FROM;
    else process.env.RESEND_FROM = originalFrom;
  });

  it("returns null without an api key", () => {
    delete process.env.RESEND_API_KEY;
    expect(readResendCredentials()).toBeNull();
    process.env.RESEND_API_KEY = "   ";
    expect(readResendCredentials()).toBeNull();
  });

  it("returns key and default from", () => {
    process.env.RESEND_API_KEY = "re_123";
    delete process.env.RESEND_FROM;
    const creds = readResendCredentials();
    expect(creds?.apiKey).toBe("re_123");
    expect(creds?.from).toContain("appclimb.app");
  });

  it("honors a custom from address", () => {
    process.env.RESEND_API_KEY = "re_123";
    process.env.RESEND_FROM = "AppClimb <hi@example.com>";
    expect(readResendCredentials()?.from).toBe("AppClimb <hi@example.com>");
  });
});

describe("buildMagicLinkEmail", () => {
  it("embeds the link in text and html", () => {
    const url = "https://appclimb.app/api/auth/verify?token=abc";
    const email = buildMagicLinkEmail(url);
    expect(email.subject).toBe("Sign in to AppClimb");
    expect(email.text).toContain(url);
    expect(email.html).toContain(url);
    expect(email.html).toContain("Sign in to AppClimb");
  });

  it("mentions the ttl", () => {
    const email = buildMagicLinkEmail("https://x", 30);
    expect(email.text).toContain("30 minutes");
  });
});

describe("sendEmail", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const creds = { apiKey: "re_123", from: "AppClimb <no-reply@appclimb.app>" };
  const input = { to: "a@b.com", subject: "s", text: "t", html: "<p>h</p>" };

  it("posts to Resend and returns ok", async () => {
    const fetchMock = vi.fn<FetchFn>(async () => new Response(JSON.stringify({ id: "e1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendEmail(creds, input);
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("resend.com");
    const body = JSON.parse(String(init?.body));
    expect(body.to).toEqual(["a@b.com"]);
    expect(body.html).toBe("<p>h</p>");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer re_123");
  });

  it("omits html when not provided", async () => {
    const fetchMock = vi.fn<FetchFn>(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendEmail(creds, { to: "a@b.com", subject: "s", text: "t" });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.html).toBeUndefined();
  });

  it("returns an error on a failed response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<FetchFn>(async () => new Response(JSON.stringify({ message: "bad key" }), { status: 401 })),
    );
    const result = await sendEmail(creds, input);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toBe("bad key");
  });

  it("handles non-json error bodies", async () => {
    vi.stubGlobal("fetch", vi.fn<FetchFn>(async () => new Response("oops", { status: 500 })));
    const result = await sendEmail(creds, input);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("500");
  });

  it("handles network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<FetchFn>(async () => {
        throw new Error("offline");
      }),
    );
    const result = await sendEmail(creds, input);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(502);
    expect(result.error).toBe("offline");
  });
});
