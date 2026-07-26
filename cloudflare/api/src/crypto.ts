import { argon2id } from "@noble/hashes/argon2.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_DIGEST_BYTES = 32;
const ARGON2_MEMORY_KIB = 19 * 1024;
const ARGON2_ITERATIONS = 2;
const ARGON2_PARALLELISM = 1;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("invalid_base64url");
  }
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const decoded = base64ToBytes(padded);
  if (base64UrlEncode(decoded) !== value) {
    throw new Error("non_canonical_base64url");
  }
  return decoded;
}

export function randomToken(bytes: number): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64UrlEncode(value);
}

export async function sha256(value: string | Uint8Array): Promise<Uint8Array> {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes)),
  );
}

export function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8 || password.length > 128) {
    throw new Error("invalid_password");
  }
  const salt = new Uint8Array(PASSWORD_SALT_BYTES);
  crypto.getRandomValues(salt);
  const digest = argon2id(encoder.encode(password), salt, {
    m: ARGON2_MEMORY_KIB,
    t: ARGON2_ITERATIONS,
    p: ARGON2_PARALLELISM,
    dkLen: PASSWORD_DIGEST_BYTES,
  });
  return `$argon2id$v=19$m=${ARGON2_MEMORY_KIB},t=${ARGON2_ITERATIONS},p=${ARGON2_PARALLELISM}$${bytesToBase64(salt).replace(/=+$/u, "")}$${bytesToBase64(digest).replace(/=+$/u, "")}`;
}

export async function verifyPassword(
  encodedHash: string,
  password: string,
): Promise<boolean> {
  const parts = encodedHash.split("$");
  if (parts.length !== 6 || parts[1] !== "argon2id" || parts[2] !== "v=19") {
    return false;
  }
  const match = /^m=(\d+),t=(\d+),p=(\d+)$/u.exec(parts[3]);
  if (!match) {
    return false;
  }
  const memory = Number(match[1]);
  const iterations = Number(match[2]);
  const parallelism = Number(match[3]);
  if (
    !Number.isInteger(memory) ||
    !Number.isInteger(iterations) ||
    !Number.isInteger(parallelism) ||
    memory < 8 ||
    memory > 64 * 1024 ||
    iterations < 1 ||
    iterations > 10 ||
    parallelism < 1 ||
    parallelism > 8
  ) {
    return false;
  }
  try {
    const salt = base64ToBytes(parts[4].padEnd(Math.ceil(parts[4].length / 4) * 4, "="));
    const expected = base64ToBytes(
      parts[5].padEnd(Math.ceil(parts[5].length / 4) * 4, "="),
    );
    const actual = argon2id(encoder.encode(password), salt, {
      m: memory,
      t: iterations,
      p: parallelism,
      dkLen: expected.length,
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

async function hmacSha256(key: string | Uint8Array, value: string): Promise<Uint8Array> {
  const rawKey = typeof key === "string" ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(rawKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      toArrayBuffer(encoder.encode(value)),
    ),
  );
}

function signingKey(encoded: string): Uint8Array {
  try {
    const key = base64ToBytes(encoded);
    if (key.length < 32) {
      throw new Error("short_key");
    }
    return key;
  } catch {
    throw new Error("jwt_secret_invalid");
  }
}

export interface AccessClaims {
  sub: string;
  wid: string;
  role: string;
  iss: "appclimb-api";
  aud: "appclimb-web";
  exp: number;
  iat: number;
  nbf: number;
  jti: string;
}

export async function issueAccessToken(
  secret: string,
  userId: string,
  workspaceId: string,
  role: string,
  now = new Date(),
): Promise<{ token: string; expiresAt: string }> {
  const key = signingKey(secret);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const claims: AccessClaims = {
    sub: userId,
    wid: workspaceId,
    role,
    iss: "appclimb-api",
    aud: "appclimb-web",
    exp: Math.floor(expiresAt.getTime() / 1000),
    iat: nowSeconds,
    nbf: nowSeconds - 5,
    jti: crypto.randomUUID(),
  };
  const payload = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const unsigned = `${header}.${payload}`;
  const signature = base64UrlEncode(await hmacSha256(key, unsigned));
  return { token: `${unsigned}.${signature}`, expiresAt: expiresAt.toISOString() };
}

export async function parseAccessToken(
  secret: string,
  raw: string,
  now = new Date(),
): Promise<AccessClaims> {
  const parts = raw.split(".");
  if (parts.length !== 3) {
    throw new Error("invalid_access_token");
  }
  const expected = await hmacSha256(signingKey(secret), `${parts[0]}.${parts[1]}`);
  const provided = base64UrlDecode(parts[2]);
  if (!timingSafeEqual(expected, provided)) {
    throw new Error("invalid_access_token");
  }
  const header = JSON.parse(decoder.decode(base64UrlDecode(parts[0]))) as {
    alg?: string;
    typ?: string;
  };
  const claims = JSON.parse(decoder.decode(base64UrlDecode(parts[1]))) as AccessClaims;
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (
    header.alg !== "HS256" ||
    claims.iss !== "appclimb-api" ||
    claims.aud !== "appclimb-web" ||
    !claims.sub ||
    !claims.wid ||
    !claims.role ||
    !Number.isFinite(claims.exp) ||
    !Number.isFinite(claims.iat) ||
    claims.exp < nowSeconds - 15 ||
    claims.nbf > nowSeconds + 15
  ) {
    throw new Error("invalid_access_token");
  }
  return claims;
}

export interface TrackingClaims {
  w: string;
  p: string;
  v: number;
}

export async function issueTrackingToken(
  secret: string,
  claims: TrackingClaims,
): Promise<string> {
  if (!claims.w || !claims.p || claims.v < 1) {
    throw new Error("invalid_tracking_claims");
  }
  const key = signingKey(secret);
  const payload = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const signature = await hmacSha256(key, `appclimb-web-analytics\u0000${payload}`);
  return `acwa1_${payload}.${base64UrlEncode(signature)}`;
}

export async function parseTrackingToken(
  secret: string,
  raw: string,
): Promise<TrackingClaims> {
  if (!raw.startsWith("acwa1_")) {
    throw new Error("invalid_tracking_token");
  }
  const parts = raw.slice(6).split(".");
  if (parts.length !== 2) {
    throw new Error("invalid_tracking_token");
  }
  const expected = await hmacSha256(
    signingKey(secret),
    `appclimb-web-analytics\u0000${parts[0]}`,
  );
  if (!timingSafeEqual(expected, base64UrlDecode(parts[1]))) {
    throw new Error("invalid_tracking_token");
  }
  const claims = JSON.parse(decoder.decode(base64UrlDecode(parts[0]))) as TrackingClaims;
  if (!claims.w || !claims.p || !Number.isInteger(claims.v) || claims.v < 1) {
    throw new Error("invalid_tracking_token");
  }
  return claims;
}

export interface CredentialEnvelope {
  version: 1;
  encryptedDataKey: string;
  dataKeyIv: string;
  dataKeyTag: string;
  ciphertext: string;
  payloadIv: string;
  payloadTag: string;
}

function splitCiphertextAndTag(value: Uint8Array): [Uint8Array, Uint8Array] {
  return [value.slice(0, -16), value.slice(-16)];
}

async function aesGcmEncrypt(
  plaintext: Uint8Array,
  keyBytes: Uint8Array,
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array; tag: Uint8Array }> {
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(plaintext),
    ),
  );
  const [ciphertext, tag] = splitCiphertextAndTag(sealed);
  return { ciphertext, iv, tag };
}

async function aesGcmDecrypt(
  ciphertext: Uint8Array,
  iv: Uint8Array,
  tag: Uint8Array,
  keyBytes: Uint8Array,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext);
  combined.set(tag, ciphertext.length);
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(combined),
    ),
  );
}

function masterKey(encoded: string): Uint8Array {
  const key = base64ToBytes(encoded);
  if (key.length !== 32) {
    throw new Error("invalid_envelope_master_key");
  }
  return key;
}

export async function sealCredentials(
  credentials: Record<string, unknown>,
  encodedMasterKey: string,
): Promise<CredentialEnvelope> {
  const dataKey = new Uint8Array(32);
  crypto.getRandomValues(dataKey);
  const wrapped = await aesGcmEncrypt(dataKey, masterKey(encodedMasterKey));
  const payload = await aesGcmEncrypt(
    encoder.encode(JSON.stringify(credentials)),
    dataKey,
  );
  return {
    version: 1,
    encryptedDataKey: bytesToBase64(wrapped.ciphertext),
    dataKeyIv: bytesToBase64(wrapped.iv),
    dataKeyTag: bytesToBase64(wrapped.tag),
    ciphertext: bytesToBase64(payload.ciphertext),
    payloadIv: bytesToBase64(payload.iv),
    payloadTag: bytesToBase64(payload.tag),
  };
}

export async function openCredentials(
  envelope: CredentialEnvelope,
  encodedMasterKey: string,
): Promise<Record<string, unknown>> {
  if (envelope.version !== 1) {
    throw new Error("unsupported_envelope");
  }
  const dataKey = await aesGcmDecrypt(
    base64ToBytes(envelope.encryptedDataKey),
    base64ToBytes(envelope.dataKeyIv),
    base64ToBytes(envelope.dataKeyTag),
    masterKey(encodedMasterKey),
  );
  const plaintext = await aesGcmDecrypt(
    base64ToBytes(envelope.ciphertext),
    base64ToBytes(envelope.payloadIv),
    base64ToBytes(envelope.payloadTag),
    dataKey,
  );
  return JSON.parse(decoder.decode(plaintext)) as Record<string, unknown>;
}
