"use client";

import type { ReactNode } from "react";

/**
 * Lightweight, safe chat markdown renderer (React text nodes only — no HTML).
 * Supports: paragraphs, -/* lists, 1. lists, **bold**, *italic*, `code`, # headings.
 */

function formatInline(text: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/gu;
  const parts = text.split(pattern);
  return parts.filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (
      part.startsWith("*") &&
      part.endsWith("*") &&
      part.length > 2 &&
      !part.startsWith("**")
    ) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    return <span key={index}>{part}</span>;
  });
}

function normalizeMarkdown(source: string): string {
  return source
    .replace(/\r\n/gu, "\n")
    .replace(/^\s{0,3}#{1,6}\s*$/gmu, "")
    .replace(/^\s*[•·]\s+/gmu, "- ")
    .trim();
}

type Block =
  | { type: "p"; text: string }
  | { type: "h"; level: number; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

function parseBlocks(source: string): Block[] {
  const lines = normalizeMarkdown(source).split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(" ").trim();
    if (text) blocks.push({ type: "p", text });
    paragraph = [];
  };

  const flushList = () => {
    if (!list || list.items.length === 0) {
      list = null;
      return;
    }
    blocks.push({ type: list.type, items: list.items });
    list = null;
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/u);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        type: "h",
        level: heading[1].length,
        text: heading[2].trim(),
      });
      continue;
    }

    const ul = trimmed.match(/^[-*]\s+(.+)$/u);
    if (ul) {
      flushParagraph();
      if (!list || list.type !== "ul") {
        flushList();
        list = { type: "ul", items: [] };
      }
      list.items.push(ul[1].trim());
      continue;
    }

    const ol = trimmed.match(/^\d+[.)]\s+(.+)$/u);
    if (ol) {
      flushParagraph();
      if (!list || list.type !== "ol") {
        flushList();
        list = { type: "ol", items: [] };
      }
      list.items.push(ol[1].trim());
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks;
}

export function ChatMarkdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  if (blocks.length === 0) {
    return <p className="chat-md-p">{formatInline(text)}</p>;
  }

  return (
    <div className="chat-md">
      {blocks.map((block, index) => {
        if (block.type === "p") {
          return (
            <p key={index} className="chat-md-p">
              {formatInline(block.text)}
            </p>
          );
        }
        if (block.type === "h") {
          const Tag = block.level <= 2 ? "h4" : "h5";
          return (
            <Tag key={index} className="chat-md-h">
              {formatInline(block.text)}
            </Tag>
          );
        }
        if (block.type === "ul") {
          return (
            <ul key={index} className="chat-md-list">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{formatInline(item)}</li>
              ))}
            </ul>
          );
        }
        return (
          <ol key={index} className="chat-md-list chat-md-list--ol">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{formatInline(item)}</li>
            ))}
          </ol>
        );
      })}
    </div>
  );
}
