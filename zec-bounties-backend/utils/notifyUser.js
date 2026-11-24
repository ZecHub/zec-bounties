const prisma = require("../prisma/client");
const sendPushNotification = require("./sendPushNotification");

async function notifyUser(userId, notification) {
  if (typeof userId !== "string" || !userId.trim()) {
    return;
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });
  console.log(
    `notifyUser(${userId}): ${subscriptions.length} subscription(s) found`,
  );

  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      const endpointPreview =
        typeof subscription?.endpoint === "string"
          ? `${subscription.endpoint.slice(0, 40)}...`
          : "<missing>";
      let success;
      try {
        success = await sendPushNotification(subscription, notification);
      } catch (error) {
        console.error(
          `notifyUser(${userId}): push send threw for ${endpointPreview}:`,
          error,
        );
        return;
      }
      console.log(`  -> endpoint ${endpointPreview} success=${success}`);
      if (!success) {
        await prisma.pushSubscription
          .delete({ where: { id: subscription.id } })
          .catch(() => {});
      }
    }),
  );
}

module.exports = notifyUser;
