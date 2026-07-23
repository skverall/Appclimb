import {
  relayBackendResponse,
  requestWithSession,
} from "@/lib/backend";
import {
  connectorCredentialsSchema,
  connectorProviderSchema,
} from "@/lib/validation";

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider: rawProvider } = await context.params;
  const provider = connectorProviderSchema.safeParse(rawProvider);
  const body = connectorCredentialsSchema.safeParse(await request.json());

  if (
    !provider.success ||
    !body.success ||
    body.data.provider !== provider.data
  ) {
    return Response.json({ error: "Invalid connection request" }, { status: 400 });
  }

  const response = await requestWithSession(
    `/v1/sources/${provider.data}`,
    {
      method: "PUT",
      body: JSON.stringify({ credentials: body.data.credentials }),
    },
  );
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider: rawProvider } = await context.params;
  const provider = connectorProviderSchema.safeParse(rawProvider);
  if (!provider.success) {
    return Response.json({ error: "Unsupported provider" }, { status: 404 });
  }
  const response = await requestWithSession(
    `/v1/sources/${provider.data}`,
    { method: "DELETE" },
  );
  if (!response) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }
  return relayBackendResponse(response);
}
