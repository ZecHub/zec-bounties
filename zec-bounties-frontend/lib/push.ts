"use client";

import { backendUrl } from "./configENV";

export type PushSubscriptionState =
  | "unsupported"
  | "blocked"
  | "available"
  | "subscribed";

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

function getToken() {
  return localStorage.getItem("authToken");
}

async function registerSubscriptionWithServer(subscription: PushSubscription) {
  const token = getToken();
  if (!token) {
    throw new Error("You must be signed in to enable browser notifications");
  }

  const res = await fetch(`${backendUrl}/api/notifications/push/subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(subscription.toJSON()),
  });

  if (!res.ok) {
    throw new Error("Failed to register push subscription with server");
  }
}

function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function getPushSubscriptionState(): Promise<PushSubscriptionState> {
  if (!pushSupported()) return "unsupported";

  if (Notification.permission === "denied") {
    return "blocked";
  }

  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return "available";

  const subscription = await registration.pushManager.getSubscription();
  return subscription ? "subscribed" : "available";
}

export async function syncExistingPushSubscription() {
  if (!pushSupported() || Notification.permission !== "granted") {
    return null;
  }

  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return null;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return null;

  await registerSubscriptionWithServer(subscription);
  return subscription;
}

export async function subscribeToPush() {
  if (!pushSupported()) {
    throw new Error("Browser notifications are not supported");
  }

  let permission = Notification.permission;
  if (permission === "default") {
    // Keep the permission request directly inside the user's click gesture.
    // Awaiting service-worker setup first can consume transient user activation
    // in browsers that require a gesture for notification permission prompts.
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Browser notifications are blocked in your browser settings"
        : "Notification permission was not granted",
    );
  }

  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });

  await navigator.serviceWorker.ready;

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    throw new Error("VAPID public key is missing");
  }

  const applicationServerKey = urlBase64ToUint8Array(vapidKey);
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    }));

  await registerSubscriptionWithServer(subscription);

  // Clear the old failed-attempt suppression flag from previous versions.
  localStorage.removeItem("zecBountiesPushAttempted");
  localStorage.setItem("zecBountiesPushSubscribedAt", String(Date.now()));

  return subscription;
}

export async function unsubscribeFromPush() {
  if (!pushSupported()) return;

  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  const token = getToken();

  await subscription.unsubscribe();

  if (token) {
    const res = await fetch(`${backendUrl}/api/notifications/push/unsubscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ endpoint }),
    });

    if (!res.ok) {
      throw new Error("Browser alerts were disabled locally, but server cleanup failed");
    }
  }

  localStorage.removeItem("zecBountiesPushSubscribedAt");
}
