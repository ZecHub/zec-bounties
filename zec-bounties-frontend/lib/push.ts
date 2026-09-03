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

export async function subscribeToPush() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported");
  }

  if (!("PushManager" in window)) {
    throw new Error("Push API is not supported");
  }

  if (!("Notification" in window)) {
    throw new Error("Notifications are not supported");
  }

  // Register the service worker first.
  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });

  await navigator.serviceWorker.ready;

  // Ask for permission only if the user hasn't decided yet.
  let permission = Notification.permission;

  if (permission === "default") {
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    throw new Error(`Notification permission: ${permission}`);
  }

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  console.log("VAPID key exists:", !!vapidKey);
  console.log("VAPID key length:", vapidKey?.length);

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

  const token = localStorage.getItem("authToken");

  const res = await fetch(`${backendUrl}/api/notifications/push/subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token && {
        Authorization: `Bearer ${token}`,
      }),
    },
    body: JSON.stringify(subscription.toJSON()),
  });

  if (!res.ok) {
    throw new Error("Failed to register push subscription with server");
  }

  console.log("Push subscription registered successfully");

  return subscription;
}

export async function unsubscribeFromPush() {
  const registration = await navigator.serviceWorker.ready;

  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) return;

  const endpoint = subscription.endpoint;

  await subscription.unsubscribe();

  const token = localStorage.getItem("authToken");

  await fetch(`${backendUrl}/api/notifications/push/unsubscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token && {
        Authorization: `Bearer ${token}`,
      }),
    },
    body: JSON.stringify({ endpoint }),
  });
}
