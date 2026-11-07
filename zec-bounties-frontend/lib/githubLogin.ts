import { backendUrl } from "@/lib/configENV";

// The callback page accepts a token only together with the state this tab
// sent, so a link that carries someone else's token cannot sign a user in.
const STATE_KEY = "githubLoginState";

export function startGithubLogin() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const state = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  sessionStorage.setItem(STATE_KEY, state);
  window.location.assign(`${backendUrl}/auth/github?state=${state}`);
}

export function readGithubLoginState(): string | null {
  return sessionStorage.getItem(STATE_KEY);
}

export function clearGithubLoginState() {
  sessionStorage.removeItem(STATE_KEY);
}

export interface GithubLocationLike {
  pathname: string;
  search: string;
  hash: string;
}

export interface SearchParamsLike {
  get(name: string): string | null;
}

const GITHUB_OAUTH_ERROR_MESSAGES: Record<string, string> = {
  no_email:
    "GitHub sign-in requires a verified primary email address. Please verify your primary email in GitHub Settings → Emails and try again.",
  account_mismatch:
    "This email belongs to an account linked to a different GitHub user.",
  account_exists:
    "An account with this email already exists without a GitHub link. Please sign in with your existing credentials first.",
  oauth_cancelled: "GitHub sign-in was cancelled.",
  oauth_failed: "GitHub sign-in failed. Please try again.",
  missing_token:
    "Sign-in could not be completed because the session token was missing. Please try signing in again.",
  invalid_state:
    "Sign-in session expired or state verification failed. Please try signing in again.",
  invalid_token:
    "We couldn't verify your session. Please try signing in again.",
};

export function extractGithubCallbackParams(
  location: GithubLocationLike,
  searchParams?: SearchParamsLike | null,
): {
  token: string | null;
  state: string | null;
  scrubbedUrl: string;
} {
  const hashParams = new URLSearchParams(
    (location.hash || "").replace(/^#/, ""),
  );
  const queryParams = new URLSearchParams(
    (location.search || "").replace(/^\?/, ""),
  );

  const token =
    hashParams.get("token") ||
    queryParams.get("token") ||
    searchParams?.get("token") ||
    null;

  const state =
    searchParams?.get("state") ||
    queryParams.get("state") ||
    hashParams.get("state") ||
    null;

  queryParams.delete("token");
  const cleanQuery = queryParams.toString();
  const scrubbedUrl = cleanQuery
    ? `${location.pathname}?${cleanQuery}`
    : location.pathname;

  return { token, state, scrubbedUrl };
}

export function getGithubOAuthErrorMessage(
  errorCode: string | null | undefined,
): string | null {
  if (!errorCode) return null;
  return (
    GITHUB_OAUTH_ERROR_MESSAGES[errorCode] ??
    "Sign-in failed. Please try again."
  );
}

