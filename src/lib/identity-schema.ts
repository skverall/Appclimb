import { z } from "zod";

import type { BackendIdentity } from "@/lib/backend";

export const backendIdentitySchema = z.object({
  userId: z.string().trim().min(1),
  email: z.email().trim().max(320),
  avatarKey: z.string().trim().min(1).optional(),
  workspaceId: z.string().trim().min(1),
  workspaceName: z.string().trim().min(1),
  role: z.string().trim().min(1),
  trialEndsAt: z.string().datetime({ offset: true }),
  subscriptionStatus: z.string().trim().min(1),
});

export function isBackendIdentity(
  value: unknown,
): value is BackendIdentity {
  return backendIdentitySchema.safeParse(value).success;
}
