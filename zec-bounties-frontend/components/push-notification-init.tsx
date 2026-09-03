"use client";

import { useEffect } from "react";
import { useBounty } from "@/lib/bounty-context";
import { subscribeToPush } from "@/lib/push";

const PUSH_ATTEMPT_KEY = "zecBountiesPushAttempted";
const RETRY_DAYS = 14;

export function PushNotificationInit() {
  const { currentUser } = useBounty();

  useEffect(() => {
    if (!currentUser) return;

    if (!("Notification" in window)) return;

    // If the browser has already denied notifications,
    // don't keep bothering the user.
    if (Notification.permission === "denied") return;

    const previousAttempt = Number(localStorage.getItem(PUSH_ATTEMPT_KEY) || 0);

    const retryAfter = previousAttempt + RETRY_DAYS * 86400000;

    if (previousAttempt && Date.now() < retryAfter) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        localStorage.setItem(PUSH_ATTEMPT_KEY, String(Date.now()));

        await subscribeToPush();
      } catch (error) {
        console.error("Push notification initialization failed:", error);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [currentUser]);

  return null;
}
