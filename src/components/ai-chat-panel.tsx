"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";

import { AiChatConversation } from "@/components/ai-chat-conversation";

export function AiChatPanel() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="ai-chat-fab"
        onClick={() => setOpen(true)}
        aria-label="Open ASO assistant"
      >
        <MessageCircle size={20} aria-hidden="true" />
        <span>ASO AI</span>
      </button>

      {open && (
        <button
          type="button"
          className="ai-chat-backdrop"
          aria-label="Close assistant"
          onClick={() => setOpen(false)}
        />
      )}

      <section
        className={`ai-chat-panel${open ? " is-open" : ""}`}
        aria-hidden={!open}
        aria-label="AppClimb ASO assistant popup"
      >
        {open && (
          <AiChatConversation
            variant="panel"
            onClose={() => setOpen(false)}
          />
        )}
      </section>
    </>
  );
}
