import type { Metadata } from "next";

import { AiChatConversation } from "@/components/ai-chat-conversation";
import { JsonLd } from "@/components/json-ld";
import { MarketingShell } from "@/components/marketing-shell";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "ASO Assistant — App Store keyword chat",
  description:
    "An ASO assistant that checks Apple’s own popularity data before it suggests keywords, then writes app names, subtitles, and 100-character keyword fields with live character counts. 5 messages/day free, 200 on Pro.",
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
            "AI App Store optimization assistant grounded in Apple Ads popularity data: keyword ideas, rising searches, and metadata that fits App Store limits.",
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
