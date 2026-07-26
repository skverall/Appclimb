import type { SourceProvider } from "@/lib/contracts";

export type ConnectableProvider = Exclude<SourceProvider, "appclimb-rank">;

export interface ConnectionField {
  name: string;
  label: string;
  placeholder: string;
  help: string;
  helpLabel: string;
  helpUrl: string;
  secret?: boolean;
  multiline?: boolean;
  defaultValue?: string;
}

export interface SourceSetup {
  steps: [string, string, string];
  fields: ConnectionField[];
  oauth?: {
    label: string;
    description: string;
  };
}

export const SOURCE_SETUP: Record<ConnectableProvider, SourceSetup> = {
  "app-store-connect": {
    steps: [
      "Open Users and Access → Integrations in App Store Connect.",
      "Create a team key with the Sales and Reports role, then download the .p8 file once.",
      "Paste the identifiers below. If reports were never initialized, an Admin must request them once; Apple can take 1–2 days to prepare the first data.",
    ],
    fields: [
      {
        name: "appId",
        label: "Apple app ID",
        placeholder: "1234567890",
        help: "The numeric ID shown beside your app in App Store Connect.",
        helpLabel: "Open My Apps",
        helpUrl: "https://appstoreconnect.apple.com/apps",
      },
      {
        name: "issuerId",
        label: "Issuer ID",
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        help: "Shown at the top of Users and Access → Integrations.",
        helpLabel: "Find Issuer ID",
        helpUrl: "https://appstoreconnect.apple.com/access/integrations/api",
      },
      {
        name: "keyId",
        label: "Key ID",
        placeholder: "ABC123DEFG",
        help: "The short ID displayed next to the API key you created.",
        helpLabel: "Find Key ID",
        helpUrl: "https://appstoreconnect.apple.com/access/integrations/api",
      },
      {
        name: "privateKey",
        label: "Private key (.p8)",
        placeholder: "-----BEGIN PRIVATE KEY-----",
        help: "Apple lets you download this file only once. Open it as text and paste the full value.",
        helpLabel: "Apple key guide",
        helpUrl:
          "https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api",
        secret: true,
        multiline: true,
      },
    ],
  },
  revenuecat: {
    steps: [
      "Open Project settings → API keys in RevenueCat.",
      "Create a v2 secret key with Charts read access only.",
      "Copy the Project ID from General settings and verify.",
    ],
    oauth: {
      label: "RevenueCat OAuth",
      description:
        "OAuth is supported by RevenueCat, but AppClimb must be registered with RevenueCat before this safer option can be enabled.",
    },
    fields: [
      {
        name: "apiKey",
        label: "V2 secret API key",
        placeholder: "sk_…",
        help: "Create a v2 key with the smallest read-only Charts permissions.",
        helpLabel: "RevenueCat API keys",
        helpUrl: "https://www.revenuecat.com/docs/projects/authentication",
        secret: true,
      },
      {
        name: "projectId",
        label: "Project ID",
        placeholder: "proj…",
        help: "Shown under Project settings → General.",
        helpLabel: "Find Project ID",
        helpUrl: "https://www.revenuecat.com/docs/projects/overview",
      },
    ],
  },
  posthog: {
    steps: [
      "Authorize AppClimb with read-only project and query scopes.",
      "Choose the PostHog project you want to diagnose.",
      "Confirm the activation and session event names, then connect.",
    ],
    oauth: {
      label: "Continue with PostHog",
      description:
        "Recommended. Sign in at PostHog and grant scoped read-only access without copying a personal key.",
    },
    fields: [
      {
        name: "personalApiKey",
        label: "Personal API key",
        placeholder: "phx_…",
        help: "Fallback only. Limit the key to project and query read scopes.",
        helpLabel: "Create personal API key",
        helpUrl: "https://us.posthog.com/settings/user-api-keys",
        secret: true,
      },
      {
        name: "projectId",
        label: "Project ID",
        placeholder: "12345",
        help: "The numeric project ID shown in Project settings.",
        helpLabel: "Open Project settings",
        helpUrl: "https://us.posthog.com/settings/project",
      },
      {
        name: "host",
        label: "PostHog host",
        placeholder: "https://us.posthog.com",
        help: "Use the region shown in your PostHog dashboard URL.",
        helpLabel: "PostHog API regions",
        helpUrl: "https://posthog.com/docs/api",
        defaultValue: "https://us.posthog.com",
      },
      {
        name: "activationEvent",
        label: "Activation event · unique users",
        placeholder: "app_activated",
        help: "The event that best represents first product value.",
        helpLabel: "How to choose activation",
        helpUrl: "https://posthog.com/docs/product-analytics/activation",
        defaultValue: "app_activated",
      },
      {
        name: "sessionEvent",
        label: "Session event · unique users",
        placeholder: "$session_start",
        help: "Used for active-user context alongside activation.",
        helpLabel: "PostHog events",
        helpUrl: "https://posthog.com/docs/data/events",
        defaultValue: "$session_start",
      },
    ],
  },
  superwall: {
    steps: [
      "Open Settings → API Keys in Superwall.",
      "Create an organization key scoped to analytics read access.",
      "Copy the project and application IDs, then verify.",
    ],
    fields: [
      {
        name: "apiKey",
        label: "Scoped organization API key",
        placeholder: "Secret token",
        help: "Use an organization key with data read access, not the public SDK key.",
        helpLabel: "Create scoped API key",
        helpUrl:
          "https://superwall.com/docs/dashboard/dashboard-settings/overview-settings-access-controls",
        secret: true,
      },
      {
        name: "projectId",
        label: "Project ID",
        placeholder: "project ID",
        help: "Shown in the Superwall project URL and project settings.",
        helpLabel: "Open Superwall",
        helpUrl: "https://superwall.com/dashboard",
      },
      {
        name: "applicationId",
        label: "Application ID",
        placeholder: "application ID",
        help: "Choose the iOS application inside the selected project.",
        helpLabel: "Superwall API reference",
        helpUrl: "https://api.superwall.com/docs",
      },
    ],
  },
};

export function connectionFields(provider: ConnectableProvider) {
  return SOURCE_SETUP[provider].fields;
}
