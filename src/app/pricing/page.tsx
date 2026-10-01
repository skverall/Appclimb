import Link from "next/link";
import {
  Bot,
  Check,
  CreditCard,
  Database,
  HardDrive,
  LineChart,
  Lock,
  Minus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { JsonLd } from "@/components/json-ld";
import { MarketingShell } from "@/components/marketing-shell";
import { PricingPlans, ProCheckoutButton } from "@/components/pricing-plans";
import {
  AppsIllustration,
  AssistantIllustration,
  ChecksIllustration,
  HistoryIllustration,
  LimitMeter,
} from "@/components/pricing-visuals";
import { GUEST_EXPLORER_CHECKS_PER_DAY, PLAN_LIMITS, PRO_MONTHLY_USD, PRO_YEARLY_USD } from "@/lib/plan";
import { absoluteUrl } from "@/lib/site";

export const metadata = {
  title: "Pricing",
  description:
    "AppClimb pricing: search App Store keywords free (8 checks/day as a guest, 30 with a free account; Apple Ads popularity, difficulty evidence). Pro is $8/month or $64/year: unlimited checks, 52 weeks of Apple history, unlimited tracking, cloud sync.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "AppClimb Pricing",
    description:
      "Free plan with honest limits. Pro $8/month: unlimited keyword checks, 52 weeks of Apple popularity history, cloud sync.",
    url: "/pricing",
  },
};

const free = PLAN_LIMITS.free;
const pro = PLAN_LIMITS.pro;
const YEARLY_PER_MONTH = (PRO_YEARLY_USD / 12).toFixed(2);
/** Entry price of a typical ASO suite, per month (founder research). */
const SUITE_MONTHLY_USD = 89;

const FAQ = [
  {
    question: "Do I need an account?",
    answer:
      "Not to search keywords — Keyword Explorer is open as a guest (8 checks/day). A free sign-in raises that to 30 a day and adds app tracking and the ASO assistant. Pro is optional after that.",
  },
  {
    question: "Is the free plan real or a demo?",
    answer:
      "It's the real tool with honest daily limits: 30 new keyword checks a day with a free account, 8 without one (re-checking your list is free), Apple Ads popularity with 12 weeks of history, difficulty with its evidence, trending searches, and — after a free sign-in — one tracked app and 5 AI messages. Your keyword data stays in your browser unless you upgrade to Pro sync.",
  },
  {
    question: "What does Pro unlock?",
    answer:
      "Unlimited keyword checks and tracked apps, a full year (52 weeks) of Apple popularity history per keyword, 90 days of rank history, cloud sync across devices, and 200 AI messages/day.",
  },
  {
    question: "Why do some keywords show “≤48 · Long tail” instead of a number?",
    answer:
      "Apple publishes popularity for the 500 most-searched terms in each category. For anything below that list, the honest answer is “at or below the lowest published score” — so that's what we show, on every plan. Difficulty is always labeled as an estimate. Nothing is ever relabeled as search volume.",
  },
  {
    question: "Can I cancel?",
    answer:
      "Yes, anytime from your account menu — Pro stays active until the end of the period you paid for, then limits revert to Free. Your synced data remains in your account.",
  },
  {
    question: "Who processes payments?",
    answer:
      "Paddle, the merchant of record. AppClimb never sees or stores your card details. See the refund policy for details.",
  },
];

type Cell =
  | { kind: "check" }
  | { kind: "none" }
  | { kind: "text"; text: string; note?: string; meter?: { value: number; max: number; unlimited?: boolean } };

interface Row {
  label: string;
  free: Cell;
  pro: Cell;
}

const yes: Cell = { kind: "check" };
const no: Cell = { kind: "none" };
const text = (value: string, extra: Omit<Extract<Cell, { kind: "text" }>, "kind" | "text"> = {}): Cell => ({
  kind: "text",
  text: value,
  ...extra,
});

const GROUPS: Array<{ title: string; icon: LucideIcon; rows: Row[] }> = [
  {
    title: "Keyword research",
    icon: Search,
    rows: [
      {
        label: "New keyword checks",
        free: text(`${free.explorerChecksPerDay} a day · ${GUEST_EXPLORER_CHECKS_PER_DAY} as a guest`, {
          meter: { value: free.explorerChecksPerDay ?? 0, max: 100 },
        }),
        pro: text("Unlimited", { meter: { value: 1, max: 1, unlimited: true } }),
      },
      { label: "Apple Ads popularity on every keyword", free: yes, pro: yes },
      {
        label: "Apple popularity history",
        free: text(`${free.historyWeeks} weeks`, { meter: { value: free.historyWeeks, max: pro.historyWeeks } }),
        pro: text(`${pro.historyWeeks} weeks`, { meter: { value: pro.historyWeeks, max: pro.historyWeeks } }),
      },
      { label: "Difficulty with its evidence, and a verdict", free: yes, pro: yes },
      { label: "Trending, related & autocomplete searches", free: yes, pro: yes },
    ],
  },
  {
    title: "Rank tracking",
    icon: LineChart,
    rows: [
      {
        label: "Tracked apps",
        free: text(String(free.trackedApps), { note: "free sign-in" }),
        pro: text("Unlimited"),
      },
      { label: "Keywords per app", free: text(String(free.keywordsPerApp)), pro: text("Unlimited") },
      {
        label: "Rank history",
        free: text(`${free.historyDays} days`, { meter: { value: free.historyDays, max: pro.historyDays } }),
        pro: text(`${pro.historyDays} days`, { meter: { value: pro.historyDays, max: pro.historyDays } }),
      },
      { label: "Rankings overview, keyword map & movers", free: yes, pro: yes },
      { label: "Keyword field builder & CSV export", free: yes, pro: yes },
    ],
  },
  {
    title: "ASO assistant",
    icon: Bot,
    rows: [
      {
        label: "Messages a day",
        free: text(String(free.aiMessagesPerDay), {
          note: "free sign-in",
          meter: { value: free.aiMessagesPerDay ?? 0, max: pro.aiMessagesPerDay ?? 200 },
        }),
        pro: text(String(pro.aiMessagesPerDay), { meter: { value: 1, max: 1 } }),
      },
      { label: "Answers checked against Apple data", free: yes, pro: yes },
    ],
  },
  {
    title: "Your data",
    icon: HardDrive,
    rows: [
      { label: "Where it lives", free: text("This browser"), pro: text("Synced to your account") },
      { label: "Same data on every device", free: no, pro: yes },
      { label: "JSON backup & restore", free: yes, pro: yes },
    ],
  },
  {
    title: "Billing",
    icon: CreditCard,
    rows: [
      { label: "Price", free: text("$0"), pro: text(`$${PRO_MONTHLY_USD}/mo or $${PRO_YEARLY_USD}/yr`) },
      { label: "Card required", free: text("No"), pro: text("At checkout (Paddle)") },
      { label: "Cancel anytime", free: no, pro: text("Yes", { note: "Pro runs to period end" }) },
    ],
  },
];

function CellView({ cell, plan }: { cell: Cell; plan: "free" | "pro" }) {
  if (cell.kind === "check") {
    return (
      <span className={`pr-yes pr-yes--${plan}`}>
        <Check size={14} aria-hidden="true" />
        <span className="sr-only">Included</span>
      </span>
    );
  }
  if (cell.kind === "none") {
    return (
      <span className="pr-no">
        <Minus size={14} aria-hidden="true" />
        <span className="sr-only">Not included</span>
      </span>
    );
  }
  return (
    <span className="pr-value">
      <strong>{cell.text}</strong>
      {cell.note && <small>{cell.note}</small>}
      {cell.meter && <LimitMeter {...cell.meter} />}
    </span>
  );
}

const PRO_TILES = [
  {
    title: "A full year of Apple’s history",
    body: "See seasonality before you commit. A term that spikes every December looks flat in a 12-week window.",
    visual: <HistoryIllustration />,
    wide: true,
  },
  {
    title: "Check every idea",
    body: "Brainstorm without rationing. Re-checking your saved list is free on every plan.",
    visual: <ChecksIllustration />,
  },
  {
    title: "Track every app",
    body: "All your apps and storefronts, every keyword, 90 days of daily ranks.",
    visual: <AppsIllustration />,
  },
  {
    title: "An assistant that keeps up",
    body: "200 answers a day, each grounded in Apple’s popularity data.",
    visual: <AssistantIllustration />,
  },
];

const TRUST = [
  {
    icon: ShieldCheck,
    title: "Apple’s numbers, labeled",
    body: "Every popularity score says where it came from. We never relabel anything as search volume.",
  },
  {
    icon: Database,
    title: "Your data stays yours",
    body: "Free keeps everything in your browser. Pro syncs only your own lists to your account.",
  },
  {
    icon: Lock,
    title: "Checkout by Paddle",
    body: "Paddle is the merchant of record. AppClimb never sees your card.",
  },
  {
    icon: RotateCcw,
    title: "Cancel in two clicks",
    body: "From the account menu, anytime. Pro stays on until the period you paid for ends.",
  },
];

export default function PricingPage() {
  const suiteYear = SUITE_MONTHLY_USD * 12;
  return (
    <MarketingShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: "AppClimb Pro",
          description:
            "App Store keyword research: official Apple Ads popularity, estimated difficulty, cloud sync.",
          brand: { "@type": "Brand", name: "AppClimb" },
          offers: [
            { "@type": "Offer", name: "Free plan", price: "0", priceCurrency: "USD", url: absoluteUrl("/pricing") },
            {
              "@type": "Offer",
              name: "Pro monthly",
              price: String(PRO_MONTHLY_USD),
              priceCurrency: "USD",
              url: absoluteUrl("/pricing"),
            },
            {
              "@type": "Offer",
              name: "Pro yearly",
              price: String(PRO_YEARLY_USD),
              priceCurrency: "USD",
              url: absoluteUrl("/pricing"),
            },
          ],
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })),
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "AppClimb", item: absoluteUrl("/") },
            { "@type": "ListItem", position: 2, name: "Pricing", item: absoluteUrl("/pricing") },
          ],
        }}
      />
      <main className="pr">
        <section className="pr-hero marketing-container">
          <p className="pr-eyebrow">Pricing</p>
          <h1>Search free. Go Pro when keywords become a habit.</h1>
          <p className="pr-lede">
            Every plan gets Apple&rsquo;s official popularity and a difficulty score that shows its
            evidence. Pro removes the limits for ${PRO_MONTHLY_USD} a month — or ${YEARLY_PER_MONTH} billed
            yearly.
          </p>
          <ul className="pr-proof">
            <li>
              <Check size={14} aria-hidden="true" /> Apple Ads data on every plan
            </li>
            <li>
              <Check size={14} aria-hidden="true" /> No card for Free
            </li>
            <li>
              <Check size={14} aria-hidden="true" /> Cancel anytime
            </li>
          </ul>
        </section>

        <div className="marketing-container">
          <PricingPlans />
        </div>

        <section className="pr-section marketing-container" aria-labelledby="pr-unlocks">
          <header className="pr-section-head">
            <p className="pr-eyebrow">Why Pro</p>
            <h2 id="pr-unlocks">What changes when you upgrade</h2>
          </header>
          <div className="pr-tiles">
            {PRO_TILES.map((tile) => (
              <article key={tile.title} className={`pr-tile${tile.wide ? " pr-tile--wide" : ""}`}>
                <div className="pr-tile-visual">{tile.visual}</div>
                <h3>{tile.title}</h3>
                <p>{tile.body}</p>
              </article>
            ))}
          </div>
          <p className="pr-illustration-note">Illustrations, not your data.</p>
        </section>

        <section className="pr-section marketing-container" aria-labelledby="pr-compare">
          <header className="pr-section-head">
            <p className="pr-eyebrow">Compare</p>
            <h2 id="pr-compare">Free vs Pro, line by line</h2>
          </header>
          <div className="pr-table-wrap">
            <table className="pr-table">
              <colgroup>
                <col />
                <col className="pr-col-free" />
                <col className="pr-col-pro" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Feature</span>
                  </th>
                  <th scope="col">
                    <span className="pr-th-plan">Free</span>
                    <span className="pr-th-price">$0</span>
                  </th>
                  <th scope="col" className="pr-th-pro">
                    <span className="pr-th-plan">Pro</span>
                    <span className="pr-th-price">
                      ${PRO_MONTHLY_USD}/mo · ${PRO_YEARLY_USD}/yr
                    </span>
                    <ProCheckoutButton className="pr-btn pr-btn--primary pr-btn--sm">Get Pro</ProCheckoutButton>
                  </th>
                </tr>
              </thead>
              {GROUPS.map((group) => {
                const Icon = group.icon;
                return (
                  <tbody key={group.title}>
                    <tr className="pr-group">
                      <th scope="colgroup" colSpan={3}>
                        <Icon size={15} aria-hidden="true" /> {group.title}
                      </th>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={row.label}>
                        <th scope="row">{row.label}</th>
                        <td>
                          <CellView cell={row.free} plan="free" />
                        </td>
                        <td className="pr-td-pro">
                          <CellView cell={row.pro} plan="pro" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                );
              })}
            </table>
          </div>
        </section>

        <section className="pr-section marketing-container" aria-labelledby="pr-anchor">
          <div className="pr-anchor">
            <div>
              <p className="pr-eyebrow">The math</p>
              <h2 id="pr-anchor">A year of Pro costs less than a month of most ASO suites.</h2>
              <p>
                {`Most ASO suites start around $${SUITE_MONTHLY_USD} a month and sell “search volume” they model themselves. AppClimb shows Apple’s own popularity score, explains every difficulty number, and charges $${PRO_YEARLY_USD} a year.`}
              </p>
            </div>
            <div className="pr-anchor-bars" role="img" aria-label={`Per year: AppClimb Pro $${PRO_YEARLY_USD}; typical ASO suite from $${suiteYear.toLocaleString("en-US")}`}>
              <div className="pr-anchor-row">
                <span>AppClimb Pro</span>
                <span className="pr-anchor-bar is-us">
                  <i style={{ width: `${(PRO_YEARLY_USD / suiteYear) * 100}%` }} />
                </span>
                <b>${PRO_YEARLY_USD}/yr</b>
              </div>
              <div className="pr-anchor-row">
                <span>Typical ASO suite</span>
                <span className="pr-anchor-bar">
                  <i style={{ width: "100%" }} />
                </span>
                <b>${suiteYear.toLocaleString("en-US")}+/yr</b>
              </div>
            </div>
          </div>
        </section>

        <section className="pr-section marketing-container" aria-label="Why you can trust it">
          <div className="pr-trust">
            {TRUST.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title}>
                  <span className="pr-trust-icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="pr-section pr-faq marketing-container" aria-labelledby="pr-faq">
          <header className="pr-section-head">
            <p className="pr-eyebrow">FAQ</p>
            <h2 id="pr-faq">Questions, answered honestly</h2>
          </header>
          <div className="pr-faq-list">
            {FAQ.map((item, index) => (
              <details key={item.question} open={index === 0}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
          <p className="pr-faq-more">
            More detail in the <Link href="/refunds">refund policy</Link> and <Link href="/terms">terms</Link>.
          </p>
        </section>

        <section className="pr-final marketing-container" aria-labelledby="pr-final">
          <h2 id="pr-final">Your next keyword is one search away.</h2>
          <p>Start free in seconds. Upgrade the day you hit a limit.</p>
          <div className="pr-final-actions">
            <Link href="/" className="pr-btn pr-btn--light">
              <Search size={16} aria-hidden="true" /> Open Keyword Explorer
            </Link>
            <ProCheckoutButton className="pr-btn pr-btn--outline-light">
              <Sparkles size={16} aria-hidden="true" /> Get Pro — ${YEARLY_PER_MONTH}/mo
            </ProCheckoutButton>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
