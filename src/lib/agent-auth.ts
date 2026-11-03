/**
 * Server-only OAuth 2.1 authorization server for the remote MCP endpoint
 * (ADR 0008). AI clients (ChatGPT, Claude, Codex, Cursor) register
 * themselves (RFC 7591) or identify with a Client ID Metadata Document,
 * send the user through sign-in and consent on appclimb.app, and exchange a
 * PKCE-protected code for a short-lived access token plus a rotating refresh
 * token. Headless agents can use a personal API key instead.
 *
 * Every secret is a random token stored only as its SHA-256 hash, like
 * sessions (see auth.ts).
 */
import { createHash } from "node:crypto";

import { generateToken, hashToken, newId } from "./auth";

export const AGENT_SCOPE = "appclimb";
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
export const AUTH_CODE_TTL_MS = 5 * 60 * 1000;
export const AUTH_REQUEST_TTL_MS = 30 * 60 * 1000;
export const MAX_API_KEYS = 10;
const LAST_USED_REFRESH_MS = 10 * 60 * 1000;
const MAX_REDIRECT_URIS = 10;
const METADATA_DOC_MAX_BYTES = 10_000;

/** The MCP endpoint is the protected resource; tokens are bound to it. */
export function mcpResourceUrl(origin: string): string {
  return `${origin}/mcp`;
}

/** Discovery document for the protected resource (RFC 9728). */
export function protectedResourceMetadata(origin: string) {
  return {
    resource: mcpResourceUrl(origin),
    authorization_servers: [origin],
    scopes_supported: [AGENT_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "AppClimb",
    resource_documentation: `${origin}/connect`,
  };
}

/** Authorization server metadata (RFC 8414). */
export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [AGENT_SCOPE],
    client_id_metadata_document_supported: true,
    // Every redirect back to a client carries `iss` (RFC 9207); ChatGPT and
    // Codex use their stable client identity only when this is advertised.
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${origin}/connect`,
  };
}

/* ------------------------------------------------------------------ */
/* Redirect URIs                                                        */
/* ------------------------------------------------------------------ */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const FORBIDDEN_SCHEMES = new Set(["javascript:", "data:", "file:", "vbscript:", "about:", "blob:", "ftp:", "ws:", "wss:"]);

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function isLoopback(url: URL): boolean {
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
}

/**
 * Accept https URLs, http only on loopback (native CLIs, RFC 8252), and
 * private-use schemes such as `cursor://`. No fragments, no credentials.
 */
export function isAllowedRedirectUri(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return false;
  const url = parseUrl(raw);
  if (!url || url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return Boolean(url.hostname);
  if (url.protocol === "http:") return isLoopback(url);
  if (FORBIDDEN_SCHEMES.has(url.protocol)) return false;
  return /^[a-z][a-z0-9+.-]*:$/u.test(url.protocol);
}

/**
 * Exact match against a registered URI, except that a loopback redirect may
 * use any port (RFC 8252 §7.3): CLIs pick a free port at login time.
 */
export function redirectUriMatches(registered: readonly string[], requested: string): boolean {
  if (registered.includes(requested)) return true;
  const wanted = parseUrl(requested);
  if (!wanted || !isLoopback(wanted)) return false;
  return registered.some((entry) => {
    const candidate = parseUrl(entry);
    return (
      candidate !== null &&
      isLoopback(candidate) &&
      candidate.hostname === wanted.hostname &&
      candidate.pathname === wanted.pathname &&
      candidate.search === wanted.search
    );
  });
}

/* ------------------------------------------------------------------ */
/* Clients                                                              */
/* ------------------------------------------------------------------ */

export interface OAuthClient {
  clientId: string;
  clientName: string | null;
  redirectUris: string[];
}

interface ClientRow {
  client_id: string;
  client_name: string | null;
  redirect_uris: string;
  metadata_url: number;
}

function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/[\u0000-\u001f\u007f]/gu, "").trim().slice(0, 80);
  return name || null;
}

function toClient(row: ClientRow): OAuthClient {
  let redirectUris: string[] = [];
  try {
    const parsed = JSON.parse(row.redirect_uris) as unknown;
    if (Array.isArray(parsed)) redirectUris = parsed.filter((uri): uri is string => typeof uri === "string");
  } catch {
    redirectUris = [];
  }
  return { clientId: row.client_id, clientName: row.client_name, redirectUris };
}

export type RegistrationResult =
  | { ok: true; client: OAuthClient; response: Record<string, unknown> }
  | { ok: false; error: string; description: string };

/** Dynamic Client Registration (RFC 7591). Every client is public (PKCE, no secret). */
export async function registerClient(db: D1Database, body: unknown): Promise<RegistrationResult> {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const uris = Array.isArray(input.redirect_uris) ? input.redirect_uris : [];
  if (uris.length === 0 || uris.length > MAX_REDIRECT_URIS || !uris.every(isAllowedRedirectUri)) {
    return {
      ok: false,
      error: "invalid_redirect_uri",
      description: "redirect_uris must list 1-10 https, loopback http, or app-scheme URIs.",
    };
  }
  const grantTypes = Array.isArray(input.grant_types) ? input.grant_types : ["authorization_code"];
  if (!grantTypes.includes("authorization_code")) {
    return {
      ok: false,
      error: "invalid_client_metadata",
      description: "Only the authorization_code grant (with refresh_token) is supported.",
    };
  }
  const client: OAuthClient = {
    clientId: `acc_${generateToken(18)}`,
    clientName: cleanName(input.client_name),
    redirectUris: [...new Set(uris as string[])],
  };
  const issuedAt = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO oauth_clients (client_id, client_name, redirect_uris, metadata_url, created_at)
       VALUES (?, ?, ?, 0, ?)`,
    )
    .bind(client.clientId, client.clientName, JSON.stringify(client.redirectUris), new Date().toISOString())
    .run();
  return {
    ok: true,
    client,
    response: {
      client_id: client.clientId,
      client_id_issued_at: issuedAt,
      client_name: client.clientName ?? undefined,
      redirect_uris: client.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: AGENT_SCOPE,
    },
  };
}

/** A Client ID Metadata Document's client_id is its own HTTPS URL. */
export function isMetadataDocumentClientId(clientId: string): boolean {
  const url = parseUrl(clientId);
  return url !== null && url.protocol === "https:" && url.pathname.length > 1 && !url.hash;
}

async function fetchMetadataDocument(
  clientId: string,
  fetchImpl: typeof fetch,
): Promise<OAuthClient | null> {
  try {
    // Workers reject `redirect: "error"`; with "manual" a redirect is simply not ok.
    const response = await fetchImpl(clientId, {
      headers: { accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      console.warn("[agent-auth] client metadata document unavailable:", clientId, response.status);
      return null;
    }
    const text = await response.text();
    if (text.length > METADATA_DOC_MAX_BYTES) return null;
    const doc = JSON.parse(text) as Record<string, unknown>;
    if (doc.client_id !== clientId) return null;
    const uris = Array.isArray(doc.redirect_uris) ? doc.redirect_uris : [];
    if (uris.length === 0 || uris.length > MAX_REDIRECT_URIS || !uris.every(isAllowedRedirectUri)) {
      return null;
    }
    return { clientId, clientName: cleanName(doc.client_name), redirectUris: uris as string[] };
  } catch (error) {
    console.warn("[agent-auth] client metadata document failed:", clientId, error instanceof Error ? error.message : String(error));
    return null;
  }
}

/** Look a client up, fetching (and caching) its metadata document when the id is a URL. */
export async function resolveClient(
  db: D1Database,
  clientId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OAuthClient | null> {
  if (!clientId || clientId.length > 512) return null;
  const row = await db
    .prepare("SELECT * FROM oauth_clients WHERE client_id = ?")
    .bind(clientId)
    .first<ClientRow>();
  if (!isMetadataDocumentClientId(clientId)) return row ? toClient(row) : null;

  // Authorization is rare, so read the document fresh each time and keep the
  // cached copy only as a fallback for when the client's host is down.
  const fresh = await fetchMetadataDocument(clientId, fetchImpl);
  if (!fresh) return row ? toClient(row) : null;
  await db
    .prepare(
      `INSERT INTO oauth_clients (client_id, client_name, redirect_uris, metadata_url, created_at)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT (client_id) DO UPDATE SET client_name = excluded.client_name,
         redirect_uris = excluded.redirect_uris`,
    )
    .bind(fresh.clientId, fresh.clientName, JSON.stringify(fresh.redirectUris), new Date().toISOString())
    .run();
  return fresh;
}

/** Name to show on the consent page, without refetching a metadata document. */
export async function clientDisplayName(db: D1Database, clientId: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT client_name FROM oauth_clients WHERE client_id = ?")
    .bind(clientId)
    .first<{ client_name: string | null }>();
  return row?.client_name ?? null;
}

/* ------------------------------------------------------------------ */
/* Authorization requests and codes                                     */
/* ------------------------------------------------------------------ */

export interface AuthorizationRequest {
  id: string;
  clientId: string;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scope: string;
  resource: string;
}

interface RequestRow {
  id: string;
  client_id: string;
  redirect_uri: string;
  state: string | null;
  code_challenge: string;
  scope: string;
  resource: string;
  expires_at: string;
}

/** `resource` must name this server's MCP endpoint (RFC 8707); absent means the same. */
export function canonicalResource(raw: string | null | undefined, origin: string): string | null {
  const expected = mcpResourceUrl(origin);
  if (raw === null || raw === undefined || raw === "") return expected;
  // Compare canonical forms: scheme and host are case-insensitive, and some
  // clients add a trailing slash.
  const value = raw.trim().replace(/\/+$/u, "").toLowerCase();
  return value === expected.toLowerCase() || value === origin.toLowerCase() ? expected : null;
}

/** A PKCE S256 challenge is 43 base64url characters. */
export function isValidCodeChallenge(raw: unknown): raw is string {
  return typeof raw === "string" && /^[A-Za-z0-9_-]{43}$/u.test(raw);
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export async function saveAuthorizationRequest(
  db: D1Database,
  input: Omit<AuthorizationRequest, "id">,
): Promise<string> {
  const id = generateToken(18);
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO oauth_requests (id, client_id, redirect_uri, state, code_challenge, scope, resource, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.clientId,
      input.redirectUri,
      input.state,
      input.codeChallenge,
      input.scope,
      input.resource,
      new Date(now).toISOString(),
      new Date(now + AUTH_REQUEST_TTL_MS).toISOString(),
    )
    .run();
  // Opportunistic cleanup keeps the table small without a cron.
  await db.prepare("DELETE FROM oauth_requests WHERE expires_at < ?").bind(new Date(now).toISOString()).run();
  return id;
}

export async function getAuthorizationRequest(
  db: D1Database,
  id: string,
): Promise<AuthorizationRequest | null> {
  if (!id || id.length > 64) return null;
  const row = await db.prepare("SELECT * FROM oauth_requests WHERE id = ?").bind(id).first<RequestRow>();
  if (!row || Date.parse(row.expires_at) <= Date.now()) return null;
  return {
    id: row.id,
    clientId: row.client_id,
    redirectUri: row.redirect_uri,
    state: row.state,
    codeChallenge: row.code_challenge,
    scope: row.scope,
    resource: row.resource,
  };
}

/** Build the redirect back to the client carrying `params`, the original state and `iss`. */
export function clientRedirect(
  request: Pick<AuthorizationRequest, "redirectUri" | "state">,
  params: Record<string, string>,
  issuer: string,
): string {
  const url = new URL(request.redirectUri);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  if (request.state) url.searchParams.set("state", request.state);
  url.searchParams.set("iss", issuer);
  return url.toString();
}

/** The user approved: consume the request and mint a one-time code. */
export async function approveAuthorizationRequest(
  db: D1Database,
  request: AuthorizationRequest,
  userId: string,
  issuer: string,
): Promise<string | null> {
  const deleted = await db.prepare("DELETE FROM oauth_requests WHERE id = ?").bind(request.id).run();
  if (deleted.meta.changes === 0) return null;
  const code = generateToken(32);
  await db
    .prepare(
      `INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, resource, expires_at, used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .bind(
      hashToken(code),
      request.clientId,
      userId,
      request.redirectUri,
      request.codeChallenge,
      request.scope,
      request.resource,
      new Date(Date.now() + AUTH_CODE_TTL_MS).toISOString(),
    )
    .run();
  return clientRedirect(request, { code }, issuer);
}

export async function denyAuthorizationRequest(
  db: D1Database,
  request: AuthorizationRequest,
  issuer: string,
): Promise<string> {
  await db.prepare("DELETE FROM oauth_requests WHERE id = ?").bind(request.id).run();
  return clientRedirect(
    request,
    { error: "access_denied", error_description: "The user declined access." },
    issuer,
  );
}

/* ------------------------------------------------------------------ */
/* Tokens                                                               */
/* ------------------------------------------------------------------ */

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export type TokenResult =
  | { ok: true; tokens: TokenResponse }
  | { ok: false; error: string; description: string };

interface CodeRow {
  code_hash: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  code_challenge: string;
  scope: string;
  resource: string;
  expires_at: string;
  used_at: string | null;
}

interface TokenRow {
  id: string;
  kind: string;
  user_id: string;
  client_id: string | null;
  label: string | null;
  scope: string;
  resource: string;
  access_expires_at: string | null;
  refresh_expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

function invalidGrant(description: string): TokenResult {
  return { ok: false, error: "invalid_grant", description };
}

async function issueOAuthTokens(
  db: D1Database,
  grant: { userId: string; clientId: string; scope: string; resource: string },
): Promise<TokenResponse> {
  const accessToken = `aca_${generateToken(32)}`;
  const refreshToken = `acr_${generateToken(32)}`;
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO agent_tokens (id, kind, user_id, client_id, label, access_hash, refresh_hash, scope, resource,
         access_expires_at, refresh_expires_at, created_at, last_used_at, revoked_at)
       VALUES (?, 'oauth', ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    )
    .bind(
      newId(),
      grant.userId,
      grant.clientId,
      hashToken(accessToken),
      hashToken(refreshToken),
      grant.scope,
      grant.resource,
      new Date(now + ACCESS_TOKEN_TTL_MS).toISOString(),
      new Date(now + REFRESH_TOKEN_TTL_MS).toISOString(),
      new Date(now).toISOString(),
    )
    .run();
  await db
    .prepare("UPDATE oauth_clients SET last_used_at = ? WHERE client_id = ?")
    .bind(new Date(now).toISOString(), grant.clientId)
    .run();
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: refreshToken,
    scope: grant.scope,
  };
}

export async function exchangeAuthorizationCode(
  db: D1Database,
  input: {
    code: string;
    clientId: string;
    redirectUri: string;
    codeVerifier: string;
    resource: string | null;
  },
): Promise<TokenResult> {
  if (!input.code || !input.codeVerifier) return invalidGrant("code and code_verifier are required.");
  const codeHash = hashToken(input.code);
  const row = await db.prepare("SELECT * FROM oauth_codes WHERE code_hash = ?").bind(codeHash).first<CodeRow>();
  if (!row || row.used_at || Date.parse(row.expires_at) <= Date.now()) {
    return invalidGrant("The authorization code is invalid or expired.");
  }
  if (row.client_id !== input.clientId) return invalidGrant("The code was issued to another client.");
  if (input.redirectUri && row.redirect_uri !== input.redirectUri) {
    return invalidGrant("redirect_uri does not match the authorization request.");
  }
  if (input.resource !== null && input.resource !== row.resource) {
    return { ok: false, error: "invalid_target", description: "resource does not match the authorization request." };
  }
  if (pkceChallenge(input.codeVerifier) !== row.code_challenge) {
    return invalidGrant("PKCE verification failed.");
  }
  const used = await db
    .prepare("UPDATE oauth_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL")
    .bind(new Date().toISOString(), codeHash)
    .run();
  if (used.meta.changes === 0) return invalidGrant("The authorization code was already used.");
  await db.prepare("DELETE FROM oauth_codes WHERE expires_at < ?").bind(new Date().toISOString()).run();
  return {
    ok: true,
    tokens: await issueOAuthTokens(db, {
      userId: row.user_id,
      clientId: row.client_id,
      scope: row.scope,
      resource: row.resource,
    }),
  };
}

/** Rotate a refresh token. Reusing a spent one revokes the whole grant for that client. */
export async function refreshAccessToken(
  db: D1Database,
  input: { refreshToken: string; clientId: string },
): Promise<TokenResult> {
  if (!input.refreshToken) return invalidGrant("refresh_token is required.");
  const row = await db
    .prepare("SELECT * FROM agent_tokens WHERE refresh_hash = ? AND kind = 'oauth'")
    .bind(hashToken(input.refreshToken))
    .first<TokenRow>();
  if (!row) return invalidGrant("The refresh token is invalid.");
  if (input.clientId && row.client_id !== input.clientId) return invalidGrant("The refresh token belongs to another client.");
  const now = new Date().toISOString();
  if (row.revoked_at) {
    await db
      .prepare("UPDATE agent_tokens SET revoked_at = ? WHERE user_id = ? AND client_id = ? AND revoked_at IS NULL")
      .bind(now, row.user_id, row.client_id)
      .run();
    return invalidGrant("The refresh token was already used.");
  }
  if (!row.refresh_expires_at || Date.parse(row.refresh_expires_at) <= Date.now()) {
    return invalidGrant("The refresh token expired. Connect again.");
  }
  const revoked = await db
    .prepare("UPDATE agent_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
    .bind(now, row.id)
    .run();
  if (revoked.meta.changes === 0) return invalidGrant("The refresh token was already used.");
  return {
    ok: true,
    tokens: await issueOAuthTokens(db, {
      userId: row.user_id,
      clientId: row.client_id as string,
      scope: row.scope,
      resource: row.resource,
    }),
  };
}

export interface AgentPrincipal {
  userId: string;
  tokenId: string;
  kind: "oauth" | "api_key";
  clientId: string | null;
}

/** Resolve a bearer token (OAuth access token or API key) for the MCP resource. */
export async function verifyAgentToken(
  db: D1Database,
  token: string,
  resource: string,
): Promise<AgentPrincipal | null> {
  if (!token || token.length > 200) return null;
  const row = await db
    .prepare("SELECT * FROM agent_tokens WHERE access_hash = ?")
    .bind(hashToken(token))
    .first<TokenRow>();
  if (!row || row.revoked_at || row.resource !== resource) return null;
  if (row.access_expires_at && Date.parse(row.access_expires_at) <= Date.now()) return null;
  const lastUsed = row.last_used_at ? Date.parse(row.last_used_at) : 0;
  if (Date.now() - lastUsed > LAST_USED_REFRESH_MS) {
    await db
      .prepare("UPDATE agent_tokens SET last_used_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), row.id)
      .run();
  }
  return {
    userId: row.user_id,
    tokenId: row.id,
    kind: row.kind === "api_key" ? "api_key" : "oauth",
    clientId: row.client_id,
  };
}

/** RFC 7009: revoke by access or refresh token; unknown tokens are not an error. */
export async function revokeAgentToken(db: D1Database, token: string): Promise<void> {
  if (!token || token.length > 200) return;
  const hash = hashToken(token);
  await db
    .prepare(
      "UPDATE agent_tokens SET revoked_at = ? WHERE (access_hash = ? OR refresh_hash = ?) AND revoked_at IS NULL",
    )
    .bind(new Date().toISOString(), hash, hash)
    .run();
}

/* ------------------------------------------------------------------ */
/* Personal API keys and connected agents                               */
/* ------------------------------------------------------------------ */

export interface AgentGrant {
  id: string;
  kind: "oauth" | "api_key";
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export type ApiKeyResult = { ok: true; key: string; grant: AgentGrant } | { ok: false; error: string };

export async function createApiKey(
  db: D1Database,
  userId: string,
  label: unknown,
  resource: string,
): Promise<ApiKeyResult> {
  const count = await db
    .prepare("SELECT COUNT(*) AS n FROM agent_tokens WHERE user_id = ? AND kind = 'api_key' AND revoked_at IS NULL")
    .bind(userId)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_API_KEYS) {
    return { ok: false, error: `You already have ${MAX_API_KEYS} API keys. Revoke one first.` };
  }
  const key = `ack_${generateToken(32)}`;
  const id = newId();
  const name = cleanName(label) ?? "API key";
  const createdAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO agent_tokens (id, kind, user_id, client_id, label, access_hash, refresh_hash, scope, resource,
         access_expires_at, refresh_expires_at, created_at, last_used_at, revoked_at)
       VALUES (?, 'api_key', ?, NULL, ?, ?, NULL, ?, ?, NULL, NULL, ?, NULL, NULL)`,
    )
    .bind(id, userId, name, hashToken(key), AGENT_SCOPE, resource, createdAt)
    .run();
  return { ok: true, key, grant: { id, kind: "api_key", name, createdAt, lastUsedAt: null } };
}

/**
 * What the user has connected: API keys, plus one entry per OAuth client
 * whose latest grant is still alive (refresh rotation creates many rows).
 */
export async function listAgentGrants(db: D1Database, userId: string): Promise<AgentGrant[]> {
  const nowIso = new Date().toISOString();
  const { results } = await db
    .prepare(
      `SELECT t.*, c.client_name FROM agent_tokens t
       LEFT JOIN oauth_clients c ON c.client_id = t.client_id
       WHERE t.user_id = ? AND t.revoked_at IS NULL
         AND (t.kind = 'api_key' OR t.refresh_expires_at > ?)
       ORDER BY t.created_at DESC`,
    )
    .bind(userId, nowIso)
    .all<TokenRow & { client_name: string | null }>();
  const seenClients = new Set<string>();
  const grants: AgentGrant[] = [];
  for (const row of results) {
    if (row.kind === "oauth") {
      if (!row.client_id || seenClients.has(row.client_id)) continue;
      seenClients.add(row.client_id);
    }
    grants.push({
      id: row.id,
      kind: row.kind === "api_key" ? "api_key" : "oauth",
      name: row.kind === "api_key" ? (row.label ?? "API key") : (row.client_name ?? "AI app"),
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    });
  }
  return grants;
}

/** Disconnect: an API key, or every token of the OAuth client behind a grant. */
export async function revokeAgentGrant(db: D1Database, userId: string, grantId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT * FROM agent_tokens WHERE id = ? AND user_id = ?")
    .bind(grantId, userId)
    .first<TokenRow>();
  if (!row) return false;
  const now = new Date().toISOString();
  if (row.kind === "oauth" && row.client_id) {
    await db
      .prepare("UPDATE agent_tokens SET revoked_at = ? WHERE user_id = ? AND client_id = ? AND revoked_at IS NULL")
      .bind(now, userId, row.client_id)
      .run();
  } else {
    await db.prepare("UPDATE agent_tokens SET revoked_at = ? WHERE id = ?").bind(now, row.id).run();
  }
  return true;
}
