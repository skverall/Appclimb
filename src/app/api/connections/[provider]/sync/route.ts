import {
  relayBackendResponse,
  requestWithSession,
} from "@/lib/backend";
import { connectorProviderSchema } from "@/lib/validation";

export async function POST(
  _request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider: rawProvider } = await context.params;
  const provider = connectorProviderSchema.safeParse(rawProvider);
  if (!provider.success) {
    return Response.json({ error: "Unsupported provider" }, { status: 404 });
  }

  const response = await requestWithSession(
    `/v1/sources/${provider.data}/sync`,
    { method: "POST" },
  );
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}
