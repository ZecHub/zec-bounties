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
    );

    return true;
  } catch (error) {
    console.error("Push notification failed:", error);

    return false;
  }
}

module.exports = sendPushNotification;
