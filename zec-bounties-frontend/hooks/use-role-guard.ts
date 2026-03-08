"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBounty } from "@/lib/bounty-context";

/**
 * Redirects away from the current page if the user doesn't have the required role.
 * Call this at the top of any page that needs role protection.
 *
 * @param requiredRole - "ADMIN" | "CLIENT"
 */
export function useRoleGuard(requiredRole: "ADMIN" | "CLIENT") {
  const { currentUser, isLoading } = useBounty();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (!currentUser) {
      router.replace("/login");
      return;
    }

    if (currentUser.role !== requiredRole) {
      // Send them to the correct home for their actual role
      router.replace(currentUser.role === "ADMIN" ? "/admin" : "/home");
    }
  }, [currentUser, isLoading, requiredRole, router]);
}
