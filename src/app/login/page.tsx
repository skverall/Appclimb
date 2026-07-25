import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { AuthForm } from "@/components/auth-form";
import { BrandMark } from "@/components/brand-mark";

export const metadata = {
  title: "Create an account or sign in",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-story">
        <BrandMark />
        <div className="auth-story-copy">
          <span className="eyebrow">Interactive Stage 0 demo</span>
          <h1>
            Explore the River Atlas concept before live coverage is complete.
          </h1>
          <p>
            The current demo uses synthetic iOS subscription data to show the
            intended Observe → Diagnose → Experiment loop.
          </p>
          <ul>
            <li>
              <CheckCircle2 size={17} aria-hidden="true" /> Clearly labeled
              sample data in an interactive workspace
            </li>
            <li>
              <CheckCircle2 size={17} aria-hidden="true" /> Accounts, trial and
              read-only source setup available now
            </li>
            <li>
              <ShieldCheck size={17} aria-hidden="true" /> Complete live funnel
              imports are still in development
            </li>
          </ul>
        </div>
        <Link href="/" className="back-to-demo">
          <ArrowLeft size={16} aria-hidden="true" /> Explore the interactive
          demo
        </Link>
      </section>
      <section className="auth-panel">
        <div className="auth-panel-copy">
          <span className="eyebrow">Your private workspace</span>
          <h2>Create your AppClimb account.</h2>
          <p>
            Create an account in one step or sign in to continue. You can
            explore first, connect a read-only source when ready, and choose a
            paid plan only if AppClimb is useful.
          </p>
        </div>
        <AuthForm />
      </section>
    </main>
  );
}
