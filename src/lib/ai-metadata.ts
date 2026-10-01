// Checks for the copy-ready metadata blocks the assistant writes (title,
// subtitle, keyword field): character count against the App Store limit and
// the mistakes that waste indexing room.

import { METADATA_LIMITS, type MetadataField } from "@/lib/ai-chat";
import { cleanWord, extractMetadataWords, optimizeKeywordField } from "@/lib/aso-optimizer";

export interface MetadataCheck {
  field: MetadataField;
  text: string;
  length: number;
  limit: number;
  /** Plain-language problems, worst first. */
  issues: string[];
  /** A corrected keyword field, when one exists and differs. */
  fixed: string | null;
}

const FIELD_ALIASES: Record<string, MetadataField> = {
  title: "title",
  name: "title",
  "app-name": "title",
  subtitle: "subtitle",
  keywords: "keywords",
  keyword: "keywords",
  "keyword-field": "keywords",
};

/** The metadata field a fenced block's language tag stands for, if any. */
export function metadataFieldFor(lang: string): MetadataField | null {
  return FIELD_ALIASES[lang.trim().toLowerCase()] ?? null;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function checkMetadata(
  field: MetadataField,
  rawText: string,
  options: { appName?: string } = {},
): MetadataCheck {
  const text = rawText.replace(/\s*\n\s*/gu, field === "keywords" ? "," : " ").trim();
  const limit = METADATA_LIMITS[field];
  const length = [...text].length;
  const issues: string[] = [];
  if (length > limit) issues.push(`${plural(length - limit, "character")} over the ${limit}-character limit`);

  let fixed: string | null = null;
  if (field === "keywords") {
    const spaces = (text.match(/,\s+/gu) ?? []).reduce((sum, match) => sum + match.length - 1, 0);
    if (spaces > 0) issues.push(`Spaces after commas waste ${plural(spaces, "character")}`);
    const terms = text.split(",").map((term) => term.trim()).filter(Boolean);
    const words = terms.flatMap((term) => term.split(/\s+/u)).map(cleanWord).filter(Boolean);
    const seen = new Set<string>();
    const repeats = new Set<string>();
    for (const word of words) {
      if (seen.has(word)) repeats.add(word);
      seen.add(word);
    }
    if (repeats.size > 0) issues.push(`Repeats ${[...repeats].slice(0, 4).join(", ")}`);
    if (options.appName) {
      const inName = extractMetadataWords(options.appName);
      const overlap = [...seen].filter((word) => inName.has(word));
      if (overlap.length > 0) {
        issues.push(`Already in your app name: ${overlap.slice(0, 4).join(", ")}`);
      }
    }
    if (terms.some((term) => /\s/u.test(term))) {
      issues.push("Phrases cost spaces — Apple combines single words on its own");
    }
    const optimized = optimizeKeywordField(text, { appTitle: options.appName ?? "" }).optimized;
    fixed = optimized && optimized !== text ? optimized : null;
  } else if (field === "subtitle" && options.appName) {
    const inName = extractMetadataWords(options.appName);
    const overlap = [...extractMetadataWords(text)].filter((word) => inName.has(word));
    if (overlap.length > 0) issues.push(`Repeats a word from your app name: ${overlap.slice(0, 3).join(", ")}`);
  }
  return { field, text, length, limit, issues, fixed };
}
