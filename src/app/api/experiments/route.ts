import {
  relayBackendResponse,
  requestWithSession,
} from "@/lib/backend";

export const dynamic = "force-dynamic";

/**
 * Persistent Lab experiments (plan task P0.29). There is no demo fallback here:
 * an anonymous or demo visitor gets 401 so the Lab can honestly say a draft was
 * not saved, instead of pretending a synthetic record was persisted.
 */
export async function GET(request: Request) {
  const appId = new URL(request.url).searchParams.get("appId")?.trim() ?? "";
  const response = await requestWithSession(
    `/v1/experiments${appId ? `?appId=${encodeURIComponent(appId)}` : ""}`,
  );
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}

export async function POST(request: Request) {
  const body = await request.text();
  const response = await requestWithSession("/v1/experiments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}
