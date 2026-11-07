export function resolveErrorMessage(code: string | null): string {
  switch (code) {
    case "no_email":
      return "Your GitHub account does not have a verified primary email. Please verify an email on GitHub and try again.";
    case "missing_token":
      return "Sign-in failed: No session token received. Please try again.";
    case "invalid_state":
      return "Sign-in failed: Security state verification mismatch. Please try again.";
    case "invalid_token":
      return "Sign-in failed: Your session token could not be verified. Please try again.";
    case "account_mismatch":
      return "Sign-in failed: This email belongs to an account linked to another GitHub user.";
    case "account_exists":
      return "An account with this email already exists. Please sign in with your credentials.";
    case "oauth_cancelled":
      return "GitHub sign-in was cancelled.";
    case "oauth_failed":
      return "GitHub sign-in failed. Please try again.";
    default:
      return code ? `Sign-in failed (${code}). Please try again.` : "";
  }
}

export function extractAuthToken(
  hash: string | undefined | null,
  queryToken: string | undefined | null,
): string | null {
  const cleanHash = (hash || "").replace(/^#/, "");
  const hashToken = new URLSearchParams(cleanHash).get("token");
  return hashToken || queryToken || null;
}

export function sanitizeAuthUrl(search: string): string {
  const currentParams = new URLSearchParams(search);
  currentParams.delete("token");
  const clean = currentParams.toString();
  return clean ? `?${clean}` : "";
}
