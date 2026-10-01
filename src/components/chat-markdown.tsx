"use client";

import type { ReactNode } from "react";

import { MetadataCard } from "@/components/ai-chat-cards";
import { metadataFieldFor } from "@/lib/ai-metadata";

/**
 * Lightweight, safe chat markdown renderer (React text nodes only — no HTML).
 * Supports paragraphs, -/* and 1. lists, ## headings, tables, **bold**,
 * *italic*, `code`, and fenced blocks. Fenced `title` / `subtitle` /
 * `keywords` blocks become metadata cards with a character check; the
 * `followups` block is hidden (the chat shows it as buttons).
 */

export interface ChatMarkdownOptions {
  /** Link for a bold keyword (lowercase, short); null keeps it plain bold. */
  keywordHref?: (term: string) => string | null;
  /**
   * Keywords known to be real (tracked or from Apple data). A single bold
   * word links only when it is one of these, so emphasis like **no** stays
   * plain; phrases of 2–5 words always link.
   */
  knownTerms?: ReadonlySet<string>;
  /** The tracked app's name, for metadata checks. */
  appName?: string;
}

const KEYWORD_LIKE = /^[\p{Ll}\p{N}][\p{Ll}\p{N}'&.+-]*(?: [\p{Ll}\p{N}'&.+-]+){0,4}$/u;

function formatInline(text: string, options: ChatMarkdownOptions): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/gu;
  const parts = text.split(pattern);
  return parts.filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      const inner = part.slice(2, -2);
      const linkable =
        inner.length <= 40 &&
        KEYWORD_LIKE.test(inner) &&
        (inner.includes(" ") || Boolean(options.knownTerms?.has(inner)));
      const href = linkable ? options.keywordHref?.(inner) ?? null : null;
      return href ? (
        <a key={index} className="chat-md-kw" href={href} title={`Open “${inner}” in the Keyword Explorer`}>
          {inner}
        </a>
      ) : (
        <strong key={index}>{inner}</strong>
      );
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

type Block =
  | { type: "p"; text: string }
  | { type: "h"; level: number; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "fence"; lang: string; text: string }
  | { type: "table"; head: string[]; rows: string[][] };

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .map((cell) => cell.trim());
}

const TABLE_RULE = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/u;

export function parseBlocks(source: string): Block[] {
  const lines = source
    .replace(/\r\n/gu, "\n")
    .replace(/^\s{0,3}#{1,6}\s*$/gmu, "")
    .replace(/^\s*[•·]\s+/gmu, "- ")
    .split("\n");
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
    if (list && list.items.length > 0) blocks.push({ type: list.type, items: list.items });
    list = null;
  };
  const flush = () => {
    flushParagraph();
    flushList();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();

    const fence = trimmed.match(/^```\s*([\w-]*)\s*$/u);
    if (fence) {
      flush();
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/u.test(lines[index].trim())) {
        body.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: "fence", lang: fence[1].toLowerCase(), text: body.join("\n").trim() });
      continue;
    }

    if (!trimmed) {
      flush();
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/u.test(trimmed)) {
      flush();
      continue;
    }

    // A table: a run of "|"-rows. The "|---|" rule under the header is
    // optional — models sometimes leave it out.
    const next = lines[index + 1]?.trim() ?? "";
    if (trimmed.startsWith("|") && splitRow(trimmed).length >= 2 && next.startsWith("|")) {
      flush();
      const head = splitRow(trimmed);
      const rows: string[][] = [];
      index += TABLE_RULE.test(next) ? 2 : 1;
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        if (!TABLE_RULE.test(lines[index].trim())) rows.push(splitRow(lines[index]));
        index += 1;
      }
      index -= 1;
      blocks.push({ type: "table", head, rows });
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/u);
    if (heading) {
      flush();
      blocks.push({ type: "h", level: heading[1].length, text: heading[2].replace(/\*\*/gu, "").trim() });
      continue;
    }

    const ul = trimmed.match(/^[-*+]\s+(.+)$/u);
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

  flush();
  return blocks;
}

export function ChatMarkdown({
  text,
  keywordHref,
  knownTerms,
  appName,
}: { text: string } & ChatMarkdownOptions) {
  const options = { keywordHref, knownTerms, appName };
  const blocks = parseBlocks(text);
  if (blocks.length === 0) {
    return <p className="chat-md-p">{formatInline(text, options)}</p>;
  }

  return (
    <div className="chat-md">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "p":
            return (
              <p key={index} className="chat-md-p">
                {formatInline(block.text, options)}
              </p>
            );
          case "h": {
            const Tag = block.level <= 2 ? "h4" : "h5";
            return (
              <Tag key={index} className="chat-md-h">
                {formatInline(block.text, options)}
              </Tag>
            );
          }
          case "ul":
            return (
              <ul key={index} className="chat-md-list">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{formatInline(item, options)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={index} className="chat-md-list chat-md-list--ol">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{formatInline(item, options)}</li>
                ))}
              </ol>
            );
          case "table":
            return (
              <div key={index} className="chat-md-table-wrap">
                <table className="chat-md-table">
                  <thead>
                    <tr>
                      {block.head.map((cell, cellIndex) => (
                        <th key={cellIndex}>{formatInline(cell, options)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {block.head.map((_, cellIndex) => (
                          <td key={cellIndex}>{formatInline(row[cellIndex] ?? "", options)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "fence": {
            if (block.lang === "followups") return null;
            const field = metadataFieldFor(block.lang);
            if (field && block.text) {
              return <MetadataCard key={index} field={field} text={block.text} appName={appName} />;
            }
            return block.text ? (
              <pre key={index} className="chat-md-pre">
                <code>{block.text}</code>
              </pre>
            ) : null;
          }
        }
      })}
    </div>
  );
}
