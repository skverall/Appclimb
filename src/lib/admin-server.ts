import { NextResponse } from "next/server";

/** Same cookie the /admin opt-out toggle writes (see analytics-client). */
const ADMIN_OPTOUT_COOKIE = "appclimb_admin_optout=1; Path=/; Max-Age=31536000; SameSite=Lax; Secure";

/**
 * Empty analytics response for a signed-in admin. It also sets the opt-out
 * cookie so the same browser stays excluded after signing out.
 */
export function adminOptOutResponse(): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  response.headers.append("Set-Cookie", ADMIN_OPTOUT_COOKIE);
  return response;
}
