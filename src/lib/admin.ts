/**
 * Admin authorization and access control utilities.
 */

/**
 * Returns true if the given email is an authorized administrator.
 * Reads comma-separated emails from ADMIN_EMAILS environment variable,
 * or checks for default admin domains / addresses.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();
  
  const envAdminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (envAdminEmails.length > 0) {
    return envAdminEmails.includes(cleanEmail);
  }

  // Fallback defaults for development / initial setup
  if (
    cleanEmail.includes("shokhabbos") ||
    cleanEmail.endsWith("@appclimb.app") ||
    cleanEmail === "admin@appclimb.app"
  ) {
    return true;
  }

  return false;
}
