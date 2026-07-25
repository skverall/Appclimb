import { backendRequest, relayBackendResponse } from "@/lib/backend";
import { z } from "zod";

const forgotSchema = z.object({
  email: z.email().trim().max(320),
});

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid recovery request" }, { status: 400 });
  }
  const parsed = forgotSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: "Enter a valid email" }, { status: 400 });
  }
  try {
    const response = await backendRequest("/v1/auth/password/forgot", {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
    return relayBackendResponse(response);
  } catch {
    return Response.json(
      { error: "Account recovery is temporarily unavailable" },
      { status: 503 },
    );
  }
}
