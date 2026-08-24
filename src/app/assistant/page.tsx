import type { Metadata } from "next";

import { AiChatConversation } from "@/components/ai-chat-conversation";
import { JsonLd } from "@/components/json-ld";
import { MarketingShell } from "@/components/marketing-shell";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "ASO Assistant — App Store keyword chat",
  description:
    "Chat with AppClimb’s ASO assistant (DeepSeek V4 Flash): keyword ideas, estimated popularity/difficulty guidance, and listing tips — 5 messages/day on the free plan, 200 on Pro.",
  alternates: {
    canonical: "/assistant",
  },
};

export default function AssistantPage() {
  return (
    <MarketingShell hideAiFab hideFooter>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "AppClimb ASO Assistant",
          url: absoluteUrl("/assistant"),
          description:
            "AI-powered App Store optimization assistant for keyword ideas, listing copy rewrites, and rank optimization.",
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Any",
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: SITE_NAME,
              item: absoluteUrl("/"),
            },
            {
              "@type": "ListItem",
              position: 2,
              name: "ASO Assistant",
              item: absoluteUrl("/assistant"),
            },
          ],
        }}
      />
      <main className="ai-chat-page">
        <AiChatConversation variant="page" />
      </main>
    </MarketingShell>
  );
}
