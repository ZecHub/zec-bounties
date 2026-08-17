// components/app-prompt-banner.tsx
"use client";
import { useEffect, useState } from "react";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { subscribeToPush } from "@/lib/push";
import { useBounty } from "@/lib/bounty-context";

const INSTALL_DISMISS_KEY = "installPromptDismissedUntil";
const NOTIFY_DISMISS_KEY = "notifyPromptDismissedUntil";
const DISMISS_DAYS = 14;

function isDismissed(key: string) {
  return Date.now() < Number(localStorage.getItem(key) || 0);
}
function markDismissed(key: string) {
  localStorage.setItem(key, String(Date.now() + DISMISS_DAYS * 86400000));
}

export function AppPromptBanner() {
  const { currentUser } = useBounty();
  const { canInstall, promptInstall } = usePwaInstall();
  const [stage, setStage] = useState<"install" | "notify" | "hidden">("hidden");
  const [busy, setBusy] = useState(false);

  const needsNotifyPrompt = () =>
    !!currentUser &&
    "Notification" in window &&
    Notification.permission === "default" &&
    !isDismissed(NOTIFY_DISMISS_KEY);

  useEffect(() => {
    if (canInstall && !isDismissed(INSTALL_DISMISS_KEY)) {
      setStage("install");
    } else if (needsNotifyPrompt()) {
      setStage("notify");
    } else {
      setStage("hidden");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canInstall, currentUser]);

  const handleInstall = async () => {
    const outcome = await promptInstall();
    if (outcome !== "accepted") {
      // Only suppress the install prompt — don't touch notify state
      markDismissed(INSTALL_DISMISS_KEY);
    }
    // Either way, move on to notifications in this same visit
    setStage(needsNotifyPrompt() ? "notify" : "hidden");
  };

  const dismissInstall = () => {
    markDismissed(INSTALL_DISMISS_KEY);
    setStage(needsNotifyPrompt() ? "notify" : "hidden");
  };

  const dismissNotify = () => {
    markDismissed(NOTIFY_DISMISS_KEY);
    setStage("hidden");
  };

  const handleEnableNotifications = async () => {
    setBusy(true);
    try {
      await subscribeToPush();
    } catch (err) {
      console.error("Failed to enable notifications:", err);
    } finally {
      setBusy(false);
      setStage("hidden");
    }
  };

  if (stage === "hidden") return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-[300px] -translate-x-1/2 rounded-xl border border-white/10 bg-neutral-100 dark:bg-neutral-900 p-4 shadow-lg">
      <span className="absolute -top-2.5 right-[-9px] rounded-full border border-white/10 bg-neutral-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-300">
        Beta
      </span>
      {stage === "install" ? (
        <>
          <p className="text-sm font-medium text-black dark:text-white">
            Add Zec Bounties to your home screen
          </p>
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            Quick access, full-screen, no browser bar.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleInstall}
              className="flex-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black"
            >
              Add to Home Screen
            </button>
            <button
              onClick={dismissInstall}
              className="rounded-lg px-3 py-2 text-xs text-neutral-600 dark:text-neutral-400"
            >
              Not now
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-white">Stay in the loop</p>
          <p className="mt-1 text-xs text-neutral-400">
            Get notified about new bounties, applications, and payments.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleEnableNotifications}
              disabled={busy}
              className="flex-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black disabled:opacity-50"
            >
              {busy ? "Enabling…" : "Enable Notifications"}
            </button>
            <button
              onClick={dismissNotify}
              className="rounded-lg px-3 py-2 text-xs text-neutral-400"
            >
              Not now
            </button>
          </div>
        </>
      )}
    </div>
  );
}
