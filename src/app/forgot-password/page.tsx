import { ArrowLeft, LifeBuoy, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

export const metadata = {
  title: "Recover your AppClimb account",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <main className="recovery-page">
      <section className="recovery-card">
        <BrandMark />
        <div className="recovery-icon" aria-hidden="true">
          <ShieldCheck size={24} />
        </div>
        <span className="eyebrow">Account recovery</span>
        <h1>Forgot your password?</h1>
        <p>
          AppClimb is still in private beta, so recovery requests are verified
          by a person before any account access changes. This protects your
          connected source credentials.
        </p>
        <a
          className="recovery-action"
          href="mailto:aydmaxx@gmail.com?subject=AppClimb%20password%20reset"
        >
          <Mail size={17} /> Request a password reset
        </a>
        <div className="recovery-note">
          <LifeBuoy size={16} />
          <span>
            Send the request from your AppClimb account email. Never include
            source API keys or passwords.
          </span>
        </div>
        <Link href="/login" className="recovery-back">
          <ArrowLeft size={15} /> Back to sign in
        </Link>
      </section>
    </main>
  );
}
