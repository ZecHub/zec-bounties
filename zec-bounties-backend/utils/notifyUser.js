const prisma = require("../prisma/client");
const sendPushNotification = require("./sendPushNotification");

async function notifyUser(userId, notification) {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });
  console.log(
    `notifyUser(${userId}): ${subscriptions.length} subscription(s) found`,
  );

  await Promise.all(
    subscriptions.map(async (subscription) => {
      const success = await sendPushNotification(subscription, notification);
      console.log(
        `  -> endpoint ${subscription.endpoint.slice(0, 40)}... success=${success}`,
      );
      if (!success) {
        await prisma.pushSubscription
          .delete({ where: { id: subscription.id } })
          .catch(() => {});
      }
    }),
  );
}

module.exports = notifyUser;
