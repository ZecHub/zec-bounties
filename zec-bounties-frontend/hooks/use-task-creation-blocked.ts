"use client";

import { useBounty } from "@/lib/bounty-context";

export const FORCE_TASK_CREATION_BLOCKED = false;

export function useTaskCreationBlocked(): boolean {
  const { currentUser, bountyQuota } = useBounty();
  if (FORCE_TASK_CREATION_BLOCKED) return true;
  if (currentUser?.canCreateTasks === false) return true;
  if (
    currentUser?.role === "HUNTER" &&
    bountyQuota?.postEligibility?.allowed === false
  ) {
    return true;
  }
  return false;
}
