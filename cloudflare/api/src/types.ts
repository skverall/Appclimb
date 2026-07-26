import type { Context } from "hono";

export interface AuthContext {
  userId: string;
  workspaceId: string;
  role: string;
}

export interface Identity {
  userId: string;
  email: string;
  avatarKey: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
  trialEndsAt: string;
  subscriptionStatus: string;
}

export interface Workspace {
  id: string;
  name: string;
  subscriptionStatus: string;
  trialEndsAt: string;
  entitlementEndsAt?: string;
  defaultAppId: string;
  defaultAppName: string;
  defaultStorefront: string;
}

export type AppEnvironment = {
  Bindings: Cloudflare.Env;
  Variables: {
    auth: AuthContext;
    requestId: string;
  };
};

export type AppContext = Context<AppEnvironment>;
