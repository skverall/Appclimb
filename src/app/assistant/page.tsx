import type { Metadata } from "next";

import { AiChatConversation } from "@/components/ai-chat-conversation";
import { MarketingShell } from "@/components/marketing-shell";

export const metadata: Metadata = {
  title: "ASO Assistant — free App Store keyword chat",
  description:
    "Chat with AppClimb’s ASO assistant (DeepSeek V4 Flash): keyword ideas, estimated popularity/difficulty guidance, and listing tips — free, with local context only.",
  alternates: {
    canonical: "/assistant",
  },
};

export default function AssistantPage() {
  return (
    <MarketingShell hideAiFab hideFooter>
      <main className="ai-chat-page">
        <div className="ai-chat-page-frame">
          <AiChatConversation variant="page" />
        </div>
      </main>
    </MarketingShell>
  );
}
