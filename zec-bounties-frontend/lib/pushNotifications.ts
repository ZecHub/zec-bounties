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

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(`Notification permission: ${permission}`);
  }

  await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });

  const readyRegistration = await navigator.serviceWorker.ready;

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    throw new Error("VAPID public key is missing");
  }

  const applicationServerKey = urlBase64ToUint8Array(vapidKey);

  // Reuse an existing subscription if there is one, instead of always creating a new one
  const subscription =
    (await readyRegistration.pushManager.getSubscription()) ??
    (await readyRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    }));

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
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ endpoint }),
  });
}
