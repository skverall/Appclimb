import type {
  AcquisitionBreakdownRow,
  AcquisitionSeriesPoint,
  AcquisitionSnapshot,
  CrawlerCategory,
} from "@/lib/acquisition";

export const demoAcquisitionSnapshot: AcquisitionSnapshot = {
  mode: "demo",
  generatedAt: "2026-07-25T14:42:00.000Z",
  windowDays: 7,
  property: {
    id: "demo-web-property",
    name: "Car Dealer Tracker",
    domain: "cardealertracker.app",
    tokenVersion: 1,
    retentionDays: 90,
    createdAt: "2026-06-01T10:00:00.000Z",
  },
  totals: {
    visitors: 1248,
    sessions: 1391,
    pageviews: 3284,
    engaged: 712,
    converted: 84,
    online: 11,
    averageSessionSeconds: 93,
  },
  series: [
    { date: "2026-07-19", visitors: 126, engaged: 68, converted: 7 },
    { date: "2026-07-20", visitors: 154, engaged: 84, converted: 9 },
    { date: "2026-07-21", visitors: 139, engaged: 76, converted: 8 },
    { date: "2026-07-22", visitors: 187, engaged: 109, converted: 13 },
    { date: "2026-07-23", visitors: 169, engaged: 98, converted: 11 },
    { date: "2026-07-24", visitors: 218, engaged: 123, converted: 15 },
    { date: "2026-07-25", visitors: 255, engaged: 154, converted: 21 },
  ],
  channels: [
    {
      key: "direct",
      label: "Direct",
      detail: "direct / none",
      visitors: 512,
      engagedRate: 0.641,
      conversions: 31,
    },
    {
      key: "organic-search",
      label: "Organic Search",
      detail: "Google, Bing, Yahoo",
      visitors: 428,
      engagedRate: 0.61,
      conversions: 29,
    },
    {
      key: "social",
      label: "Social",
      detail: "X, Instagram, LinkedIn",
      visitors: 162,
      engagedRate: 0.481,
      conversions: 9,
    },
    {
      key: "ai-referral",
      label: "AI Referral",
      detail: "ChatGPT, Perplexity, Claude",
      visitors: 88,
      engagedRate: 0.545,
      conversions: 8,
    },
    {
      key: "campaigns",
      label: "Campaigns",
      detail: "email, ads, newsletter",
      visitors: 58,
      engagedRate: 0.5,
      conversions: 7,
    },
  ],
  referrers: [
    {
      key: "google.com",
      label: "google.com",
      detail: "Organic Search",
      visitors: 332,
      engagedRate: 0.63,
      conversions: 24,
    },
    {
      key: "x.com",
      label: "x.com",
      detail: "Social",
      visitors: 91,
      engagedRate: 0.47,
      conversions: 4,
    },
    {
      key: "chatgpt.com",
      label: "chatgpt.com",
      detail: "AI Referral",
      visitors: 54,
      engagedRate: 0.57,
      conversions: 6,
    },
    {
      key: "instagram.com",
      label: "instagram.com",
      detail: "Social",
      visitors: 43,
      engagedRate: 0.51,
      conversions: 3,
    },
    {
      key: "perplexity.ai",
      label: "perplexity.ai",
      detail: "AI Referral",
      visitors: 23,
      engagedRate: 0.52,
      conversions: 2,
    },
    {
      key: "reddit.com",
      label: "reddit.com",
      detail: "Social",
      visitors: 37,
      engagedRate: 0.44,
      conversions: 2,
    },
    {
      key: "news.ycombinator.com",
      label: "news.ycombinator.com",
      detail: "Referral",
      visitors: 31,
      engagedRate: 0.68,
      conversions: 4,
    },
    {
      key: "linkedin.com",
      label: "linkedin.com",
      detail: "Social",
      visitors: 28,
      engagedRate: 0.5,
      conversions: 2,
    },
    {
      key: "bing.com",
      label: "bing.com",
      detail: "Organic Search",
      visitors: 24,
      engagedRate: 0.58,
      conversions: 2,
    },
    {
      key: "producthunt.com",
      label: "producthunt.com",
      detail: "Referral",
      visitors: 19,
      engagedRate: 0.61,
      conversions: 2,
    },
    {
      key: "claude.ai",
      label: "claude.ai",
      detail: "AI Referral",
      visitors: 11,
      engagedRate: 0.55,
      conversions: 1,
    },
  ],
  campaigns: [
    {
      key: "newsletter_jun24",
      label: "newsletter_jun24",
      detail: "email",
      visitors: 38,
      engagedRate: 0.55,
      conversions: 5,
    },
    {
      key: "launch_x",
      label: "launch_x",
      detail: "paid_social",
      visitors: 20,
      engagedRate: 0.4,
      conversions: 2,
    },
  ],
  utmSources: [
    {
      key: "newsletter",
      label: "newsletter",
      detail: "email",
      visitors: 38,
      engagedRate: 0.55,
      conversions: 5,
    },
    {
      key: "x",
      label: "x",
      detail: "paid_social",
      visitors: 20,
      engagedRate: 0.4,
      conversions: 2,
    },
  ],
  landingPages: [
    { path: "/", visitors: 402, conversionRate: 0.075 },
    { path: "/pricing", visitors: 186, conversionRate: 0.091 },
    { path: "/features", visitors: 148, conversionRate: 0.068 },
    { path: "/blog/best-crm-2024", visitors: 92, conversionRate: 0.043 },
    { path: "/about", visitors: 67, conversionRate: 0.052 },
    { path: "/integrations", visitors: 54, conversionRate: 0.061 },
    { path: "/blog/dealer-inventory-sync", visitors: 48, conversionRate: 0.038 },
    { path: "/changelog", visitors: 41, conversionRate: 0.029 },
    { path: "/docs/api/overview", visitors: 36, conversionRate: 0.055 },
    { path: "/compare/vs-spreadsheets", visitors: 33, conversionRate: 0.084 },
    { path: "/blog/lead-response-time", visitors: 27, conversionRate: 0.033 },
    { path: "/security", visitors: 21, conversionRate: 0.047 },
  ],
  visitors: [
    {
      id: "demo-coral-otter",
      alias: "Coral Otter",
      countryCode: "US",
      browser: "Chrome",
      os: "macOS",
      device: "Desktop",
      channel: "Organic Search",
      source: "Google",
      lastSeen: "2026-07-25T05:24:00.000Z",
      journey: ["/", "/features", "/pricing", "/checkout"],
      converted: true,
    },
    {
      id: "demo-sage-lynx",
      alias: "Sage Lynx",
      countryCode: "GB",
      browser: "Edge",
      os: "Windows",
      device: "Desktop",
      channel: "Direct",
      source: "Direct / none",
      lastSeen: "2026-07-25T04:58:00.000Z",
      journey: ["/", "/pricing", "/about"],
      converted: false,
    },
    {
      id: "demo-amber-falcon",
      alias: "Amber Falcon",
      countryCode: "CA",
      browser: "Safari",
      os: "iOS",
      device: "Mobile",
      channel: "AI Referral",
      source: "ChatGPT",
      lastSeen: "2026-07-25T04:41:00.000Z",
      journey: ["/features", "/pricing", "/checkout", "/success"],
      converted: true,
    },
    {
      id: "demo-indigo-fox",
      alias: "Indigo Fox",
      countryCode: "AU",
      browser: "Safari",
      os: "macOS",
      device: "Desktop",
      channel: "Social",
      source: "X",
      lastSeen: "2026-07-25T04:17:00.000Z",
      journey: ["/blog/best-crm-2024", "/", "/pricing"],
      converted: false,
    },
    {
      id: "demo-willow-deer",
      alias: "Willow Deer",
      countryCode: "DE",
      browser: "Chrome",
      os: "Android",
      device: "Mobile",
      channel: "Campaigns",
      source: "newsletter",
      lastSeen: "2026-07-25T03:45:00.000Z",
      journey: ["/", "/features", "/pricing"],
      converted: false,
    },
    {
      id: "demo-basalt-heron",
      alias: "Basalt Heron",
      countryCode: "SG",
      browser: "Chrome",
      os: "Windows",
      device: "Desktop",
      channel: "Referral",
      source: "news.ycombinator.com",
      lastSeen: "2026-07-25T03:12:00.000Z",
      journey: ["/blog/dealer-inventory-sync", "/", "/pricing", "/checkout"],
      converted: true,
    },
    {
      id: "demo-cobalt-marten",
      alias: "Cobalt Marten",
      countryCode: "FR",
      browser: "Firefox",
      os: "Linux",
      device: "Desktop",
      channel: "Organic Search",
      source: "Bing",
      lastSeen: "2026-07-25T02:48:00.000Z",
      journey: ["/docs/api/overview", "/integrations"],
      converted: false,
    },
    {
      id: "demo-russet-marlin",
      alias: "Russet Marlin",
      countryCode: "BR",
      browser: "Chrome",
      os: "Android",
      device: "Mobile",
      channel: "Social",
      source: "reddit.com",
      lastSeen: "2026-07-25T02:19:00.000Z",
      journey: ["/blog/best-crm-2024", "/features"],
      converted: false,
    },
    {
      id: "demo-slate-ibis",
      alias: "Slate Ibis",
      countryCode: "IN",
      browser: "Chrome",
      os: "Windows",
      device: "Desktop",
      channel: "AI Referral",
      source: "Perplexity",
      lastSeen: "2026-07-25T01:57:00.000Z",
      journey: ["/compare/vs-spreadsheets", "/pricing", "/checkout"],
      converted: true,
    },
    {
      id: "demo-umber-shrike",
      alias: "Umber Shrike",
      countryCode: "JP",
      browser: "Safari",
      os: "iOS",
      device: "Mobile",
      channel: "Direct",
      source: "Direct / none",
      lastSeen: "2026-07-25T01:24:00.000Z",
      journey: ["/", "/changelog"],
      converted: false,
    },
    {
      id: "demo-verdant-quail",
      alias: "Verdant Quail",
      countryCode: "UZ",
      browser: "Chrome",
      os: "Android",
      device: "Mobile",
      channel: "Campaigns",
      source: "launch_x",
      lastSeen: "2026-07-25T00:51:00.000Z",
      journey: ["/", "/features", "/security", "/pricing"],
      converted: false,
    },
    {
      id: "demo-ochre-tapir",
      alias: "Ochre Tapir",
      countryCode: "CA",
      browser: "Edge",
      os: "Windows",
      device: "Desktop",
      channel: "Referral",
      source: "producthunt.com",
      lastSeen: "2026-07-24T23:38:00.000Z",
      journey: ["/", "/pricing"],
      converted: false,
    },
  ],
  crawlers: {
    requests: 225,
    verified: 0,
    detectionLabel: "User-agent detected",
    series: [
      { date: "2026-07-19", category: "ai_answer", requests: 8 },
      { date: "2026-07-20", category: "ai_answer", requests: 24 },
      { date: "2026-07-21", category: "ai_answer", requests: 7 },
      { date: "2026-07-22", category: "ai_answer", requests: 22 },
      { date: "2026-07-23", category: "ai_answer", requests: 10 },
      { date: "2026-07-24", category: "ai_answer", requests: 9 },
      { date: "2026-07-25", category: "ai_answer", requests: 15 },
      { date: "2026-07-19", category: "search_index", requests: 7 },
      { date: "2026-07-20", category: "search_index", requests: 18 },
      { date: "2026-07-21", category: "search_index", requests: 6 },
      { date: "2026-07-22", category: "search_index", requests: 16 },
      { date: "2026-07-23", category: "search_index", requests: 8 },
      { date: "2026-07-24", category: "search_index", requests: 7 },
      { date: "2026-07-25", category: "search_index", requests: 10 },
      { date: "2026-07-19", category: "model_training", requests: 6 },
      { date: "2026-07-20", category: "model_training", requests: 16 },
      { date: "2026-07-21", category: "model_training", requests: 6 },
      { date: "2026-07-22", category: "model_training", requests: 13 },
      { date: "2026-07-23", category: "model_training", requests: 6 },
      { date: "2026-07-24", category: "model_training", requests: 6 },
      { date: "2026-07-25", category: "model_training", requests: 5 },
    ],
    // Requests per category sum to the category totals below; share is
    // relative to the provider's own category.
    providers: [
      {
        provider: "ChatGPT",
        category: "ai_answer",
        requests: 52,
        share: 0.547,
      },
      { provider: "OpenAI", category: "ai_answer", requests: 18, share: 0.189 },
      {
        provider: "Perplexity",
        category: "ai_answer",
        requests: 11,
        share: 0.116,
      },
      { provider: "Google", category: "ai_answer", requests: 10, share: 0.105 },
      {
        provider: "Anthropic",
        category: "ai_answer",
        requests: 4,
        share: 0.042,
      },
      {
        provider: "ChatGPT",
        category: "search_index",
        requests: 28,
        share: 0.389,
      },
      {
        provider: "Google",
        category: "search_index",
        requests: 22,
        share: 0.306,
      },
      {
        provider: "OpenAI",
        category: "search_index",
        requests: 16,
        share: 0.222,
      },
      {
        provider: "Perplexity",
        category: "search_index",
        requests: 6,
        share: 0.083,
      },
      {
        provider: "ChatGPT",
        category: "model_training",
        requests: 15,
        share: 0.259,
      },
      {
        provider: "OpenAI",
        category: "model_training",
        requests: 14,
        share: 0.241,
      },
      {
        provider: "Google",
        category: "model_training",
        requests: 12,
        share: 0.207,
      },
      {
        provider: "Anthropic",
        category: "model_training",
        requests: 10,
        share: 0.172,
      },
      {
        provider: "Perplexity",
        category: "model_training",
        requests: 7,
        share: 0.121,
      },
    ],
    pages: [
      { path: "/pricing", category: "ai_answer", requests: 18 },
      { path: "/", category: "ai_answer", requests: 13 },
      { path: "/features", category: "ai_answer", requests: 10 },
      { path: "/blog/best-crm-2024", category: "ai_answer", requests: 8 },
      { path: "/compare/vs-spreadsheets", category: "ai_answer", requests: 6 },
      { path: "/docs/api/overview", category: "ai_answer", requests: 5 },
      { path: "/pricing", category: "search_index", requests: 12 },
      { path: "/", category: "search_index", requests: 10 },
      { path: "/features", category: "search_index", requests: 7 },
      { path: "/blog/best-crm-2024", category: "search_index", requests: 6 },
      { path: "/integrations", category: "search_index", requests: 5 },
      { path: "/changelog", category: "search_index", requests: 4 },
      { path: "/about", category: "search_index", requests: 3 },
      { path: "/pricing", category: "model_training", requests: 8 },
      { path: "/docs/api/overview", category: "model_training", requests: 7 },
      { path: "/", category: "model_training", requests: 6 },
      { path: "/integrations", category: "model_training", requests: 6 },
      { path: "/features", category: "model_training", requests: 4 },
      { path: "/blog/best-crm-2024", category: "model_training", requests: 4 },
    ],
    categories: [
      { category: "ai_answer", requests: 95 },
      { category: "search_index", requests: 72 },
      { category: "model_training", requests: 58 },
    ],
  },
};

const DAY_MS = 86_400_000;

// Weekday rhythm for synthetic traffic, indexed by UTC day of week.
const WEEKDAY_WEIGHT = [0.74, 1.08, 1.12, 1.09, 1.05, 0.95, 0.78];

// Deterministic on both the server and the client, so a server-rendered demo
// window hydrates to exactly the same numbers.
function stableNoise(index: number) {
  const value = Math.sin(index * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

// Largest-remainder split, so every scaled breakdown still sums to its total.
function distribute(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  if (weights.length === 0 || weightSum <= 0) {
    return weights.map(() => 0);
  }
  const exact = weights.map((weight) => (weight / weightSum) * total);
  const shares = exact.map((value) => Math.floor(value));
  let remainder = total - shares.reduce((sum, value) => sum + value, 0);
  const byFraction = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let step = 0; step < byFraction.length && remainder > 0; step += 1) {
    shares[byFraction[step].index] += 1;
    remainder -= 1;
  }
  return shares;
}

function demoSeries(windowDays: number, endMs: number) {
  const peakVisitors = 255;
  const series: AcquisitionSeriesPoint[] = [];
  for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
    const dayMs = endMs - offset * DAY_MS;
    const day = new Date(dayMs);
    const trend = Math.pow(0.9885, offset);
    const weekday = WEEKDAY_WEIGHT[day.getUTCDay()];
    const jitter = 0.86 + stableNoise(Math.round(dayMs / DAY_MS)) * 0.28;
    const visitors = Math.max(
      12,
      Math.round(peakVisitors * trend * weekday * jitter),
    );
    const engaged = Math.round(visitors * 0.571);
    series.push({
      date: day.toISOString().slice(0, 10),
      visitors,
      engaged,
      converted: Math.round(engaged * 0.118),
    });
  }
  return series;
}

function scaleRows(
  rows: AcquisitionBreakdownRow[],
  visitorTotal: number,
  conversionTotal: number,
): AcquisitionBreakdownRow[] {
  const visitorShares = distribute(
    visitorTotal,
    rows.map((row) => row.visitors),
  );
  const conversionShares = distribute(
    conversionTotal,
    rows.map((row) => row.conversions),
  );
  return rows.map((row, index) => ({
    ...row,
    visitors: visitorShares[index],
    conversions: conversionShares[index],
  }));
}

/**
 * Demo traffic for the selected analytics window.
 *
 * The seven-day snapshot is the authored baseline; longer windows are derived
 * from a deterministic daily series so that every total, breakdown and crawler
 * figure moves together instead of the window selector only relabelling an
 * unchanged snapshot.
 */
export function demoAcquisitionSnapshotForWindow(
  windowDays: 7 | 30 | 90,
): AcquisitionSnapshot {
  if (windowDays === 7) {
    return demoAcquisitionSnapshot;
  }

  const base = demoAcquisitionSnapshot;
  const endMs = Date.parse(base.generatedAt);
  const series = demoSeries(windowDays, endMs);
  const visitors = series.reduce((sum, point) => sum + point.visitors, 0);
  const engaged = series.reduce((sum, point) => sum + point.engaged, 0);
  const converted = series.reduce((sum, point) => sum + point.converted, 0);
  const ratio = visitors / base.totals.visitors;

  const crawlerRequests = Math.round(base.crawlers.requests * ratio);
  const crawlerCategories = distribute(
    crawlerRequests,
    base.crawlers.categories.map((entry) => entry.requests),
  );

  const categoryTotals = new Map<CrawlerCategory, number>(
    base.crawlers.categories.map((entry, index) => [
      entry.category,
      crawlerCategories[index],
    ]),
  );

  // Providers are split inside their own category, so each tab's rows still
  // add up to the headline count for that tab.
  const crawlerProviders = new Array<number>(base.crawlers.providers.length);
  const providerGroups = new Map<CrawlerCategory | "", number[]>();
  base.crawlers.providers.forEach((provider, index) => {
    const key = provider.category ?? "";
    providerGroups.set(key, [...(providerGroups.get(key) ?? []), index]);
  });
  providerGroups.forEach((indexes, key) => {
    const groupTotal =
      key === ""
        ? crawlerRequests
        : (categoryTotals.get(key as CrawlerCategory) ?? 0);
    const parts = distribute(
      groupTotal,
      indexes.map((index) => base.crawlers.providers[index].requests),
    );
    indexes.forEach((index, position) => {
      crawlerProviders[index] = parts[position];
    });
  });
  const crawlerSeries = [...categoryTotals.entries()].flatMap(
    ([category, total]) => {
      const shape = series.map((point) => point.visitors);
      const perDay = distribute(total, shape);
      return series.map((point, index) => ({
        date: point.date,
        category,
        requests: perDay[index],
      }));
    },
  );

  return {
    ...base,
    windowDays,
    series,
    totals: {
      ...base.totals,
      visitors,
      engaged,
      converted,
      sessions: Math.round(base.totals.sessions * ratio),
      pageviews: Math.round(base.totals.pageviews * ratio),
    },
    channels: scaleRows(base.channels, visitors, converted),
    referrers: scaleRows(
      base.referrers,
      Math.round(
        base.referrers.reduce((sum, row) => sum + row.visitors, 0) * ratio,
      ),
      Math.round(
        base.referrers.reduce((sum, row) => sum + row.conversions, 0) * ratio,
      ),
    ),
    campaigns: scaleRows(
      base.campaigns,
      Math.round(
        base.campaigns.reduce((sum, row) => sum + row.visitors, 0) * ratio,
      ),
      Math.round(
        base.campaigns.reduce((sum, row) => sum + row.conversions, 0) * ratio,
      ),
    ),
    utmSources: scaleRows(
      base.utmSources,
      Math.round(
        base.utmSources.reduce((sum, row) => sum + row.visitors, 0) * ratio,
      ),
      Math.round(
        base.utmSources.reduce((sum, row) => sum + row.conversions, 0) * ratio,
      ),
    ),
    landingPages: base.landingPages.map((page, index) => ({
      ...page,
      visitors: distribute(
        Math.round(
          base.landingPages.reduce((sum, row) => sum + row.visitors, 0) * ratio,
        ),
        base.landingPages.map((row) => row.visitors),
      )[index],
    })),
    crawlers: {
      ...base.crawlers,
      requests: crawlerRequests,
      series: crawlerSeries,
      categories: base.crawlers.categories.map((entry, index) => ({
        ...entry,
        requests: crawlerCategories[index],
      })),
      providers: base.crawlers.providers.map((entry, index) => {
        const groupTotal = entry.category
          ? (categoryTotals.get(entry.category) ?? 0)
          : crawlerRequests;
        return {
          ...entry,
          requests: crawlerProviders[index],
          share: groupTotal > 0 ? crawlerProviders[index] / groupTotal : 0,
        };
      }),
      // Requested pages are a top-N slice rather than an exhaustive split, so
      // they scale proportionally without an exact-sum constraint.
      pages: base.crawlers.pages.map((page) => ({
        ...page,
        requests: Math.max(1, Math.round(page.requests * ratio)),
      })),
    },
  };
}

export function emptyAcquisitionSnapshot(
  mode: "empty" | "unavailable" = "empty",
): AcquisitionSnapshot {
  return {
    mode,
    generatedAt: new Date().toISOString(),
    windowDays: 7,
    totals: {
      visitors: 0,
      sessions: 0,
      pageviews: 0,
      engaged: 0,
      converted: 0,
      online: 0,
      averageSessionSeconds: 0,
    },
    series: [],
    channels: [],
    referrers: [],
    campaigns: [],
    utmSources: [],
    landingPages: [],
    visitors: [],
    crawlers: {
      requests: 0,
      verified: 0,
      series: [],
      providers: [],
      pages: [],
      categories: [],
      detectionLabel: "User-agent detected",
    },
  };
}
