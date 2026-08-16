"use client";

import { MessageSquare, Plus, Trash2 } from "lucide-react";

import type { AiConversationSummary } from "@/lib/ai-chat-client";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round(
    (startOfToday.getTime() - day.getTime()) / 86_400_000,
  );
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The past-conversation list, shared by the full-page sidebar and the popup
 * popover. Renders rows for every conversation; placement is CSS-only.
 */
export function AiChatHistory({
  conversations,
  activeId,
  disabled = false,
  onSelect,
  onNew,
  onDelete,
}: {
  conversations: AiConversationSummary[];
  activeId: string | null;
  disabled?: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="ai-chat-history">
      <button
        type="button"
        className="ai-chat-new-button"
        onClick={onNew}
        disabled={disabled}
        title="Start a new chat session"
      >
        <Plus size={16} aria-hidden="true" />
        <span>New chat</span>
      </button>

      <div className="ai-chat-history-header-label">
        <span>Recent chats</span>
      </div>

      {conversations.length === 0 ? (
        <p className="ai-chat-history-empty">No past chats yet.</p>
      ) : (
        <ul className="ai-chat-history-list">
          {conversations.map((conversation) => (
            <li key={conversation.id} className="ai-chat-history-row">
              <button
                type="button"
                className={`ai-chat-history-select${
                  conversation.id === activeId ? " is-active" : ""
                }`}
                onClick={() => onSelect(conversation.id)}
                disabled={disabled}
                aria-current={
                  conversation.id === activeId ? "true" : undefined
                }
                title={conversation.title}
              >
                <MessageSquare size={14} className="ai-chat-row-icon" aria-hidden="true" />
                <div className="ai-chat-history-info">
                  <span className="ai-chat-history-title">
                    {conversation.title}
                  </span>
                  <span className="ai-chat-history-meta">
                    {formatWhen(conversation.updatedAt)}
                    {conversation.messageCount > 0
                      ? ` · ${conversation.messageCount} msgs`
                      : ""}
                  </span>
                </div>
              </button>
              <button
                type="button"
                className="ai-chat-history-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(conversation.id);
                }}
                disabled={disabled}
                aria-label={`Delete conversation: ${conversation.title}`}
                title="Delete conversation"
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
