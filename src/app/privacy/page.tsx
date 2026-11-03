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
        <p className="legal-updated">Last updated November 3, 2026</p>
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
            sign-in, hashed session and sign-in tokens, your subscription
            status, your weekly email setting and the weeks it was sent, the AI
            apps and API keys you connect (hashed tokens, names and dates),
            daily counts of your assistant messages and agent App Store checks,
            and — if you enable Pro cloud sync — your own synced keyword data.
            We store nothing else about you.
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
            This site does not run third-party analytics or advertising
            scripts. We do not use cookies for marketing or measurement. One
            HttpOnly session cookie keeps you signed in; it contains no
            personal data itself.
          </p>
        </section>
        <section>
          <h2>Visit counting</h2>
          <p>
            We count visits ourselves, on our own servers, without cookies.
            For each page view we store the page, the referring site, your
            country, the device type and browser, and a visitor code made by
            hashing your IP address and browser together with the date. The
            code lets us count a visitor once a day and changes every day, so
            a visitor is not followed from one day to the next. Your IP address
            itself is not stored. A few product events, such as a sign-in starting or the
            pricing page opening, are recorded the same way. None of this is
            linked to your account.
          </p>
        </section>
        <section>
          <h2>ASO assistant</h2>
          <p>
            When you use the ASO assistant, your message, the recent
            conversation, and the app and keywords you are working on (with
            their scores and ranks) are sent to DeepSeek, the AI provider that
            writes the replies, together with Apple search-term data the
            assistant looks up. Your email address and account are not sent.
            AppClimb does not store your chats on its servers: they stay in
            your browser. We keep only a daily count of your messages to apply
            your plan&apos;s limit. DeepSeek&apos;s handling of what it
            receives is governed by DeepSeek&apos;s own privacy policy.
          </p>
        </section>
        <section>
          <h2>AI agents (MCP)</h2>
          <p>
            If you connect an AI app such as ChatGPT, Claude, Codex or Cursor
            to AppClimb, it calls AppClimb on your behalf with a token you
            approved; you can disconnect it at any time on the Connect page.
            The keywords and app IDs it asks about are looked up on the App
            Store through a server AppClimb runs for this purpose (hosted by
            Hostinger), which sees the search terms but not who asked and keeps
            Apple&apos;s answers in memory for a few hours as a cache. AppClimb
            does not keep a record of the keywords your agent checks. What the AI app does
            with the results is governed by that app&apos;s own privacy policy.
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
            AppClimb runs on Cloudflare, which hosts the site and its database
            and may keep standard infrastructure logs (for example, for abuse
            prevention) that are not used to profile visitors. When you search
            a keyword, your browser sends the query directly to Apple&apos;s
            iTunes Search API. Apple&apos;s handling of those requests is
            governed by Apple&apos;s own privacy policy. Google processes
            sign-ins only when you choose to sign in with Google. Emails are
            delivered by Resend, which receives your email address and the
            message for that purpose. The assistant uses DeepSeek and agent
            App Store searches use Hostinger, as described above. We do not
            sell or share personal data with anyone else.
          </p>
        </section>
        <section>
          <h2>How long we keep data</h2>
          <ul>
            <li>
              Account data, including synced keywords and connected AI apps:
              until you delete your account.
            </li>
            <li>
              Sign-in links work for 15 minutes; sessions last up to 30 days;
              AI-app access tokens last one hour and refresh tokens 90 days.
              Each is deleted within a week after it expires or you sign out.
              The record of a deleted API key is removed after 30 days.
            </li>
            <li>Daily message and check counts: 90 days.</li>
            <li>Visit counts and product events: 12 months.</li>
            <li>
              Payment records are kept by Paddle under its own policy.
            </li>
          </ul>
        </section>
        <section>
          <h2>Your choices</h2>
          <ul>
            <li>
              Delete your account at any time with <b>Delete account</b> in the
              account menu. It removes your account and everything stored with
              it on our servers at once. If you have an active Pro
              subscription, cancel it under Manage subscription first.
            </li>
            <li>
              Disconnect AI apps and delete API keys on the{" "}
              <a href="/connect">Connect page</a>.
            </li>
            <li>
              Turn off the weekly email in the account menu or with the link in
              any weekly email.
            </li>
            <li>
              Signing out removes tracked apps and keyword history from this
              browser; clearing this site&apos;s data in your browser also
              removes assistant chats.
            </li>
          </ul>
        </section>
        <p className="legal-note">
          If you have questions about this policy, contact us via the GitHub
          repository linked on this site.
        </p>
      </main>
    </MarketingShell>
  );
}
