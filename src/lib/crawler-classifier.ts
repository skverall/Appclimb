export type CrawlerCategory =
  | "ai_answer"
  | "search_index"
  | "model_training";

export interface CrawlerIdentity {
  provider: string;
  agent: string;
  category: CrawlerCategory;
}

const RULES: [string, CrawlerIdentity][] = [
  [
    "chatgpt-user",
    { provider: "ChatGPT", agent: "ChatGPT-User", category: "ai_answer" },
  ],
  [
    "claude-user",
    { provider: "Anthropic", agent: "Claude-User", category: "ai_answer" },
  ],
  [
    "perplexity-user",
    {
      provider: "Perplexity",
      agent: "Perplexity-User",
      category: "ai_answer",
    },
  ],
  [
    "oai-searchbot",
    {
      provider: "OpenAI",
      agent: "OAI-SearchBot",
      category: "search_index",
    },
  ],
  [
    "perplexitybot",
    {
      provider: "Perplexity",
      agent: "PerplexityBot",
      category: "search_index",
    },
  ],
  [
    "google-extended",
    {
      provider: "Google",
      agent: "Google-Extended",
      category: "model_training",
    },
  ],
  [
    "googlebot",
    { provider: "Google", agent: "Googlebot", category: "search_index" },
  ],
  [
    "bingbot",
    { provider: "Microsoft", agent: "Bingbot", category: "search_index" },
  ],
  [
    "applebot-extended",
    {
      provider: "Apple",
      agent: "Applebot-Extended",
      category: "model_training",
    },
  ],
  [
    "applebot",
    { provider: "Apple", agent: "Applebot", category: "search_index" },
  ],
  [
    "gptbot",
    { provider: "OpenAI", agent: "GPTBot", category: "model_training" },
  ],
  [
    "claudebot",
    {
      provider: "Anthropic",
      agent: "ClaudeBot",
      category: "model_training",
    },
  ],
  [
    "anthropic-ai",
    {
      provider: "Anthropic",
      agent: "anthropic-ai",
      category: "model_training",
    },
  ],
  [
    "ccbot",
    {
      provider: "Common Crawl",
      agent: "CCBot",
      category: "model_training",
    },
  ],
];

export function classifyCrawlerUserAgent(
  userAgent: string,
): CrawlerIdentity | null {
  const normalized = userAgent.toLowerCase();
  return (
    RULES.find(([needle]) => normalized.includes(needle))?.[1] ?? null
  );
}
