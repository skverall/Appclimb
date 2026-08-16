/**
 * Server-only glue between HTTP requests and the session store (ADR 0004).
 * Reads/writes the `appclimb_session` cookie and resolves it to a user.
 */
import type { NextRequest, NextResponse } from "next/server";

import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  getSessionByToken,
  revokeSessionByToken,
  type SessionRow,
  type UserRow,
} from "./auth";

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
}

export function sessionCookieOptions(request: NextRequest): CookieOptions {
  // Production is always HTTPS; local dev is http://127.0.0.1, where a Secure
  // cookie would be rejected. Base the flag on the actual request scheme.
  const secure = request.nextUrl.protocol === "https:";
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

export function readSessionToken(request: NextRequest): string {
  return request.cookies.get(SESSION_COOKIE)?.value ?? "";
}

export function setSessionCookie(response: NextResponse, token: string, request: NextRequest): void {
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(request));
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getCurrentSession(
  request: NextRequest,
  db: D1Database,
): Promise<{ user: UserRow; session: SessionRow } | null> {
  const token = readSessionToken(request);
  if (!token) return null;
  return getSessionByToken(db, token);
}

export async function signOut(request: NextRequest, db: D1Database): Promise<void> {
  const token = readSessionToken(request);
  if (token) await revokeSessionByToken(db, token);
}
