import { MarketingShell } from "@/components/marketing-shell";

export const metadata = {
  title: "Privacy",
  description:
    "AppClimb privacy principles: local-first keyword data, minimal optional account data, no tracking.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <main className="legal-page">
        <span className="eyebrow">Legal</span>
        <h1>Privacy principles</h1>
        <p className="legal-operator">
          AppClimb is owned and operated by its founder,{" "}
          <strong>Shokhabbos Makhmudov</strong>.
        </p>
        <p className="legal-updated">Last updated October 19, 2026</p>
        <section>
          <h2>Local-first by default</h2>
          <p>
            You do not need an account to search keywords. Guest explorer
            history stays in your browser&apos;s localStorage and is never
            uploaded. Tracking an app and the ASO assistant require a free
            sign-in; that data also stays in the browser unless you subscribe
            to Pro cloud sync. Clearing your browser data removes local data
            permanently.
          </p>
        </section>
        <section>
          <h2>Account data is minimal and optional</h2>
          <p>
            Signing in is required only for app tracking and the assistant. An
            account stores only: your email address,
            an optional display name, a Google subject id when you use Google
            sign-in, hashed session tokens, your subscription status, your
            weekly email setting and the weeks it was sent, and — if you enable
            Pro cloud sync — your own synced keyword data. We store nothing
            else about you.
          </p>
        </section>
        <section>
          <h2>Email</h2>
          <p>
            We email you sign-in links when you ask for one, and a weekly email
            while you have an account. For a free account the weekly email is
            built only from Apple&apos;s public search-term data; your email
            address is the only personal data it uses. For Pro, it also uses
            your synced keyword data. If you had Pro and synced keywords, those
            stay in your account, and the weekly email keeps showing
            Apple&apos;s popularity for them (not your ranks). Every weekly
            email has a one-click unsubscribe link, and you can switch it off
            in the account menu.
          </p>
        </section>
        <section>
          <h2>No tracking</h2>
          <p>
            This site does not run third-party analytics, advertising, or
            fingerprinting scripts. We do not use cookies for marketing or
            measurement. One HttpOnly session cookie keeps you signed in; it
            contains no personal data itself. The hosting provider may keep
            standard infrastructure logs (for example, for abuse prevention),
            which are not used to profile visitors.
          </p>
        </section>
        <section>
          <h2>Payments</h2>
          <p>
            Subscriptions are processed by Paddle, the merchant of record.
            When you upgrade, Paddle collects your payment details; AppClimb
            never sees or stores your card information. Paddle&apos;s handling
            of payment data is governed by Paddle&apos;s own privacy policy.
          </p>
        </section>
        <section>
          <h2>Third parties</h2>
          <p>
            When you search a keyword, your browser sends the query directly to
            Apple&apos;s iTunes Search API. Apple&apos;s handling of those
            requests is governed by Apple&apos;s own privacy policy. Google
            processes sign-ins only when you choose to sign in with Google.
            Emails are delivered by Resend, which receives your email address
            and the message for that purpose.
          </p>
        </section>
        <p className="legal-note">
          If you have questions about this policy, contact us via the GitHub
          repository linked on this site.
        </p>
      </main>
    </MarketingShell>
  );
}
