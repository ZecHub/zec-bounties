// app/onboarding/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBounty } from "@/lib/bounty-context";
import { AdminNavbar } from "@/components/layout/admin/navbar";

type RoleChoice = "HUNTER" | "TEAM";

const ROLE_COPY: Record<
  RoleChoice,
  {
    title: string;
    tagline: string;
    points: string[];
    redirect: string;
    cta: string;
  }
> = {
  HUNTER: {
    title: "Hunter",
    tagline: "Take on bounties. Get paid in ZEC.",
    points: [
      "Browse open bounties across every community",
      "Apply, get assigned, and submit your work",
      "Get paid directly to your z-address on completion",
    ],
    redirect: "/home",
    cta: "Seal as hunter",
  },
  TEAM: {
    title: "Team",
    tagline: "Post bounties. Build with your crew.",
    points: [
      "Create and fund bounties for your community",
      "Review submissions and approve payouts",
      "Manage members and a shared team wallet",
    ],
    redirect: "/teams",
    cta: "Seal as team",
  },
};

export default function OnboardingPage() {
  const { currentUser, isLoading, selectRole } = useBounty();
  const router = useRouter();
  const [sealing, setSealing] = useState<RoleChoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Guard: only CLIENT users mid-onboarding belong here.
  useEffect(() => {
    if (isLoading) return;
    if (!currentUser) {
      router.replace("/login");
      return;
    }
    if (currentUser.role !== "CLIENT") {
      router.replace(currentUser.role === "ADMIN" ? "/admin" : "/home");
    }
  }, [isLoading, currentUser, router]);

  const handleChoose = async (role: RoleChoice) => {
    if (sealing) return;
    setError(null);
    setSealing(role);

    const ok = await selectRole(role);

    if (!ok) {
      setError("Couldn't set your role. Try again.");
      setSealing(null);
      return;
    }

    // Let the seal animation play before navigating away.
    setTimeout(() => {
      router.push(ROLE_COPY[role].redirect);
    }, 900);
  };

  if (isLoading || !currentUser || currentUser.role !== "CLIENT") {
    return null;
  }

  return (
    <>
      {currentUser.isRobin && <AdminNavbar />}

      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-16 text-foreground">
        <div className="mb-12 max-w-xl text-center">
          <img
            src="/ZecHubBlue.png"
            alt="ZecBounties"
            className="mx-auto mb-6 h-30 w-auto"
          />
          <span className="mb-4 block text-xs font-semibold uppercase tracking-widest text-primary">
            Account setup
          </span>
          <h1 className="mb-3 text-3xl font-extrabold tracking-tight md:text-4xl">
            Choose how you work the board
          </h1>
          <p className="text-muted-foreground text-lg">
            This sets your role on ZEC Bounties. You'll act as one from here on.
          </p>
        </div>

        <div className="grid w-full max-w-3xl grid-cols-1 gap-5 md:grid-cols-2">
          {(Object.keys(ROLE_COPY) as RoleChoice[]).map((role) => {
            const copy = ROLE_COPY[role];
            const isSealing = sealing === role;
            const isOtherSealing = sealing !== null && !isSealing;

            return (
              <button
                key={role}
                type="button"
                onClick={() => handleChoose(role)}
                disabled={sealing !== null}
                aria-busy={isSealing}
                className={`group relative flex flex-col gap-4 overflow-hidden rounded-xl border bg-card p-7 text-left shadow-sm transition motion-reduce:transition-none ${
                  isSealing
                    ? "border-primary"
                    : "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                } ${isOtherSealing ? "cursor-default opacity-45" : "cursor-pointer"}`}
              >
                <div className="flex items-baseline gap-2.5">
                  <span className="text-xs text-muted-foreground">
                    {role === "HUNTER" ? "01" : "02"}
                  </span>
                  <span className="text-xl font-semibold">{copy.title}</span>
                </div>

                <p className="text-sm text-muted-foreground">{copy.tagline}</p>

                <ul className="flex flex-col gap-2">
                  {copy.points.map((point) => (
                    <li
                      key={point}
                      className="relative pl-4 text-xs leading-relaxed text-muted-foreground before:absolute before:left-0 before:content-['—'] before:text-primary"
                    >
                      {point}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto flex items-center justify-between border-t pt-3 text-sm font-medium">
                  <span className="text-primary">
                    {isSealing ? "Sealing…" : copy.cta}
                  </span>
                  <span
                    className="text-primary transition-transform motion-reduce:transition-none group-hover:translate-x-1"
                    aria-hidden="true"
                  >
                    →
                  </span>
                </div>

                {isSealing && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-background/95 motion-reduce:animate-none [animation:seal-in_0.25s_ease]">
                    <div className="flex h-[84px] w-[84px] -rotate-[8deg] items-center justify-center rounded-full border-2 border-primary motion-reduce:animate-none [animation:seal-stamp_0.35s_cubic-bezier(0.2,1.4,0.4,1)]">
                      <span className="text-[11px] font-semibold tracking-widest text-primary">
                        SEALED
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date().toISOString().split("T")[1].slice(0, 8)} UTC
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {error && <p className="mt-5 text-xs text-destructive">{error}</p>}

        <p className="mt-8 max-w-xl text-center text-xs text-muted-foreground">
          This choice sets your account type. Contact an admin if you need it
          changed later.
        </p>
      </div>
    </>
  );
}
