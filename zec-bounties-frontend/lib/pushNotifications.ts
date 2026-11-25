import { backendUrl } from "./configENV";

function getAuthToken(): string | null {
  try {
    return typeof localStorage !== "undefined"
      ? localStorage.getItem("authToken")
      : null;
  } catch {
    return null;
  }
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  if (typeof base64String !== "string") {
    throw new Error("VAPID public key must be a string");
  }
  const trimmed = base64String.trim();
  if (!trimmed) {
    throw new Error("VAPID public key is empty");
  }
  const padding = "=".repeat((4 - (trimmed.length % 4)) % 4);
  const base64 = (trimmed + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = globalThis.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToPush() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported");
  }
  if (typeof window === "undefined" || !("PushManager" in window)) {
    throw new Error("Push API is not supported");
  }
  if (typeof Notification === "undefined") {
    throw new Error("Notifications are not supported");
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

  const token = getAuthToken();
  const res = await fetch(`${backendUrl}/api/notifications/push/subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(subscription.toJSON()),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body?.error || "Failed to register push subscription with server",
    );
  }

  return subscription;
}

export async function unsubscribeFromPush() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  const token = getAuthToken();
  const res = await fetch(`${backendUrl}/api/notifications/push/unsubscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ endpoint }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body?.error || "Failed to unregister push subscription with server",
    );
  }
}
