const webpush = require("./pushNotifications");
const { isAllowedPushEndpoint } = require("./pushEndpoint");

// The push service itself says this endpoint is gone. Only these justify
// deleting the stored subscription; anything else may be a temporary outage.
const DEAD_ENDPOINT_STATUS = new Set([404, 410]);

/**
 * Deliver one push notification and report what actually happened.
 *
 * Resolves `{ delivered, keepSubscription, reason }`. Delivery and
 * subscription validity are deliberately separate answers: a failed send is not
 * proof the endpoint is dead. The old version returned `true` for every provider
 * error except 404/410, so a failed delivery looked identical to a delivered
 * one and broken enrollments were never cleaned up. It also skipped the
 * endpoint allowlist enforced by the subscribe route, so a row inserted by any
 * other means could make the server POST to a host of the subscriber's choosing.
 */
async function sendPushNotificationDetailed(subscription, notification) {
  if (!isAllowedPushEndpoint(subscription?.endpoint)) {
    return {
      delivered: false,
      keepSubscription: false,
      reason: "disallowed-endpoint",
    };
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify(notification),
      {
        TTL: 86400, // Time to live in seconds (1 day)
        headers: {
          Urgency: "high", // CRUCIAL FOR MOBILE: Forces the OS to wake up the service worker
        },
      },
    );

    return { delivered: true, keepSubscription: true };
  } catch (error) {
    const status = error?.statusCode;

    if (DEAD_ENDPOINT_STATUS.has(status)) {
      return {
        delivered: false,
        keepSubscription: false,
        reason: `dead-endpoint:${status}`,
      };
    }

    console.error("Push notification failed:", error);
    return {
      delivered: false,
      keepSubscription: true,
      reason: `transient:${status ?? "network"}`,
    };
  }
}

/**
 * Boolean form kept for existing callers: `true` means "keep the stored
 * subscription", `false` means it is dead and should be removed.
 */
async function sendPushNotification(subscription, notification) {
  const { keepSubscription } = await sendPushNotificationDetailed(
    subscription,
    notification,
  );
  return keepSubscription;
}

module.exports = sendPushNotification;
module.exports.sendPushNotificationDetailed = sendPushNotificationDetailed;