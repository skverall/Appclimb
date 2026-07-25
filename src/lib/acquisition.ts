export type AcquisitionMode = "demo" | "empty" | "live" | "unavailable";
export type AcquisitionChannel =
  | "Direct"
  | "Organic Search"
  | "Social"
  | "AI Referral"
  | "Campaigns"
  | "Referral";
export type CrawlerCategory =
  | "ai_answer"
  | "search_index"
  | "model_training"
  | "other";

export interface WebProperty {
  id: string;
  name: string;
  domain: string;
  trackingToken?: string;
  tokenVersion: number;
  retentionDays: number;
  createdAt: string;
}

export interface AcquisitionTotals {
  visitors: number;
  sessions: number;
  pageviews: number;
  engaged: number;
  converted: number;
  online: number;
  averageSessionSeconds: number;
}

export interface AcquisitionSeriesPoint {
  date: string;
  visitors: number;
  engaged: number;
  converted: number;
}

export interface AcquisitionBreakdownRow {
  key: string;
  label: string;
  detail?: string;
  visitors: number;
  engagedRate: number;
  conversions: number;
}

export interface AcquisitionPageRow {
  path: string;
  visitors: number;
  conversionRate: number;
}

export interface AcquisitionVisitor {
  id: string;
  alias: string;
  countryCode?: string;
  browser: string;
  os: string;
  device: string;
  channel: AcquisitionChannel;
  source: string;
  lastSeen: string;
  journey: string[];
  converted: boolean;
}

export interface CrawlerProviderRow {
  provider: string;
  requests: number;
  /** Share of its own category, not of all crawler traffic. */
  share: number;
  /**
   * Optional because an API released before the category-scoped rollups
   * returns these rows aggregated across every category. The Atlas falls back
   * to labelling them as such when the field is absent.
   */
  category?: CrawlerCategory;
}

export interface CrawlerPageRow {
  path: string;
  requests: number;
  category?: CrawlerCategory;
}

export interface CrawlerSnapshot {
  requests: number;
  verified: number;
  series: {
    date: string;
    category: CrawlerCategory;
    requests: number;
  }[];
  providers: CrawlerProviderRow[];
  pages: CrawlerPageRow[];
  categories: { category: CrawlerCategory; requests: number }[];
  detectionLabel: string;
}

export interface AcquisitionSnapshot {
  mode: AcquisitionMode;
  generatedAt: string;
  windowDays: 7 | 30 | 90;
  property?: WebProperty;
  totals: AcquisitionTotals;
  series: AcquisitionSeriesPoint[];
  channels: AcquisitionBreakdownRow[];
  referrers: AcquisitionBreakdownRow[];
  campaigns: AcquisitionBreakdownRow[];
  utmSources: AcquisitionBreakdownRow[];
  landingPages: AcquisitionPageRow[];
  visitors: AcquisitionVisitor[];
  crawlers: CrawlerSnapshot;
}

export interface AcquisitionEnvelope {
  data?: Omit<AcquisitionSnapshot, "mode" | "windowDays">;
  meta?: {
    mode?: AcquisitionMode;
    windowDays?: 7 | 30 | 90;
  };
}

export function isAcquisitionEnvelope(
  value: unknown,
): value is AcquisitionEnvelope {
  if (!value || typeof value !== "object") return false;
  const envelope = value as AcquisitionEnvelope;
  const data = envelope.data;
  return Boolean(
    data &&
      typeof data.generatedAt === "string" &&
      data.totals &&
      typeof data.totals.visitors === "number" &&
      Array.isArray(data.channels) &&
      Array.isArray(data.landingPages) &&
      Array.isArray(data.visitors) &&
      data.crawlers &&
      Array.isArray(data.crawlers.providers),
  );
}
