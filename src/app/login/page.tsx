import { ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { AuthForm } from "@/components/auth-form";
import { BrandMark } from "@/components/brand-mark";

export const metadata = {
  title: "Start your free trial",
};

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-story">
        <BrandMark />
        <div className="auth-story-copy">
          <span className="eyebrow">River Atlas</span>
          <h1>See where your app stops growing — and what to fix next.</h1>
          <p>
            One visual map for store, product, paywall and subscription data.
          </p>
          <ul>
            <li>
              <CheckCircle2 size={17} /> Evidence-backed bottlenecks
            </li>
            <li>
              <CheckCircle2 size={17} /> Four read-only integrations
            </li>
            <li>
              <ShieldCheck size={17} /> Credentials never reach the browser
            </li>
          </ul>
        </div>
        <Link href="/" className="back-to-demo">
          <ArrowLeft size={16} /> Explore demo workspace
        </Link>
      </section>
      <section className="auth-panel">
        <div className="auth-panel-copy">
          <span className="eyebrow">Get started</span>
          <h2>Connect the first source in minutes.</h2>
          <p>Your 14-day trial starts when the workspace is created.</p>
        </div>
        <AuthForm />
      </section>
    </main>
  );
}
