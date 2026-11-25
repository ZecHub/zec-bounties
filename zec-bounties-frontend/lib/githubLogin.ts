import { backendUrl } from "@/lib/configENV";

// The callback page accepts a token only together with the state this tab
// sent, so a link that carries someone else's token cannot sign a user in.
const STATE_KEY = "githubLoginState";

export function startGithubLogin() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const state = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  try {
    if (typeof sessionStorage === "undefined") {
      throw new Error("sessionStorage is unavailable");
    }
    sessionStorage.setItem(STATE_KEY, state);
  } catch {
    throw new Error(
      "Unable to store GitHub sign-in state. Please enable browser storage and try again.",
    );
  }
  const baseUrl = (backendUrl || "").replace(/\/+$/, "");
  window.location.assign(`${baseUrl}/auth/github?state=${encodeURIComponent(state)}`);
}

export function readGithubLoginState(): string | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage.getItem(STATE_KEY);
  } catch {
    return null;
  }
}

export function clearGithubLoginState() {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.removeItem(STATE_KEY);
  } catch {
    // Ignore restricted storage environments.
  }
}

/**
 * Map OAuth / callback error codes (from ?error=) to user-facing messages.
 * Used by the login form so failures are not silent.
 */
export function getGithubOAuthErrorMessage(code: string | null): string | null {
  if (typeof code !== "string") return null;
  const normalized = code.trim();
  if (!normalized) return null;
  switch (normalized) {
    case "missing_token":
      return "Sign-in did not complete. Please try again.";
    case "invalid_state":
      return "Sign-in state did not match. Please try again.";
    case "invalid_token":
      return "Session verification failed. Please try again.";
    case "oauth_failed":
    case "oauth_cancelled":
      return "GitHub sign-in was cancelled or failed.";
    case "no_email":
      return "A verified GitHub email is required.";
    case "account_mismatch":
    case "account_exists":
      return "This GitHub account cannot be linked.";
    default:
      return "Sign-in failed. Please try again.";
  }
}
