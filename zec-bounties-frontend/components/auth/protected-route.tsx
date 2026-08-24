"use client";

import type React from "react";

import { useBounty } from "@/lib/bounty-context";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  blockAdmin?: boolean;
  requireTeam?: boolean;
  blockTeam?: boolean;
}

const ONBOARDING_PATH = "/onboarding";
const TEAM_HOME_PATH = "/teams";

export function ProtectedRoute({
  children,
  requireAdmin = false,
  blockAdmin = false,
  requireTeam = false,
  blockTeam = false,
}: ProtectedRouteProps) {
  const { currentUser, isLoading } = useBounty();
  const router = useRouter();
  const pathname = usePathname();

  const needsOnboarding =
    !!currentUser &&
    currentUser.role === "CLIENT" &&
    pathname !== ONBOARDING_PATH;

  useEffect(() => {
    if (isLoading) return;

    if (!currentUser) {
      router.push("/login");
      return;
    }

    if (needsOnboarding) {
      router.push(ONBOARDING_PATH);
      return;
    }

    // Non-team (but allow ADMIN) trying to access a team-only page
    if (
      requireTeam &&
      currentUser.role !== "TEAM" &&
      currentUser.role !== "ADMIN"
    ) {
      router.push("/home");
      return;
    }

    // TEAM trying to access a page that's blocked for them — mirrors blockAdmin
    if (blockTeam && currentUser.role === "TEAM") {
      router.push(TEAM_HOME_PATH);
      return;
    }

    // Non-admin trying to access admin page
    if (requireAdmin && currentUser.role !== "ADMIN") {
      router.push("/home");
      return;
    }

    // Admin trying to access non-admin page
    if (blockAdmin && currentUser.role === "ADMIN") {
      router.push("/admin");
      return;
    }
  }, [
    currentUser,
    requireAdmin,
    blockAdmin,
    requireTeam,
    blockTeam,
    router,
    isLoading,
    needsOnboarding,
  ]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-slate-600 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Redirecting...
          </p>
        </div>
      </div>
    );
  }

  if (needsOnboarding) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Setting up your account...
          </p>
        </div>
      </div>
    );
  }

  if (
    requireTeam &&
    currentUser.role !== "TEAM" &&
    currentUser.role !== "ADMIN"
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400">
            Access denied. This page is only available to team accounts.
          </p>
        </div>
      </div>
    );
  }

  if (blockTeam && currentUser.role === "TEAM") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600 dark:text-slate-400">
            Redirecting to your team console...
          </p>
        </div>
      </div>
    );
  }

  if (requireAdmin && currentUser.role !== "ADMIN") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400">
            Access denied. Admin privileges required.
          </p>
        </div>
      </div>
    );
  }

  if (blockAdmin && currentUser.role === "ADMIN") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600 dark:text-slate-400">
            Redirecting to admin console...
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
