import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import { AgentConsent, AgentSignIn } from "@/components/agent-consent";
import { MarketingShell } from "@/components/marketing-shell";
import { clientDisplayName, getAuthorizationRequest } from "@/lib/agent-auth";
import { SESSION_COOKIE, getSessionByToken } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connect an AI app",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ request?: string; error?: string }>;

const ERRORS: Record<string, { title: string; body: string }> = {
  unknown_client: {
    title: "This AI app isn’t registered",
    body: "The connection request came from an app AppClimb doesn’t recognize. Remove AppClimb from the app and add it again.",
  },
  bad_redirect: {
    title: "This connection request looks wrong",
    body: "The app asked to send you back to an address it didn’t register, so AppClimb stopped here to keep your account safe.",
  },
  expired: {
    title: "This connection request expired",
    body: "Requests are valid for 30 minutes. Start connecting again from your AI app.",
  },
  unavailable: {
    title: "Connecting is unavailable right now",
    body: "AppClimb accounts are offline for a moment. Try again shortly.",
  },
};

function returnHost(redirectUri: string): string {
  try {
    const url = new URL(redirectUri);
    if (url.protocol === "http:") return "the app on this computer";
    return url.protocol === "https:" ? url.host : url.protocol.replace(/:$/u, "");
  } catch {
    return "your AI app";
  }
}

function ErrorCard({ code }: { code: string }) {
  const copy = ERRORS[code] ?? ERRORS.expired;
  return (
    <div className="agent-consent-card">
      <h1>{copy.title}</h1>
      <p>{copy.body}</p>
      <Link href="/connect" className="unsub-link">
        How to connect AppClimb
      </Link>
    </div>
  );
}

/** Sign-in and consent step of the OAuth flow behind /mcp (ADR 0008). */
export default async function ConsentPage({ searchParams }: { searchParams: SearchParams }) {
  const { request: requestId = "", error } = await searchParams;
  const db = getDb();
  let body: React.ReactNode;

  if (error || !db) {
    body = <ErrorCard code={error ?? "unavailable"} />;
  } else {
    const pending = await getAuthorizationRequest(db, requestId);
    if (!pending) {
      body = <ErrorCard code="expired" />;
    } else {
      const clientName = (await clientDisplayName(db, pending.clientId)) ?? "Your AI app";
      const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
      const session = token ? await getSessionByToken(db, token) : null;
      body = session ? (
        <AgentConsent
          requestId={pending.id}
          clientName={clientName}
          returnTo={returnHost(pending.redirectUri)}
          email={session.user.email}
        />
      ) : (
        <AgentSignIn nextPath={`/oauth/consent?request=${encodeURIComponent(pending.id)}`} clientName={clientName} />
      );
    }
  }

  return (
    <MarketingShell>
      <main className="marketing-container agent-consent">{body}</main>
    </MarketingShell>
  );
}
