import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";

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
          Enter the email you use for AppClimb. We will send a single-use,
          time-limited link if an account exists.
        </p>
        <PasswordRecoveryForm />
        <Link href="/login" className="recovery-back">
          <ArrowLeft size={15} /> Back to sign in
        </Link>
      </section>
    </main>
  );
}
