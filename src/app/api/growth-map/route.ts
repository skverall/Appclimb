import { demoSnapshot } from "@/lib/demo-data";
import {
  relayBackendResponse,
  requestWithSession,
} from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function GET() {
  const response = await requestWithSession("/v1/growth-map");
  if (response?.ok) {
    return relayBackendResponse(response);
  }

  return Response.json({
    data: demoSnapshot,
    meta: {
      mode: "demo",
      generatedAt: demoSnapshot.generatedAt,
      externalMutationsAllowed: false,
    },
  }, { status: response?.status === 401 ? 401 : 200 });
}
