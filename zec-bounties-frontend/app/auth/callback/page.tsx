"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useBounty } from "@/lib/bounty-context";
import { backendUrl } from "@/lib/configENV";
import {
  clearGithubLoginState,
  readGithubLoginState,
} from "@/lib/githubLogin";

export default function GithubCallback() {
  const { setCurrentUser } = useBounty();
  const router = useRouter();
  const searchParams = useSearchParams();
  const handledRef = useRef(false);

  useEffect(() => {
    // Guard against React 19 / StrictMode double-invocation and against
    // re-runs after history.replaceState scrubs the fragment.
    if (handledRef.current) return;
    handledRef.current = true;

    // Token arrives in the URL fragment (#token=...) so it is never sent to
    // servers or included in the Referer header. Query fallback covers any
    // transitional deploys that still emit ?token=.
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const tokenFromHash = new URLSearchParams(hash.replace(/^#/, "")).get("token");
    const token = tokenFromHash || searchParams.get("token");
    const expectedState = readGithubLoginState();

    if (!token) {
      clearGithubLoginState();
      router.push("/login?error=missing_token");
      return;
    }

    if (!expectedState || searchParams.get("state") !== expectedState) {
      clearGithubLoginState();
      router.push("/login?error=invalid_state");
      return;
    }

    // Scrub the token from the address bar / history immediately.
    // Do this after we have already captured the token so a subsequent
    // effect run cannot see a missing token and treat it as a failure.
    if (typeof window !== "undefined") {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
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
