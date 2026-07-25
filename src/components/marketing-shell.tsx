import { ArrowRight, Code2 } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

const navigation = [
  { href: "/ios-subscription-analytics", label: "Product" },
  { href: "/guides/ios-subscription-growth", label: "Growth guide" },
  { href: "/blog", label: "Field notes" },
  { href: "/pricing", label: "Pricing" },
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
          <Link href="/login" className="marketing-sign-in">
            Sign in
          </Link>
          <Link href="/?demo=1" className="marketing-primary-action">
            Explore the demo <ArrowRight size={15} aria-hidden="true" />
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
            Visual growth diagnosis for independent iOS subscription app
            builders.
          </p>
          <span>Built around evidence, uncertainty, and read-only control.</span>
        </div>
        <div>
          <strong>Explore</strong>
          <Link href="/ios-subscription-analytics">Product</Link>
          <Link href="/guides/ios-subscription-growth">Growth guide</Link>
          <Link href="/blog">Field notes</Link>
          <Link href="/pricing">Pricing</Link>
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
          <Link href="/pricing.md">Machine-readable pricing</Link>
          <Link href="/feed.xml">RSS feed</Link>
        </div>
      </div>
      <div className="marketing-container marketing-footer-bottom">
        <span>© 2026 AppClimb</span>
        <span>Early access · complete live-data coverage is in development</span>
      </div>
    </footer>
  );
}

export function MarketingShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="marketing-site">
      <MarketingHeader />
      {children}
      <MarketingFooter />
    </div>
  );
}
