import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACCESS_TOKEN_TTL_MS,
  AGENT_SCOPE,
  AUTH_CODE_TTL_MS,
  AUTH_REQUEST_TTL_MS,
  MAX_API_KEYS,
  REFRESH_TOKEN_TTL_MS,
  approveAuthorizationRequest,
  authorizationServerMetadata,
  canonicalResource,
  clientDisplayName,
  clientRedirect,
  createApiKey,
  denyAuthorizationRequest,
  exchangeAuthorizationCode,
  getAuthorizationRequest,
  isAllowedRedirectUri,
  isMetadataDocumentClientId,
  isValidCodeChallenge,
  listAgentGrants,
  mcpResourceUrl,
  pkceChallenge,
  protectedResourceMetadata,
  redirectUriMatches,
  refreshAccessToken,
  registerClient,
  resolveClient,
  revokeAgentGrant,
  revokeAgentToken,
  saveAuthorizationRequest,
  verifyAgentToken,
  type OAuthClient,
  type TokenResponse,
} from "@/lib/agent-auth";
import { hashToken } from "@/lib/auth";
import { createTestDb, type FakeD1 } from "../../tests/helpers/fake-d1";
import { loadAllMigrationsSql } from "../../tests/helpers/migration";

const ORIGIN = "https://appclimb.app";
const RESOURCE = mcpResourceUrl(ORIGIN);
const CALLBACK = "https://claude.ai/api/mcp/auth_callback";
// RFC 7636 appendix B test vector.
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const START = new Date("2026-11-03T12:00:00.000Z");
const MIGRATIONS = loadAllMigrationsSql();

let db: FakeD1;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: START });
  db = await createTestDb(MIGRATIONS);
  for (const id of ["user-1", "user-2"]) {
    await db.prepare("INSERT INTO users (id, email) VALUES (?, ?)").bind(id, `${id}@example.com`).run();
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  db.close();
});

/** Move the clock forward. */
function tick(ms: number): void {
  vi.setSystemTime(Date.now() + ms);
}

async function register(name: string | null = "Claude", uris: string[] = [CALLBACK]): Promise<OAuthClient> {
  const result = await registerClient(db, { client_name: name ?? undefined, redirect_uris: uris });
  if (!result.ok) throw new Error(result.description);
  return result.client;
}

async function authorize(client: OAuthClient, userId = "user-1", state: string | null = "state-123"): Promise<string> {
  const id = await saveAuthorizationRequest(db, {
    clientId: client.clientId,
    redirectUri: client.redirectUris[0],
    state,
    codeChallenge: CHALLENGE,
    scope: AGENT_SCOPE,
    resource: RESOURCE,
  });
  const request = await getAuthorizationRequest(db, id);
  if (!request) throw new Error("request missing");
  const redirect = await approveAuthorizationRequest(db, request, userId, ORIGIN);
  if (!redirect) throw new Error("approve failed");
  return new URL(redirect).searchParams.get("code") ?? "";
}

function exchangeInput(client: OAuthClient, code: string) {
  return { code, clientId: client.clientId, redirectUri: client.redirectUris[0], codeVerifier: VERIFIER, resource: RESOURCE };
}

async function connect(client: OAuthClient, userId = "user-1"): Promise<TokenResponse> {
  const code = await authorize(client, userId);
  const result = await exchangeAuthorizationCode(db, exchangeInput(client, code));
  if (!result.ok) throw new Error(result.description);
  return result.tokens;
}

async function tokenRow(id: string) {
  return db.prepare("SELECT * FROM agent_tokens WHERE id = ?").bind(id).first<Record<string, unknown>>();
}

describe("discovery metadata", () => {
  it("binds tokens to the /mcp resource and advertises this server", () => {
    expect(RESOURCE).toBe("https://appclimb.app/mcp");
    expect(protectedResourceMetadata(ORIGIN)).toEqual({
      resource: RESOURCE,
      authorization_servers: [ORIGIN],
      scopes_supported: [AGENT_SCOPE],
      bearer_methods_supported: ["header"],
      resource_name: "AppClimb",
      resource_documentation: `${ORIGIN}/connect`,
    });
  });

  it("describes a PKCE-only public-client authorization server", () => {
    const metadata = authorizationServerMetadata(ORIGIN);
    expect(metadata).toMatchObject({
      issuer: ORIGIN,
      authorization_endpoint: `${ORIGIN}/oauth/authorize`,
      token_endpoint: `${ORIGIN}/oauth/token`,
      registration_endpoint: `${ORIGIN}/oauth/register`,
      revocation_endpoint: `${ORIGIN}/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: [AGENT_SCOPE],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    });
  });
});

describe("redirect URI rules", () => {
  it("accepts https, loopback http and private-use schemes", () => {
    expect(isAllowedRedirectUri(CALLBACK)).toBe(true);
    expect(isAllowedRedirectUri("http://localhost:6274/oauth/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://127.0.0.1/cb")).toBe(true);
    expect(isAllowedRedirectUri("http://[::1]:3000/cb")).toBe(true);
    expect(isAllowedRedirectUri("cursor://anysphere.cursor-retrieval/oauth/user-appclimb/callback")).toBe(true);
    expect(isAllowedRedirectUri("com.example.app:/oauth2redirect")).toBe(true);
  });

  it("rejects junk, fragments, credentials, remote http and dangerous schemes", () => {
    expect(isAllowedRedirectUri(42)).toBe(false);
    expect(isAllowedRedirectUri(null)).toBe(false);
    expect(isAllowedRedirectUri("")).toBe(false);
    expect(isAllowedRedirectUri(`https://a.example/${"a".repeat(512)}`)).toBe(false);
    expect(isAllowedRedirectUri("not a url")).toBe(false);
    expect(isAllowedRedirectUri("https://claude.ai/cb#frag")).toBe(false);
    expect(isAllowedRedirectUri("https://user:pw@claude.ai/cb")).toBe(false);
    expect(isAllowedRedirectUri("https://user@claude.ai/cb")).toBe(false);
    expect(isAllowedRedirectUri("http://example.com/cb")).toBe(false);
    expect(isAllowedRedirectUri("http://localhost.evil.com/cb")).toBe(false);
    for (const uri of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "file:///etc/passwd",
      "vbscript:msgbox",
      "about:blank",
      "blob:https://a.example/x",
      "ftp://a.example/cb",
      "ws://localhost/cb",
      "wss://a.example/cb",
    ]) {
      expect(isAllowedRedirectUri(uri), uri).toBe(false);
    }
  });

  it("matches exactly, except that a loopback redirect may change port", () => {
    expect(redirectUriMatches([CALLBACK], CALLBACK)).toBe(true);
    expect(redirectUriMatches([CALLBACK], `${CALLBACK}2`)).toBe(false);
    expect(redirectUriMatches(["https://a.example/cb"], "https://a.example:8443/cb")).toBe(false);

    const cli = ["http://localhost:3000/callback"];
    expect(redirectUriMatches(cli, "http://localhost:51234/callback")).toBe(true);
    expect(redirectUriMatches(cli, "http://127.0.0.1:51234/callback")).toBe(false);
    expect(redirectUriMatches(cli, "http://localhost:51234/other")).toBe(false);
    expect(redirectUriMatches(cli, "http://localhost:3000/callback?x=1")).toBe(false);
    expect(redirectUriMatches(["http://127.0.0.1/cb?mode=cli"], "http://127.0.0.1:9999/cb?mode=cli")).toBe(true);
  });

  it("ignores unparsable or non-loopback registrations for the any-port rule", () => {
    expect(redirectUriMatches(["not a url", CALLBACK], "http://localhost:1/cb")).toBe(false);
    expect(redirectUriMatches(["https://localhost/cb"], "http://localhost:5/cb")).toBe(false);
    expect(redirectUriMatches(["http://localhost/cb"], "garbage")).toBe(false);
  });
});

describe("dynamic client registration", () => {
  it("registers a public client with a cleaned name and deduplicated URIs", async () => {
    const result = await registerClient(db, {
      client_name: "Claude\u0000\n Desktop  ",
      redirect_uris: [CALLBACK, CALLBACK, "http://localhost:3000/cb"],
      grant_types: ["authorization_code", "refresh_token"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.client.clientId).toMatch(/^acc_[A-Za-z0-9_-]+$/u);
    expect(result.client).toMatchObject({
      clientName: "Claude Desktop",
      redirectUris: [CALLBACK, "http://localhost:3000/cb"],
    });
    expect(result.response).toEqual({
      client_id: result.client.clientId,
      client_id_issued_at: Math.floor(START.getTime() / 1000),
      client_name: "Claude Desktop",
      redirect_uris: [CALLBACK, "http://localhost:3000/cb"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: AGENT_SCOPE,
    });
    const row = await db
      .prepare("SELECT * FROM oauth_clients WHERE client_id = ?")
      .bind(result.client.clientId)
      .first<{ redirect_uris: string; metadata_url: number }>();
    expect(JSON.parse(row?.redirect_uris ?? "null")).toEqual([CALLBACK, "http://localhost:3000/cb"]);
    expect(row?.metadata_url).toBe(0);
  });

  it("leaves the name out when none usable is given", async () => {
    for (const name of [undefined, 42, "  \u0007 "]) {
      const result = await registerClient(db, { client_name: name, redirect_uris: [CALLBACK] });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.client.clientName).toBeNull();
      expect(result.response.client_name).toBeUndefined();
    }
    const long = await registerClient(db, { client_name: "x".repeat(200), redirect_uris: [CALLBACK] });
    expect(long.ok && long.client.clientName).toBe("x".repeat(80));
  });

  it("rejects missing or unsafe redirect URIs", async () => {
    const tooMany = Array.from({ length: 11 }, (_, index) => `https://a.example/cb${index}`);
    for (const body of [
      null,
      "redirect_uris",
      {},
      { redirect_uris: "https://a.example/cb" },
      { redirect_uris: [] },
      { redirect_uris: tooMany },
      { redirect_uris: [CALLBACK, "http://example.com/cb"] },
    ]) {
      expect(await registerClient(db, body)).toEqual({
        ok: false,
        error: "invalid_redirect_uri",
        description: expect.stringContaining("redirect_uris"),
      });
    }
    const { results } = await db.prepare("SELECT * FROM oauth_clients").all();
    expect(results).toHaveLength(0);
  });

  it("rejects clients that do not use the authorization_code grant", async () => {
    expect(
      await registerClient(db, { redirect_uris: [CALLBACK], grant_types: ["client_credentials"] }),
    ).toMatchObject({ ok: false, error: "invalid_client_metadata" });
    expect(await registerClient(db, { redirect_uris: [CALLBACK], grant_types: "implicit" })).toMatchObject({ ok: true });
  });
});

describe("resolveClient", () => {
  const DOC_ID = "https://client.example.com/oauth/client.json";
  const doc = (overrides: Record<string, unknown> = {}) => ({
    client_id: DOC_ID,
    client_name: "Doc Client",
    redirect_uris: ["https://client.example.com/cb"],
    ...overrides,
  });
  const serve = (body: unknown, init: ResponseInit = {}) =>
    vi.fn<typeof fetch>(
      async () => new Response(body === null || typeof body === "string" ? body : JSON.stringify(body), init),
    );

  it("tells metadata-document client ids from registered ones", () => {
    expect(isMetadataDocumentClientId(DOC_ID)).toBe(true);
    expect(isMetadataDocumentClientId("https://client.example.com/")).toBe(false);
    expect(isMetadataDocumentClientId("http://client.example.com/c.json")).toBe(false);
    expect(isMetadataDocumentClientId(`${DOC_ID}#x`)).toBe(false);
    expect(isMetadataDocumentClientId("acc_abc")).toBe(false);
  });

  it("finds registered clients and nothing else", async () => {
    const client = await register();
    expect(await resolveClient(db, client.clientId)).toEqual(client);
    expect(await resolveClient(db, "acc_missing")).toBeNull();
    expect(await resolveClient(db, "")).toBeNull();
    expect(await resolveClient(db, `acc_${"x".repeat(520)}`)).toBeNull();
    const fetchImpl = vi.fn<typeof fetch>();
    expect(await resolveClient(db, "http://client.example.com/c.json", fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("tolerates corrupt stored redirect URIs", async () => {
    const insert = (id: string, uris: string) =>
      db.prepare("INSERT INTO oauth_clients (client_id, client_name, redirect_uris) VALUES (?, NULL, ?)").bind(id, uris).run();
    await insert("acc_bad", "not json");
    await insert("acc_obj", '{"a":1}');
    await insert("acc_mixed", '["https://a.example/cb", 5]');
    expect(await resolveClient(db, "acc_bad")).toEqual({ clientId: "acc_bad", clientName: null, redirectUris: [] });
    expect((await resolveClient(db, "acc_obj"))?.redirectUris).toEqual([]);
    expect((await resolveClient(db, "acc_mixed"))?.redirectUris).toEqual(["https://a.example/cb"]);
  });

  it("fetches a Client ID Metadata Document and caches it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchImpl = serve(doc());
    const client = await resolveClient(db, DOC_ID, fetchImpl);
    expect(client).toEqual({ clientId: DOC_ID, clientName: "Doc Client", redirectUris: ["https://client.example.com/cb"] });
    expect(fetchImpl).toHaveBeenCalledWith(
      DOC_ID,
      expect.objectContaining({ headers: { accept: "application/json" }, redirect: "manual", signal: expect.any(AbortSignal) }),
    );
    const row = await db
      .prepare("SELECT client_name, metadata_url FROM oauth_clients WHERE client_id = ?")
      .bind(DOC_ID)
      .first();
    expect(row).toEqual({ client_name: "Doc Client", metadata_url: 1 });

    // A fresh read refreshes the cached copy.
    await resolveClient(db, DOC_ID, serve(doc({ client_name: "Renamed" })));
    expect(await clientDisplayName(db, DOC_ID)).toBe("Renamed");

    // When the client's host is down, the cached copy still works.
    const down = vi.fn<typeof fetch>(async () => Promise.reject(new TypeError("fetch failed")));
    expect(await resolveClient(db, DOC_ID, down)).toEqual({
      clientId: DOC_ID,
      clientName: "Renamed",
      redirectUris: ["https://client.example.com/cb"],
    });
    expect(await resolveClient(db, DOC_ID, serve("oops", { status: 500 }))).toMatchObject({ clientName: "Renamed" });
    expect(warn).toHaveBeenCalledWith("[agent-auth] client metadata document failed:", DOC_ID, "fetch failed");
    expect(warn).toHaveBeenCalledWith("[agent-auth] client metadata document unavailable:", DOC_ID, 500);
  });

  it("rejects documents that do not describe the client safely", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cases: Array<ReturnType<typeof serve>> = [
      serve(doc({ client_id: "https://other.example.com/client.json" })),
      // Redirects are not followed ("manual"), so they are simply not ok.
      serve(null, { status: 302, headers: { location: "https://evil.example/client.json" } }),
      vi.fn<typeof fetch>(async () => Promise.reject("socket hang up")),
      serve(doc({ client_name: "x".repeat(10_001) })),
      serve(doc(), { status: 404 }),
      serve("not json"),
      serve(doc({ redirect_uris: undefined })),
      serve(doc({ redirect_uris: ["http://client.example.com/cb"] })),
      serve(doc({ redirect_uris: Array.from({ length: 11 }, (_, index) => `https://client.example.com/cb${index}`) })),
    ];
    for (const fetchImpl of cases) {
      expect(await resolveClient(db, DOC_ID, fetchImpl)).toBeNull();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
    const { results } = await db.prepare("SELECT * FROM oauth_clients").all();
    expect(results).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith("[agent-auth] client metadata document unavailable:", DOC_ID, 302);
    expect(warn).toHaveBeenCalledWith("[agent-auth] client metadata document failed:", DOC_ID, "socket hang up");
  });

  it("shows the stored name on the consent page", async () => {
    const named = await register("Cursor");
    const unnamed = await register(null);
    expect(await clientDisplayName(db, named.clientId)).toBe("Cursor");
    expect(await clientDisplayName(db, unnamed.clientId)).toBeNull();
    expect(await clientDisplayName(db, "acc_missing")).toBeNull();
  });
});

describe("request parameters", () => {
  it("canonicalizes the resource indicator", () => {
    expect(canonicalResource(null, ORIGIN)).toBe(RESOURCE);
    expect(canonicalResource(undefined, ORIGIN)).toBe(RESOURCE);
    expect(canonicalResource("", ORIGIN)).toBe(RESOURCE);
    expect(canonicalResource(RESOURCE, ORIGIN)).toBe(RESOURCE);
    expect(canonicalResource(" https://appclimb.app/mcp/ ", ORIGIN)).toBe(RESOURCE);
    expect(canonicalResource("HTTPS://AppClimb.app/mcp/", ORIGIN)).toBe(RESOURCE);
    expect(canonicalResource(ORIGIN, ORIGIN)).toBe(RESOURCE);
    expect(canonicalResource(`${ORIGIN}/`, ORIGIN)).toBe(RESOURCE);
    expect(canonicalResource("https://evil.example/mcp", ORIGIN)).toBeNull();
    expect(canonicalResource(`${RESOURCE}/other`, ORIGIN)).toBeNull();
  });

  it("validates PKCE S256 challenges", () => {
    expect(pkceChallenge(VERIFIER)).toBe(CHALLENGE);
    expect(isValidCodeChallenge(CHALLENGE)).toBe(true);
    expect(isValidCodeChallenge(CHALLENGE.slice(1))).toBe(false);
    expect(isValidCodeChallenge(`${CHALLENGE.slice(1)}=`)).toBe(false);
    expect(isValidCodeChallenge(42)).toBe(false);
  });

  it("builds client redirects with params, state and iss", () => {
    const withQuery = new URL(clientRedirect({ redirectUri: "https://a.example/cb?x=1", state: "s1" }, { code: "c" }, ORIGIN));
    expect(Object.fromEntries(withQuery.searchParams)).toEqual({ x: "1", code: "c", state: "s1", iss: ORIGIN });
    const noState = new URL(clientRedirect({ redirectUri: "cursor://anysphere/cb", state: null }, { error: "e" }, ORIGIN));
    expect(noState.searchParams.has("state")).toBe(false);
    expect(noState.searchParams.get("iss")).toBe(ORIGIN);
    expect(noState.protocol).toBe("cursor:");
  });
});

describe("authorization requests", () => {
  const input = (overrides: Partial<Parameters<typeof saveAuthorizationRequest>[1]> = {}) => ({
    clientId: "acc_1",
    redirectUri: CALLBACK,
    state: "s",
    codeChallenge: CHALLENGE,
    scope: AGENT_SCOPE,
    resource: RESOURCE,
    ...overrides,
  });

  it("saves and reads a pending request until it expires", async () => {
    const id = await saveAuthorizationRequest(db, input());
    expect(await getAuthorizationRequest(db, id)).toEqual({ id, ...input() });
    tick(AUTH_REQUEST_TTL_MS - 1);
    expect(await getAuthorizationRequest(db, id)).not.toBeNull();
    tick(1);
    expect(await getAuthorizationRequest(db, id)).toBeNull();
  });

  it("returns null for unknown or malformed ids", async () => {
    expect(await getAuthorizationRequest(db, "")).toBeNull();
    expect(await getAuthorizationRequest(db, "x".repeat(65))).toBeNull();
    expect(await getAuthorizationRequest(db, "missing")).toBeNull();
  });

  it("cleans up expired requests when saving a new one", async () => {
    const stale = await saveAuthorizationRequest(db, input());
    tick(AUTH_REQUEST_TTL_MS + 1);
    await saveAuthorizationRequest(db, input({ state: null }));
    const { results } = await db.prepare("SELECT id, state FROM oauth_requests").all<{ id: string; state: string | null }>();
    expect(results).toHaveLength(1);
    expect(results[0].id).not.toBe(stale);
    expect(results[0].state).toBeNull();
  });

  it("approval consumes the request once and stores only the code hash", async () => {
    const client = await register();
    const id = await saveAuthorizationRequest(db, input({ clientId: client.clientId }));
    const request = await getAuthorizationRequest(db, id);
    if (!request) throw new Error("request missing");
    const redirect = await approveAuthorizationRequest(db, request, "user-1", ORIGIN);
    const url = new URL(redirect ?? "");
    expect(`${url.origin}${url.pathname}`).toBe(CALLBACK);
    expect(url.searchParams.get("state")).toBe("s");
    expect(url.searchParams.get("iss")).toBe(ORIGIN);
    const code = url.searchParams.get("code") ?? "";
    expect(code.length).toBeGreaterThan(40);
    const row = await db.prepare("SELECT * FROM oauth_codes WHERE code_hash = ?").bind(hashToken(code)).first();
    expect(row).toMatchObject({
      client_id: client.clientId,
      user_id: "user-1",
      redirect_uri: CALLBACK,
      used_at: null,
      expires_at: new Date(START.getTime() + AUTH_CODE_TTL_MS).toISOString(),
    });
    expect(await getAuthorizationRequest(db, id)).toBeNull();
    expect(await approveAuthorizationRequest(db, request, "user-1", ORIGIN)).toBeNull();
  });

  it("denial deletes the request and tells the client", async () => {
    const id = await saveAuthorizationRequest(db, input());
    const request = await getAuthorizationRequest(db, id);
    if (!request) throw new Error("request missing");
    const url = new URL(await denyAuthorizationRequest(db, request, ORIGIN));
    expect(Object.fromEntries(url.searchParams)).toEqual({
      error: "access_denied",
      error_description: "The user declined access.",
      state: "s",
      iss: ORIGIN,
    });
    expect(await getAuthorizationRequest(db, id)).toBeNull();
  });
});

describe("exchangeAuthorizationCode", () => {
  it("issues a bearer access token and a refresh token", async () => {
    const client = await register();
    const code = await authorize(client);
    const result = await exchangeAuthorizationCode(db, exchangeInput(client, code));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tokens).toMatchObject({
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_MS / 1000,
      scope: AGENT_SCOPE,
    });
    expect(result.tokens.access_token).toMatch(/^aca_/u);
    expect(result.tokens.refresh_token).toMatch(/^acr_/u);
    expect(await verifyAgentToken(db, result.tokens.access_token, RESOURCE)).toMatchObject({
      userId: "user-1",
      kind: "oauth",
      clientId: client.clientId,
    });
    const clientRow = await db
      .prepare("SELECT last_used_at FROM oauth_clients WHERE client_id = ?")
      .bind(client.clientId)
      .first<{ last_used_at: string }>();
    expect(clientRow?.last_used_at).toBe(START.toISOString());
  });

  it("skips the redirect and resource checks when they are not sent", async () => {
    const client = await register();
    const code = await authorize(client);
    const result = await exchangeAuthorizationCode(db, { ...exchangeInput(client, code), redirectUri: "", resource: null });
    expect(result.ok).toBe(true);
  });

  it("requires a code and a verifier", async () => {
    const client = await register();
    for (const input of [exchangeInput(client, ""), { ...exchangeInput(client, "abc"), codeVerifier: "" }]) {
      expect(await exchangeAuthorizationCode(db, input)).toEqual({
        ok: false,
        error: "invalid_grant",
        description: "code and code_verifier are required.",
      });
    }
    expect(await exchangeAuthorizationCode(db, exchangeInput(client, "unknown"))).toMatchObject({
      ok: false,
      description: expect.stringMatching(/invalid or expired/u),
    });
  });

  it("rejects a code sent by another client, to another redirect or resource, or with a bad verifier", async () => {
    const client = await register();
    const code = await authorize(client);
    const base = exchangeInput(client, code);
    expect(await exchangeAuthorizationCode(db, { ...base, clientId: "acc_other" })).toMatchObject({
      error: "invalid_grant",
      description: expect.stringMatching(/another client/u),
    });
    expect(await exchangeAuthorizationCode(db, { ...base, redirectUri: "https://claude.ai/other" })).toMatchObject({
      error: "invalid_grant",
      description: expect.stringMatching(/redirect_uri/u),
    });
    expect(await exchangeAuthorizationCode(db, { ...base, resource: "https://evil.example/mcp" })).toMatchObject({
      error: "invalid_target",
    });
    expect(await exchangeAuthorizationCode(db, { ...base, codeVerifier: `${VERIFIER}x` })).toMatchObject({
      error: "invalid_grant",
      description: "PKCE verification failed.",
    });
    // None of the failures spent the code.
    expect(await exchangeAuthorizationCode(db, base)).toMatchObject({ ok: true });
  });

  it("refuses to reuse a code", async () => {
    const client = await register();
    const code = await authorize(client);
    expect((await exchangeAuthorizationCode(db, exchangeInput(client, code))).ok).toBe(true);
    expect(await exchangeAuthorizationCode(db, exchangeInput(client, code))).toMatchObject({
      ok: false,
      error: "invalid_grant",
      description: expect.stringMatching(/invalid or expired/u),
    });
  });

  it("lets only one of two concurrent exchanges win", async () => {
    const client = await register();
    const code = await authorize(client);
    const input = exchangeInput(client, code);
    const outcomes = await Promise.all([exchangeAuthorizationCode(db, input), exchangeAuthorizationCode(db, input)]);
    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
    expect(outcomes.find((outcome) => !outcome.ok)).toMatchObject({
      error: "invalid_grant",
      description: "The authorization code was already used.",
    });
    const { results } = await db.prepare("SELECT id FROM agent_tokens").all();
    expect(results).toHaveLength(1);
  });

  it("expires codes after five minutes and cleans up old ones", async () => {
    const client = await register();
    const stale = await authorize(client);
    tick(AUTH_CODE_TTL_MS);
    expect(await exchangeAuthorizationCode(db, exchangeInput(client, stale))).toMatchObject({
      ok: false,
      description: expect.stringMatching(/invalid or expired/u),
    });
    const fresh = await authorize(client);
    tick(1);
    expect((await exchangeAuthorizationCode(db, exchangeInput(client, fresh))).ok).toBe(true);
    const { results } = await db.prepare("SELECT code_hash FROM oauth_codes").all<{ code_hash: string }>();
    expect(results.map((row) => row.code_hash)).toEqual([hashToken(fresh)]);
  });
});

describe("refreshAccessToken", () => {
  it("rotates the refresh token and retires the old access token", async () => {
    const client = await register();
    const first = await connect(client);
    tick(1_000);
    const result = await refreshAccessToken(db, { refreshToken: first.refresh_token, clientId: client.clientId });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.tokens.access_token).not.toBe(first.access_token);
    expect(result.tokens.refresh_token).not.toBe(first.refresh_token);
    expect(await verifyAgentToken(db, first.access_token, RESOURCE)).toBeNull();
    expect(await verifyAgentToken(db, result.tokens.access_token, RESOURCE)).toMatchObject({ clientId: client.clientId });
  });

  it("accepts a refresh without client_id", async () => {
    const client = await register();
    const first = await connect(client);
    expect((await refreshAccessToken(db, { refreshToken: first.refresh_token, clientId: "" })).ok).toBe(true);
  });

  it("rejects missing, unknown and other clients' refresh tokens", async () => {
    const client = await register();
    const first = await connect(client);
    expect(await refreshAccessToken(db, { refreshToken: "", clientId: client.clientId })).toMatchObject({
      error: "invalid_grant",
      description: "refresh_token is required.",
    });
    expect(await refreshAccessToken(db, { refreshToken: "acr_unknown", clientId: client.clientId })).toMatchObject({
      description: "The refresh token is invalid.",
    });
    expect(await refreshAccessToken(db, { refreshToken: first.refresh_token, clientId: "acc_other" })).toMatchObject({
      description: "The refresh token belongs to another client.",
    });
    // An API key is not a refresh token.
    const key = await createApiKey(db, "user-1", "CLI", RESOURCE);
    expect(key.ok).toBe(true);
    if (key.ok) {
      expect(await refreshAccessToken(db, { refreshToken: key.key, clientId: "" })).toMatchObject({ ok: false });
    }
    expect(await verifyAgentToken(db, first.access_token, RESOURCE)).not.toBeNull();
  });

  it("revokes the client's whole grant when a spent refresh token comes back", async () => {
    const claude = await register("Claude");
    const cursor = await register("Cursor");
    const first = await connect(claude);
    const second = await refreshAccessToken(db, { refreshToken: first.refresh_token, clientId: claude.clientId });
    if (!second.ok) throw new Error("refresh failed");
    const otherClient = await connect(cursor);
    const otherUser = await connect(claude, "user-2");

    expect(await refreshAccessToken(db, { refreshToken: first.refresh_token, clientId: claude.clientId })).toEqual({
      ok: false,
      error: "invalid_grant",
      description: "The refresh token was already used.",
    });
    expect(await verifyAgentToken(db, second.tokens.access_token, RESOURCE)).toBeNull();
    expect((await refreshAccessToken(db, { refreshToken: second.tokens.refresh_token, clientId: claude.clientId })).ok).toBe(
      false,
    );
    expect(await verifyAgentToken(db, otherClient.access_token, RESOURCE)).not.toBeNull();
    expect(await verifyAgentToken(db, otherUser.access_token, RESOURCE)).not.toBeNull();
  });

  it("lets only one of two concurrent refreshes win", async () => {
    const client = await register();
    const first = await connect(client);
    const input = { refreshToken: first.refresh_token, clientId: client.clientId };
    const outcomes = await Promise.all([refreshAccessToken(db, input), refreshAccessToken(db, input)]);
    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1);
    expect(outcomes.find((outcome) => !outcome.ok)).toMatchObject({ description: "The refresh token was already used." });
    const winner = outcomes.find((outcome) => outcome.ok);
    if (winner?.ok) expect(await verifyAgentToken(db, winner.tokens.access_token, RESOURCE)).not.toBeNull();
  });

  it("expires refresh tokens after 90 days", async () => {
    const client = await register();
    const first = await connect(client);
    tick(REFRESH_TOKEN_TTL_MS);
    expect(await refreshAccessToken(db, { refreshToken: first.refresh_token, clientId: client.clientId })).toMatchObject({
      ok: false,
      description: "The refresh token expired. Connect again.",
    });
  });

  it("treats a grant without a refresh expiry as expired", async () => {
    await db
      .prepare(
        `INSERT INTO agent_tokens (id, kind, user_id, client_id, access_hash, refresh_hash, scope, resource, created_at)
         VALUES ('t1', 'oauth', 'user-1', 'acc_x', ?, ?, ?, ?, ?)`,
      )
      .bind(hashToken("aca_x"), hashToken("acr_x"), AGENT_SCOPE, RESOURCE, START.toISOString())
      .run();
    expect(await refreshAccessToken(db, { refreshToken: "acr_x", clientId: "acc_x" })).toMatchObject({
      description: "The refresh token expired. Connect again.",
    });
  });
});

describe("verifyAgentToken", () => {
  it("returns the principal only for the bound resource while the token is live", async () => {
    const client = await register();
    const tokens = await connect(client);
    const principal = await verifyAgentToken(db, tokens.access_token, RESOURCE);
    expect(principal).toEqual({ userId: "user-1", tokenId: expect.any(String), kind: "oauth", clientId: client.clientId });
    expect(await verifyAgentToken(db, tokens.access_token, "https://other.example/mcp")).toBeNull();
    expect(await verifyAgentToken(db, "", RESOURCE)).toBeNull();
    expect(await verifyAgentToken(db, "x".repeat(201), RESOURCE)).toBeNull();
    expect(await verifyAgentToken(db, "aca_unknown", RESOURCE)).toBeNull();
    tick(ACCESS_TOKEN_TTL_MS - 1);
    expect(await verifyAgentToken(db, tokens.access_token, RESOURCE)).not.toBeNull();
    tick(1);
    expect(await verifyAgentToken(db, tokens.access_token, RESOURCE)).toBeNull();
  });

  it("writes last_used_at at most every ten minutes", async () => {
    const client = await register();
    const tokens = await connect(client);
    const principal = await verifyAgentToken(db, tokens.access_token, RESOURCE);
    const tokenId = principal?.tokenId ?? "";
    expect((await tokenRow(tokenId))?.last_used_at).toBe(START.toISOString());
    tick(10 * 60 * 1000);
    await verifyAgentToken(db, tokens.access_token, RESOURCE);
    expect((await tokenRow(tokenId))?.last_used_at).toBe(START.toISOString());
    tick(1);
    await verifyAgentToken(db, tokens.access_token, RESOURCE);
    expect((await tokenRow(tokenId))?.last_used_at).toBe(new Date(START.getTime() + 10 * 60 * 1000 + 1).toISOString());
  });

  it("never expires an API key by time", async () => {
    const key = await createApiKey(db, "user-1", "CI", RESOURCE);
    if (!key.ok) throw new Error(key.error);
    tick(365 * 24 * 60 * 60 * 1000);
    expect(await verifyAgentToken(db, key.key, RESOURCE)).toEqual({
      userId: "user-1",
      tokenId: key.grant.id,
      kind: "api_key",
      clientId: null,
    });
  });
});

describe("revokeAgentToken", () => {
  it("revokes by access or refresh token and ignores unknown ones", async () => {
    const client = await register();
    const byAccess = await connect(client);
    const byRefresh = await connect(client);
    await revokeAgentToken(db, byAccess.access_token);
    expect(await verifyAgentToken(db, byAccess.access_token, RESOURCE)).toBeNull();
    expect(await verifyAgentToken(db, byRefresh.access_token, RESOURCE)).not.toBeNull();

    await revokeAgentToken(db, byRefresh.refresh_token);
    expect(await verifyAgentToken(db, byRefresh.access_token, RESOURCE)).toBeNull();
    expect((await refreshAccessToken(db, { refreshToken: byRefresh.refresh_token, clientId: client.clientId })).ok).toBe(false);

    await expect(revokeAgentToken(db, "aca_unknown")).resolves.toBeUndefined();
    await expect(revokeAgentToken(db, "")).resolves.toBeUndefined();
    await expect(revokeAgentToken(db, "x".repeat(201))).resolves.toBeUndefined();
  });
});

describe("API keys", () => {
  it("creates a named key that works as a bearer token", async () => {
    const result = await createApiKey(db, "user-1", "  \u0007CI bot  ", RESOURCE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.key).toMatch(/^ack_/u);
    expect(result.grant).toEqual({
      id: expect.any(String),
      kind: "api_key",
      name: "CI bot",
      createdAt: START.toISOString(),
      lastUsedAt: null,
    });
    expect(await verifyAgentToken(db, result.key, RESOURCE)).toMatchObject({ kind: "api_key", userId: "user-1" });
  });

  it("names unnamed keys 'API key'", async () => {
    for (const label of [undefined, 123, "   "]) {
      const result = await createApiKey(db, "user-1", label, RESOURCE);
      expect(result.ok && result.grant.name).toBe("API key");
    }
  });

  it(`caps live keys at ${MAX_API_KEYS} per user`, async () => {
    const keys = [];
    for (let index = 0; index < MAX_API_KEYS; index += 1) {
      const result = await createApiKey(db, "user-1", `key ${index}`, RESOURCE);
      if (!result.ok) throw new Error(result.error);
      keys.push(result);
    }
    expect(await createApiKey(db, "user-1", "one more", RESOURCE)).toEqual({
      ok: false,
      error: `You already have ${MAX_API_KEYS} API keys. Revoke one first.`,
    });
    expect((await createApiKey(db, "user-2", "other user", RESOURCE)).ok).toBe(true);
    expect(await revokeAgentGrant(db, "user-1", keys[0].grant.id)).toBe(true);
    expect((await createApiKey(db, "user-1", "replacement", RESOURCE)).ok).toBe(true);
  });
});

describe("connected agents", () => {
  async function seedGrants() {
    const laptop = await createApiKey(db, "user-1", "Laptop", RESOURCE);
    const revokedKey = await createApiKey(db, "user-1", "Old key", RESOURCE);
    if (!laptop.ok || !revokedKey.ok) throw new Error("key failed");
    await revokeAgentGrant(db, "user-1", revokedKey.grant.id);
    const claude = await register("Claude");
    const unnamed = await register(null);
    tick(1_000);
    const claudeFirst = await connect(claude);
    tick(1_000);
    const claudeSecond = await connect(claude);
    tick(1_000);
    const unnamedTokens = await connect(unnamed);
    tick(1_000);
    const rotated = await refreshAccessToken(db, { refreshToken: claudeSecond.refresh_token, clientId: claude.clientId });
    if (!rotated.ok) throw new Error("refresh failed");
    const otherUser = await connect(claude, "user-2");
    tick(1_000);
    await createApiKey(db, "user-2", "Not mine", RESOURCE);
    // An expired grant and a malformed OAuth row stay hidden.
    const past = new Date(START.getTime() - 1).toISOString();
    await db
      .prepare(
        `INSERT INTO agent_tokens (id, kind, user_id, client_id, access_hash, refresh_hash, scope, resource,
           access_expires_at, refresh_expires_at, created_at)
         VALUES ('expired', 'oauth', 'user-1', ?, ?, ?, ?, ?, ?, ?, ?),
                ('orphan', 'oauth', 'user-1', NULL, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        claude.clientId,
        hashToken("aca_expired"),
        hashToken("acr_expired"),
        AGENT_SCOPE,
        RESOURCE,
        past,
        past,
        past,
        hashToken("aca_orphan"),
        hashToken("acr_orphan"),
        AGENT_SCOPE,
        RESOURCE,
        new Date(Date.now() + ACCESS_TOKEN_TTL_MS).toISOString(),
        new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString(),
        new Date(Date.now() + 1).toISOString(),
      )
      .run();
    return { laptop, claude, unnamed, claudeFirst, rotated: rotated.tokens, unnamedTokens, otherUser };
  }

  it("lists API keys and one entry per OAuth client, newest first", async () => {
    const { laptop } = await seedGrants();
    const grants = await listAgentGrants(db, "user-1");
    expect(grants.map((grant) => [grant.kind, grant.name])).toEqual([
      ["oauth", "Claude"],
      ["oauth", "AI app"],
      ["api_key", "Laptop"],
    ]);
    expect(grants[0].createdAt).toBe(new Date(START.getTime() + 4_000).toISOString());
    expect(grants[2]).toEqual({ ...laptop.grant, lastUsedAt: null });
    expect((await listAgentGrants(db, "user-2")).map((grant) => grant.name)).toEqual(["Not mine", "Claude"]);
  });

  it("disconnecting an OAuth grant revokes every token of that client for the user", async () => {
    const seeded = await seedGrants();
    const claudeGrant = (await listAgentGrants(db, "user-1")).find((grant) => grant.name === "Claude");
    expect(await revokeAgentGrant(db, "user-1", claudeGrant?.id ?? "")).toBe(true);
    expect(await verifyAgentToken(db, seeded.claudeFirst.access_token, RESOURCE)).toBeNull();
    expect(await verifyAgentToken(db, seeded.rotated.access_token, RESOURCE)).toBeNull();
    expect(await verifyAgentToken(db, seeded.unnamedTokens.access_token, RESOURCE)).not.toBeNull();
    expect(await verifyAgentToken(db, seeded.otherUser.access_token, RESOURCE)).not.toBeNull();
    expect(await verifyAgentToken(db, seeded.laptop.ok ? seeded.laptop.key : "", RESOURCE)).not.toBeNull();
    expect((await listAgentGrants(db, "user-1")).map((grant) => grant.name)).toEqual(["AI app", "Laptop"]);
  });

  it("disconnecting an API key or a client-less row revokes just that row", async () => {
    const seeded = await seedGrants();
    if (!seeded.laptop.ok) throw new Error("key failed");
    expect(await revokeAgentGrant(db, "user-1", seeded.laptop.grant.id)).toBe(true);
    expect(await verifyAgentToken(db, seeded.laptop.key, RESOURCE)).toBeNull();
    expect(await verifyAgentToken(db, seeded.rotated.access_token, RESOURCE)).not.toBeNull();

    expect(await revokeAgentGrant(db, "user-1", "orphan")).toBe(true);
    expect((await tokenRow("orphan"))?.revoked_at).toBe(new Date(START.getTime() + 5_000).toISOString());
    expect(await verifyAgentToken(db, seeded.claudeFirst.access_token, RESOURCE)).not.toBeNull();
  });

  it("refuses to revoke unknown grants or another user's grant", async () => {
    const seeded = await seedGrants();
    if (!seeded.laptop.ok) throw new Error("key failed");
    expect(await revokeAgentGrant(db, "user-1", "missing")).toBe(false);
    expect(await revokeAgentGrant(db, "user-2", seeded.laptop.grant.id)).toBe(false);
    expect(await verifyAgentToken(db, seeded.laptop.key, RESOURCE)).not.toBeNull();
  });
});
