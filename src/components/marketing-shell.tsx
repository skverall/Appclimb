import { ArrowRight, Code2 } from "lucide-react";
import Link from "next/link";

import { AiChatPanel } from "@/components/ai-chat-panel";
import { BrandMark } from "@/components/brand-mark";

const navigation = [
  { href: "/assistant", label: "ASO Assistant" },
  { href: "/app-store-keywords", label: "Keyword research" },
  { href: "/guides/keyword-research", label: "ASO guide" },
  { href: "/blog", label: "Field notes" },
  { href: "/about", label: "About" },
] as const;

export function MarketingHeader() {
  return (
    <header className="marketing-header">
      <div className="marketing-container marketing-header-inner">
        <Link href="/" aria-label="AppClimb home">
          <BrandMark />
        </Link>
        <nav className="marketing-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="marketing-actions">
          <Link href="/" className="marketing-primary-action">
            Track keywords <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <div className="marketing-container marketing-footer-grid">
        <div>
          <BrandMark />
          <p>
            Free App Store keyword research and local app tracking: estimated
            popularity, difficulty, and observed position from public data.
          </p>
          <span>No account. No tracking. Estimates, never invented volumes.</span>
        </div>
        <div>
          <strong>Explore</strong>
          <Link href="/">Keyword explorer</Link>
          <Link href="/assistant">ASO Assistant</Link>
          <Link href="/app-store-keywords">Keyword research</Link>
          <Link href="/guides/keyword-research">ASO guide</Link>
          <Link href="/blog">Field notes</Link>
        </div>
        <div>
          <strong>Company</strong>
          <Link href="/about">About</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/refunds">Refunds</Link>
        </div>
        <div>
          <strong>Open information</strong>
          <a
            href="https://github.com/skverall/Appclimb"
            target="_blank"
            rel="noreferrer"
          >
            <Code2 size={14} aria-hidden="true" /> GitHub
          </a>
          <Link href="/llms.txt">AI-readable overview</Link>
          <Link href="/feed.xml">RSS feed</Link>
        </div>
      </div>
      <div className="marketing-container marketing-footer-bottom">
        <span>© 2026 AppClimb</span>
        <span>Free · open data · estimates labeled honestly</span>
      </div>
    </footer>
  );
}

export function MarketingShell({
  children,
  hideAiFab = false,
  hideFooter = false,
}: {
  children: React.ReactNode;
  /** Hide the floating popup on the full-page assistant route. */
  hideAiFab?: boolean;
  /** Hide the marketing footer on app-like pages that fill the viewport. */
  hideFooter?: boolean;
}) {
  return (
    <div className="marketing-site">
      <MarketingHeader />
      {children}
      {!hideFooter && <MarketingFooter />}
      {!hideAiFab && <AiChatPanel />}
    </div>
  );
}
