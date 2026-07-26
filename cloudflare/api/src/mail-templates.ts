/**
 * Transactional email templates for AppClimb.
 *
 * HTML uses table layout + inline CSS for broad client support (Gmail, Apple
 * Mail, Outlook). No external fonts. Logo is optional; text brand mark always
 * renders when images are blocked.
 */

export type PasswordResetEmailInput = {
  resetUrl: string;
  /** Public site origin used for logo + footer links, e.g. https://appclimb.app */
  appUrl: string;
  /** Minutes until the link expires. Default 30. */
  expiresInMinutes?: number;
};

export type TransactionalEmail = {
  subject: string;
  text: string;
  html: string;
};

const BRAND = {
  name: "AppClimb",
  graphite: "#17272d",
  muted: "#6b7c80",
  softMuted: "#91a0a2",
  teal: "#0c8e88",
  tealDark: "#08736f",
  canvas: "#f4f7f5",
  card: "#ffffff",
  line: "#dde7e4",
  warmWhite: "#fbfcfa",
  tealSoft: "#e5f6f2",
} as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeAppUrl(appUrl: string): string {
  return appUrl.replace(/\/+$/u, "") || "https://appclimb.app";
}

/**
 * Password recovery email: clear branding, large CTA, expiry + single-use
 * trust signals, and plain-text fallback so it does not read like a phish.
 */
export function passwordResetEmail(
  input: PasswordResetEmailInput,
): TransactionalEmail {
  const expiresInMinutes = input.expiresInMinutes ?? 30;
  const appUrl = normalizeAppUrl(input.appUrl);
  const resetUrl = input.resetUrl;
  const safeResetUrl = escapeHtml(resetUrl);
  const safeAppUrl = escapeHtml(appUrl);
  const logoUrl = `${appUrl}/icon-192.png`;
  const safeLogoUrl = escapeHtml(logoUrl);

  const subject = "Reset your AppClimb password";

  const text = [
    "Reset your AppClimb password",
    "",
    "We received a request to reset the password for your AppClimb account.",
    "",
    `Use this secure link within ${expiresInMinutes} minutes (one-time use):`,
    resetUrl,
    "",
    "If you did not request a password reset, you can ignore this email.",
    "Your password will stay the same.",
    "",
    "—",
    "AppClimb",
    appUrl,
    "This message was sent by AppClimb because a password reset was requested for this address.",
  ].join("\n");

  // Preheader shows in inbox previews next to the subject.
  const preheader = `Secure one-time link · expires in ${expiresInMinutes} minutes. If you didn't request this, ignore the email.`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(subject)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
    @media only screen and (max-width: 620px) {
      .email-shell { width: 100% !important; }
      .email-card { border-radius: 0 !important; }
      .email-pad { padding-left: 24px !important; padding-right: 24px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.canvas};">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(preheader)}
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${BRAND.canvas};">
    <tr>
      <td align="center" style="padding:32px 16px 40px;">
        <table role="presentation" class="email-shell" cellpadding="0" cellspacing="0" border="0" width="560" style="width:560px;max-width:560px;">
          <!-- Brand header -->
          <tr>
            <td align="center" style="padding:0 0 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="padding-right:10px;">
                    <img
                      src="${safeLogoUrl}"
                      width="36"
                      height="36"
                      alt=""
                      style="display:block;width:36px;height:36px;border-radius:10px;background-color:${BRAND.warmWhite};"
                    />
                  </td>
                  <td valign="middle" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;letter-spacing:-0.02em;color:${BRAND.graphite};">
                    ${BRAND.name}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td class="email-card" style="background-color:${BRAND.card};border:1px solid ${BRAND.line};border-radius:16px;overflow:hidden;">
              <!-- Accent bar -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="height:4px;line-height:4px;font-size:0;background:linear-gradient(90deg,${BRAND.tealDark},${BRAND.teal});background-color:${BRAND.teal};">&nbsp;</td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td class="email-pad" style="padding:36px 40px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.teal};">
                    Account security
                  </td>
                </tr>
                <tr>
                  <td class="email-pad" style="padding:10px 40px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:24px;font-weight:700;line-height:1.25;letter-spacing:-0.02em;color:${BRAND.graphite};">
                    Reset your password
                  </td>
                </tr>
                <tr>
                  <td class="email-pad" style="padding:14px 40px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:${BRAND.muted};">
                    We received a request to reset the password for your AppClimb account. Click the button below to choose a new password.
                  </td>
                </tr>

                <!-- CTA -->
                <tr>
                  <td class="email-pad" align="center" style="padding:28px 40px 8px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" bgcolor="${BRAND.teal}" style="border-radius:10px;background-color:${BRAND.teal};">
                          <!--[if mso]>
                          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeResetUrl}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="21%" stroke="f" fillcolor="${BRAND.teal}">
                            <w:anchorlock/>
                            <center style="color:#ffffff;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;">
                              Reset password
                            </center>
                          </v:roundrect>
                          <![endif]-->
                          <!--[if !mso]><!-- -->
                          <a
                            href="${safeResetUrl}"
                            target="_blank"
                            rel="noopener noreferrer"
                            style="display:inline-block;padding:14px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;line-height:1.25;color:#ffffff;text-decoration:none;border-radius:10px;background-color:${BRAND.teal};"
                          >
                            Reset password
                          </a>
                          <!--<![endif]-->
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Trust chips -->
                <tr>
                  <td class="email-pad" align="center" style="padding:12px 40px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${BRAND.softMuted};">
                    Expires in ${expiresInMinutes} minutes &nbsp;&middot;&nbsp; One-time use &nbsp;&middot;&nbsp; Secure link
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td class="email-pad" style="padding:28px 40px 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="border-top:1px solid ${BRAND.line};font-size:0;line-height:0;">&nbsp;</td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Fallback link -->
                <tr>
                  <td class="email-pad" style="padding:20px 40px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${BRAND.muted};">
                    Button not working? Paste this link into your browser:
                  </td>
                </tr>
                <tr>
                  <td class="email-pad" style="padding:8px 40px 0;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;line-height:1.5;word-break:break-all;">
                    <a href="${safeResetUrl}" style="color:${BRAND.tealDark};text-decoration:underline;">${safeResetUrl}</a>
                  </td>
                </tr>

                <!-- Security note -->
                <tr>
                  <td class="email-pad" style="padding:24px 40px 36px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${BRAND.warmWhite};border:1px solid ${BRAND.line};border-radius:12px;">
                      <tr>
                        <td style="padding:16px 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.55;color:${BRAND.muted};">
                          <strong style="color:${BRAND.graphite};">Didn&rsquo;t request this?</strong><br />
                          You can safely ignore this email. Your password will not change unless you use the link above.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 16px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.softMuted};">
              Sent by <a href="${safeAppUrl}" style="color:${BRAND.muted};text-decoration:none;font-weight:600;">AppClimb</a>
              &nbsp;&middot;&nbsp;
              <a href="${safeAppUrl}" style="color:${BRAND.muted};text-decoration:none;">${safeAppUrl.replace(/^https?:\/\//u, "")}</a>
              <br />
              This is a transactional message about your account security.
              <br />
              &copy; ${new Date().getUTCFullYear()} AppClimb
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
