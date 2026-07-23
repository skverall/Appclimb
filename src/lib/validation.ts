import { z } from "zod";

const nonEmpty = z.string().trim().min(1).max(12000);

export const connectorProviderSchema = z.enum([
  "app-store-connect",
  "revenuecat",
  "posthog",
  "superwall",
]);

export const connectorCredentialsSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("app-store-connect"),
    credentials: z.object({
      appId: nonEmpty,
      issuerId: nonEmpty,
      keyId: nonEmpty,
      privateKey: nonEmpty,
    }),
  }),
  z.object({
    provider: z.literal("revenuecat"),
    credentials: z.object({
      apiKey: nonEmpty,
      projectId: nonEmpty,
    }),
  }),
  z.object({
    provider: z.literal("posthog"),
    credentials: z.object({
      personalApiKey: nonEmpty,
      projectId: nonEmpty,
      host: z.url().max(300),
    }),
  }),
  z.object({
    provider: z.literal("superwall"),
    credentials: z.object({
      apiKey: nonEmpty,
      projectId: nonEmpty,
      applicationId: nonEmpty,
    }),
  }),
]);

export const authFormSchema = z.object({
  email: z.email().trim().max(320),
  password: z.string().min(8).max(128),
});
