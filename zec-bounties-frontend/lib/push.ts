"use client";

import { backendUrl } from "./configENV";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

/**
 * The browser state a user can actually observe. `readPushState` only reads —
 * it never asks for permission and never creates a subscription, so it is safe
 * to call on render and from a click handler alike.
 */
export type PushState =
  | "unsupported" // no service worker / Push API / Notification API
  | "blocked" // permission === "denied" — only the browser UI can undo this
  | "off" // permission default or granted, but no push subscription exists
  | "on"; // a live subscription is registered with the browser

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Read the current state without side effects.
 *
 * `swReady` is false when no service worker has been registered yet, which is
 * common on a fresh browser: `navigator.serviceWorker.ready` never resolves
 * until something registers one, so it must not be awaited blindly here.
 */
export async function readPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return "off";
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return "off";
    return Notification.permission === "granted" ? "on" : "off";
  } catch {
    return "off";
  }
}

async function postSubscription(subscription: PushSubscription) {
  const token = localStorage.getItem("authToken");
  const res = await fetch(`${backendUrl}/api/notifications/push/subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(subscription.toJSON()),
  });

  if (!res.ok) {
    throw new Error("Failed to register push subscription with server");
  }
}

/**
 * Subscribe from an explicit user action.
 *
 * Order matters: the subscription is created and confirmed before the backend
 * is told about it. The old flow wrote a "attempted" timestamp before knowing
 * whether enrollment worked, which suppressed retries for 14 days even though
 * the browser had no subscription. Failure is now reported to the caller and
 * leaves no local state behind, so the retry button works immediately.
 */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";

  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  await navigator.serviceWorker.ready;

  let permission: NotificationPermission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    return permission === "denied" ? "blocked" : "off";
  }

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    throw new Error("VAPID public key is missing");
  }

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    }));

  try {
    await postSubscription(subscription);
  } catch (error) {
    // Registration on our side failed, so the browser subscription is useless:
    // drop it instead of leaving the UI claiming push is enabled.
    if (!existing) await subscription.unsubscribe().catch(() => {});
    throw error;
  }

  return "on";
}

/** Back-compat wrapper for existing callers that only want to subscribe. */
export async function subscribeToPush() {
  const state = await enablePush();
  if (state !== "on") {
    throw new Error(`Notification permission/enrollment: ${state}`);
  }
  return true;
}

export async function disablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return "off";

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  const token = localStorage.getItem("authToken");
  await fetch(`${backendUrl}/api/notifications/push/unsubscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ endpoint }),
  }).catch(() => {});

  return readPushState();
}

/** Back-compat alias. */
export const unsubscribeFromPush = disablePush;
