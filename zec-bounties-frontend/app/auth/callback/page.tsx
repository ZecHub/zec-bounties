"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useBounty } from "@/lib/bounty-context";
import { backendUrl } from "@/lib/configENV";
import {
  clearGithubLoginState,
  extractGithubCallbackParams,
  readGithubLoginState,
} from "@/lib/githubLogin";

export default function GithubCallback() {
  const { setCurrentUser } = useBounty();
  const router = useRouter();
  const searchParams = useSearchParams();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    // The session token arrives in the URL fragment (#token=...), with a
    // fallback to the query string (?token=...) during rolling deployments.
    const location =
      typeof window !== "undefined"
        ? window.location
        : { pathname: "/auth/callback", search: "", hash: "" };
    const { token, state, scrubbedUrl } = extractGithubCallbackParams(
      location,
      searchParams,
    );
    const expectedState = readGithubLoginState();

    if (!token) {
      clearGithubLoginState();
      router.push("/login?error=missing_token");
      return;
    }

    if (!expectedState || state !== expectedState) {
      clearGithubLoginState();
      router.push("/login?error=invalid_state");
      return;
    }

    // Strip the token from the address bar / history straight away.
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", scrubbedUrl);
    }

    localStorage.setItem("authToken", token);

    fetch(`${backendUrl}/auth/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = res.ok ? await res.json() : null;
        if (!data?.user) throw new Error("We couldn't verify your session.");
        return data.user;
      })
      .then((user) => {
        clearGithubLoginState();
        setCurrentUser(user);
        router.push(user.role === "ADMIN" ? "/admin" : "/home");
      })
      .catch((error) => {
        clearGithubLoginState();
        localStorage.removeItem("authToken");
        toast.error("Sign-in failed", {
          description: error?.message ?? "Please try signing in again.",
        });
        router.push("/login?error=invalid_token");
      });
  }, [searchParams, setCurrentUser, router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Completing sign-in...</p>
      </div>
    </main>
  );
}
