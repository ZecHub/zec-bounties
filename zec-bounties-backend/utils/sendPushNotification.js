const webpush = require("./pushNotifications");

async function sendPushNotification(subscription, notification) {
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

    return true;
  } catch (error) {
    console.error("Push notification failed:", error);

    // If it's a transient server error (like 500 or 429), return true so we DON'T delete the subscription
    if (error.statusCode === 410 || error.statusCode === 404) {
      return false;
    }
    return true;
  }
}

module.exports = sendPushNotification;
