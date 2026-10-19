"use client";

import { useBounty } from "@/lib/bounty-context";

// Task creation is halted for everyone unless this is explicitly "false".
// The accessibility tests turn it off so they can exercise the create form.
export const FORCE_TASK_CREATION_BLOCKED =
  process.env.NEXT_PUBLIC_TASK_CREATION_HALTED !== "false";

export function useTaskCreationBlocked(): boolean {
  const { currentUser } = useBounty();
  return FORCE_TASK_CREATION_BLOCKED || currentUser?.canCreateTasks === false;
}
