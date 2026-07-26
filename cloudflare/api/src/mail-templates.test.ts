import { describe, expect, it } from "vitest";

import { passwordResetEmail } from "./mail-templates";

describe("passwordResetEmail", () => {
  const resetUrl =
    "https://appclimb.app/reset-password?token=abc123-secure-token";
  const appUrl = "https://appclimb.app";

  it("builds a branded multipart message with trust signals", () => {
    const mail = passwordResetEmail({ resetUrl, appUrl });

    expect(mail.subject).toBe("Reset your AppClimb password");

    expect(mail.text).toContain(resetUrl);
    expect(mail.text).toContain("30 minutes");
    expect(mail.text).toContain("If you did not request a password reset");
    expect(mail.text).toContain("AppClimb");

    expect(mail.html).toContain("Account security");
    expect(mail.html).toContain("Reset your password");
    expect(mail.html).toContain(resetUrl);
    expect(mail.html).toContain("Reset password");
    expect(mail.html).toContain("Expires in 30 minutes");
    expect(mail.html).toContain("One-time use");
    expect(mail.html).toContain("Didn&rsquo;t request this?");
    expect(mail.html).toContain("https://appclimb.app/icon-192.png");
    expect(mail.html).toContain("background-color:#0c8e88");
    expect(mail.html).toContain("AppClimb");
    expect(mail.html).toContain("transactional message");
  });

  it("escapes HTML special characters in the reset URL", () => {
    const dirty =
      "https://appclimb.app/reset-password?token=a<script>b&c\"d";
    const mail = passwordResetEmail({ resetUrl: dirty, appUrl });

    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("&amp;");
    expect(mail.html).toContain("&quot;");
    expect(mail.text).toContain(dirty);
  });

  it("honors custom expiry and strips trailing slash from app URL", () => {
    const mail = passwordResetEmail({
      resetUrl,
      appUrl: "https://appclimb.app/",
      expiresInMinutes: 15,
    });

    expect(mail.text).toContain("15 minutes");
    expect(mail.html).toContain("Expires in 15 minutes");
    expect(mail.html).toContain("https://appclimb.app/icon-192.png");
    expect(mail.html).not.toContain("https://appclimb.app//icon");
  });
});
