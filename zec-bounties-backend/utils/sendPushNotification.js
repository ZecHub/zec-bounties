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
        TTL: 86400,
        headers: {
          Urgency: "high",
        },
      },
    );

    return {
      delivered: true,
      removeSubscription: false,
      statusCode: null,
    };
  } catch (error) {
    const statusCode = error?.statusCode ?? null;
    const removeSubscription = statusCode === 404 || statusCode === 410;

    console.error("Push notification failed:", {
      statusCode,
      endpoint: subscription.endpoint?.slice(0, 80),
      message: error?.message,
    });

    return {
      delivered: false,
      removeSubscription,
      statusCode,
    };
  }
}

module.exports = sendPushNotification;
