import {
  clearBackendSession,
  refreshBackendSession,
} from "@/lib/backend";

function safeReturnPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

export async function GET(request: Request) {
  const requestURL = new URL(request.url);
  const returnPath = safeReturnPath(requestURL.searchParams.get("next"));
  const result = await refreshBackendSession();

  if (result === "refreshed") {
    return Response.redirect(new URL(returnPath, requestURL.origin), 303);
  }
  if (result === "unavailable") {
    const unavailableURL = new URL(returnPath, requestURL.origin);
    unavailableURL.searchParams.set("auth", "unavailable");
    return Response.redirect(unavailableURL, 303);
  }

  await clearBackendSession();
  return Response.redirect(new URL("/login", requestURL.origin), 303);
}
