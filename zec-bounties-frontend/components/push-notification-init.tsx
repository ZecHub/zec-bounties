"use client";

import { useEffect } from "react";
import { useBounty } from "@/lib/bounty-context";
import { readPushState, enablePush } from "@/lib/push";

/**
 * Keeps the browser's existing push subscription in sync with the backend.
 *
 * This deliberately does not ask for permission. Browser notification
 * permission must come from an explicit click (see NotificationsInbox), because
 * a permission prompt fired from a timer is dismissed automatically by every
 * modern browser and then counts as a denial. Previously this component wrote
 * an "attempted" timestamp 3s after load — before knowing whether enrollment
 * succeeded — which suppressed retries for 14 days while the browser had no
 * subscription at all.
 *
 * The only automatic work left is re-syncing a subscription that already
 * exists and was already granted.
 */
export function PushNotificationInit() {
  const { currentUser } = useBounty();

  useEffect(() => {
    if (!currentUser) return;

    let active = true;
    const sync = async () => {
      const state = await readPushState();
      if (!active || state !== "on") return;
      try {
        // Cheap and idempotent: the endpoint upsert keeps the row fresh.
        await enablePush();
      } catch (error) {
        console.error("Push subscription re-sync failed:", error);
      }
    };

    void sync();
    return () => {
      active = false;
    };
  }, [currentUser]);

  return null;
}
