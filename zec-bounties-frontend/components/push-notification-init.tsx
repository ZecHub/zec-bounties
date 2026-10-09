"use client";

import { useEffect } from "react";
import { useBounty } from "@/lib/bounty-context";
import { syncExistingPushSubscription } from "@/lib/push";

export function PushNotificationInit() {
  const { currentUser } = useBounty();

  useEffect(() => {
    if (!currentUser) return;

    // Never prompt from a background effect. If the user already granted
    // permission and has a subscription, quietly make sure the backend still
    // knows about it. New/failed subscriptions are retried from the bell UI.
    syncExistingPushSubscription().catch((error) => {
      console.error("Push subscription sync failed:", error);
    });
  }, [currentUser?.id]);

  return null;
}
