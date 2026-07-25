import { ArrowLeft, KeyRound } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata = {
  title: "Reset your AppClimb password",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  return (
    <main className="recovery-page">
      <section className="recovery-card">
        <BrandMark />
        <div className="recovery-icon" aria-hidden="true">
          <KeyRound size={24} />
        </div>
        <span className="eyebrow">Account security</span>
        <h1>Choose a new password</h1>
        <p>The link works once. Saving signs out every existing session.</p>
        <ResetPasswordForm token={token} />
        <Link href="/login" className="recovery-back">
          <ArrowLeft size={15} /> Back to sign in
        </Link>
      </section>
    </main>
  );
}
