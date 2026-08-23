/**
 * ASO 100-Character Keyword Optimizer Utility
 *
 * Apple App Store keyword field rules:
 * 1. Exactly 100 characters maximum (including commas).
 * 2. Words should be separated by commas, NOT spaces (spaces waste character allowance).
 * 3. Do not duplicate words already in the App Title or Subtitle (Apple indexes them automatically).
 * 4. Remove duplicate terms, punctuation, and unnecessary stop words.
 * 5. Numbers can be digits to save space.
 */

export interface KeywordOptimizationResult {
  /** The final optimized comma-separated keyword string. */
  optimized: string;
  /** Character count of the optimized string. */
  charCount: number;
  /** Maximum allowed characters (100). */
  maxChars: number;
  /** Characters remaining (can be negative if over limit). */
  remainingChars: number;
  /** Characters saved by removing unnecessary spaces and duplicates. */
  charactersSaved: number;
  /** List of individual keywords included in the result. */
  keywordsIncluded: string[];
  /** Words that were truncated because they exceeded the 100-char cap. */
  keywordsTruncated: string[];
  /** Words removed because they were duplicates. */
  duplicateWordsRemoved: string[];
  /** Words identified as already appearing in the provided title or subtitle. */
  redundantWordsRemoved: string[];
}

/**
 * Normalizes an individual word: lowercase, trim punctuation.
 */
export function cleanWord(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "") // Keep letters, numbers, hyphens
    .replace(/\s+/g, " ");
}

/**
 * Splits raw input (which may contain commas, newlines, or spaces) into unique individual keyword tokens.
 */
export function extractKeywordTokens(rawInput: string | string[]): string[] {
  const rawArray = Array.isArray(rawInput) ? rawInput : rawInput.split(/[\n,]+/);
  const tokens: string[] = [];

  for (const chunk of rawArray) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const cleaned = cleanWord(trimmed);
    if (cleaned) {
      tokens.push(cleaned);
    }
  }

  return tokens;
}

/**
 * Extracts all unique words from a title and subtitle string for redundancy checking.
 */
export function extractMetadataWords(title?: string, subtitle?: string): Set<string> {
  const words = new Set<string>();
  const combined = `${title ?? ""} ${subtitle ?? ""}`.toLowerCase();
  const tokens = combined.split(/[\s,.:;!?'"()\-–—]+/);
  for (const t of tokens) {
    const cleaned = cleanWord(t);
    if (cleaned && cleaned.length > 1) {
      words.add(cleaned);
    }
  }
  return words;
}

export interface OptimizeOptions {
  /** Existing App Title to check for duplicate words. */
  appTitle?: string;
  /** Existing App Subtitle to check for duplicate words. */
  appSubtitle?: string;
  /** Strip spaces after commas (App Store standard best practice). Defaults to true. */
  stripSpaces?: boolean;
  /** Remove words that already exist in the App Title / Subtitle. Defaults to true. */
  removeTitleWords?: boolean;
  /** Max character limit (defaults to 100). */
  limit?: number;
}

/**
 * Optimizes a list of keywords or a raw text block into the most compact, effective 100-character App Store keyword string.
 */
export function optimizeKeywordField(
  rawInput: string | string[],
  options: OptimizeOptions = {},
): KeywordOptimizationResult {
  const {
    appTitle = "",
    appSubtitle = "",
    stripSpaces = true,
    removeTitleWords = true,
    limit = 100,
  } = options;

  const rawTokens = extractKeywordTokens(rawInput);
  const titleWords = removeTitleWords
    ? extractMetadataWords(appTitle, appSubtitle)
    : new Set<string>();

  const seen = new Set<string>();
  const duplicateWordsRemoved: string[] = [];
  const redundantWordsRemoved: string[] = [];
  const validKeywords: string[] = [];

  // Estimate raw characters before optimization (assuming standard comma+space formatting)
  let rawEstimatedChars = 0;
  for (const token of rawTokens) {
    rawEstimatedChars += token.length + 2; // token + ", "
  }

  for (const token of rawTokens) {
    const subWords = token.split(/\s+/).filter(Boolean);
    const tokenClean = subWords.join(stripSpaces ? "" : " ");

    if (!tokenClean) continue;

    if (seen.has(tokenClean)) {
      duplicateWordsRemoved.push(tokenClean);
      continue;
    }

    // Check if entire token or single word is in Title/Subtitle
    if (removeTitleWords && (titleWords.has(tokenClean) || (subWords.length === 1 && titleWords.has(subWords[0])))) {
      redundantWordsRemoved.push(tokenClean);
      continue;
    }

    seen.add(tokenClean);
    validKeywords.push(tokenClean);
  }

  const keywordsIncluded: string[] = [];
  const keywordsTruncated: string[] = [];
  let currentString = "";

  for (const kw of validKeywords) {
    const separator = currentString.length > 0 ? (stripSpaces ? "," : ", ") : "";
    const testString = `${currentString}${separator}${kw}`;

    if (testString.length <= limit) {
      currentString = testString;
      keywordsIncluded.push(kw);
    } else {
      keywordsTruncated.push(kw);
    }
  }

  const charCount = currentString.length;
  const remainingChars = limit - charCount;
  const charactersSaved = Math.max(0, rawEstimatedChars - charCount);

  return {
    optimized: currentString,
    charCount,
    maxChars: limit,
    remainingChars,
    charactersSaved,
    keywordsIncluded,
    keywordsTruncated,
    duplicateWordsRemoved,
    redundantWordsRemoved,
  };
}
