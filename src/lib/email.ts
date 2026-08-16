/**
 * Server-only transactional email via Resend (ADR 0004), used for sign-in
 * magic links. Degrades gracefully when `RESEND_API_KEY` is not configured —
 * the same pattern the Apple Ads popularity route uses.
 */

const RESEND_API_URL = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 20_000;

export interface ResendCredentials {
  apiKey: string;
  from: string;
}

export function readResendCredentials(): ResendCredentials | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  const from = process.env.RESEND_FROM?.trim() || "AppClimb <no-reply@appclimb.app>";
  return { apiKey, from };
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SendEmailResult {
  ok: boolean;
  status: number;
  error?: string;
}

export async function sendEmail(creds: ResendCredentials, input: SendEmailInput): Promise<SendEmailResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: creds.from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      let detail = "";
      try {
        const data = (await res.json()) as { message?: string };
        detail = data.message ?? "";
      } catch {
        // ignore body parse errors
      }
      return { ok: false, status: res.status, error: detail || `Resend returned ${res.status}` };
    }
    return { ok: true, status: res.status };
  } catch (error) {
    const message = error instanceof Error ? error.message : "email send failed";
    return { ok: false, status: 502, error: message };
  } finally {
    clearTimeout(timer);
  }
}

export interface MagicLinkEmail {
  subject: string;
  text: string;
  html: string;
}

export function buildMagicLinkEmail(url: string, ttlMinutes = 15): MagicLinkEmail {
  const subject = "Sign in to AppClimb";
  const text = [
    "Sign in to AppClimb",
    "",
    `Open this link to sign in. It expires in ${ttlMinutes} minutes:`,
    url,
    "",
    "If you did not request this, you can ignore this email.",
    "",
    "— AppClimb",
  ].join("\n");
  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f6f8f9;padding:32px;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e3e8ea;border-radius:16px;padding:32px;">
      <p style="font-size:15px;font-weight:700;color:#0c8e88;margin:0 0 8px;">AppClimb</p>
      <h1 style="font-size:20px;color:#17272d;margin:0 0 12px;">Sign in to AppClimb</h1>
      <p style="font-size:15px;color:#3c4a50;line-height:1.6;margin:0 0 20px;">
        Click the button below to sign in. This link expires in ${ttlMinutes} minutes.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${url}" style="display:inline-block;background:#0c8e88;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:10px;">Sign in to AppClimb</a>
      </p>
      <p style="font-size:13px;color:#6b777d;line-height:1.6;margin:0;word-break:break-all;">
        Or copy this link into your browser:<br/><a href="${url}" style="color:#0c8e88;">${url}</a>
      </p>
      <p style="font-size:13px;color:#8a969b;line-height:1.6;margin:24px 0 0;">
        If you did not request this, you can ignore this email.
      </p>
    </div>
  </div>`;
  return { subject, text, html };
}
