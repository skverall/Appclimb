import { relayBackendResponse, requestWithSession } from "@/lib/backend";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parameters = new URLSearchParams({
    platform: url.searchParams.get("platform") ?? "app-store",
    q: (url.searchParams.get("q") ?? "").slice(0, 80),
    storefront: (url.searchParams.get("storefront") ?? "US").slice(0, 2),
  });
  const response = await requestWithSession(`/v1/apps/search?${parameters}`);
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}
