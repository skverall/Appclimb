import { backendRequest } from "@/lib/backend";

export async function GET() {
  let backend = "unavailable";
  let backendOrigin = "unavailable";
  try {
    const response = await backendRequest("/readyz");
    backend = response.ok ? "ready" : "degraded";
    backendOrigin = new URL(response.url).origin;
  } catch {
    backend = "unavailable";
  }

  return Response.json({
    status: backend === "ready" ? "ok" : "degraded",
    service: "appclimb-web",
    backend,
    backendOrigin,
    now: new Date().toISOString(),
  }, { status: backend === "ready" ? 200 : 503 });
}
