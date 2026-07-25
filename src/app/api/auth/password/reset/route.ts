import { backendRequest, relayBackendResponse } from "@/lib/backend";
import { z } from "zod";

const resetSchema = z.object({
  token: z.string().trim().min(40).max(128),
  newPassword: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid reset request" }, { status: 400 });
  }
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { error: "This reset link is invalid or expired" },
      { status: 400 },
    );
  }
  try {
    const response = await backendRequest("/v1/auth/password/reset", {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
    return relayBackendResponse(response);
  } catch {
    return Response.json(
      { error: "Password reset is temporarily unavailable" },
      { status: 503 },
    );
  }
}
