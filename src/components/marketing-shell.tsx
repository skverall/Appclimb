"use client";

import { useState } from "react";
import { ArrowRight, Code2, Menu, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AiChatPanel } from "@/components/ai-chat-panel";
import { BrandMark } from "@/components/brand-mark";

const navigation = [
  { href: "/", label: "Keyword Explorer" },
  { href: "/assistant", label: "ASO Assistant" },
  { href: "/guides/keyword-research", label: "ASO Guide" },
  { href: "/blog", label: "Field Notes" },
  { href: "/about", label: "About" },
] as const;

export function MarketingHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isHome = pathname === "/";

  return (
    <header className="marketing-header">
      <div className="marketing-container marketing-header-inner">
        <Link href="/" aria-label="AppClimb home" className="marketing-brand-link">
          <BrandMark />
        </Link>

        <nav className="marketing-nav" aria-label="Main navigation">
          {navigation.map((item) => {
            const active =
              item.href === "/"
                ? isHome
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "is-active" : undefined}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="marketing-actions">
          {!isHome ? (
            <Link href="/" className="marketing-primary-action">
              Open Explorer <ArrowRight size={15} aria-hidden="true" />
            </Link>
          ) : (
            <span className="marketing-status-badge">
              <Sparkles size={13} aria-hidden="true" />
              <span>Free · No Account</span>
            </span>
          )}

          <button
            type="button"
            className="marketing-mobile-toggle"
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((prev) => !prev)}
          >
            {mobileOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="marketing-mobile-drawer">
          <nav className="marketing-mobile-nav" aria-label="Mobile navigation">
            {navigation.map((item) => {
              const active =
                item.href === "/"
                  ? isHome
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? "is-active" : undefined}
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/"
              className="marketing-mobile-cta"
              onClick={() => setMobileOpen(false)}
            >
              Open Keyword Explorer <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <div className="marketing-container marketing-footer-grid">
        <div className="marketing-footer-brand">
          <BrandMark />
          <p>
            Official Apple Ads popularity (1–100), estimated difficulty, and
            observed App Store position — source labeled on every score.
          </p>
          <span>No account. No tracking. Apple data, not a mystery model.</span>
        </div>
        <div>
          <strong>Explore</strong>
          <Link href="/">Keyword Explorer</Link>
          <Link href="/assistant">ASO Assistant</Link>
          <Link href="/guides/keyword-research">ASO Guide</Link>
          <Link href="/blog">Field Notes</Link>
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
