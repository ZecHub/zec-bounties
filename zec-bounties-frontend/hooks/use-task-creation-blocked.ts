"use client";

import { useBounty } from "@/lib/bounty-context";

export const FORCE_TASK_CREATION_BLOCKED = true;

export function useTaskCreationBlocked(): boolean {
  const { currentUser } = useBounty();
  return FORCE_TASK_CREATION_BLOCKED || currentUser?.canCreateTasks === false;
}
