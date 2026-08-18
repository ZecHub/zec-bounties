const prisma = require("../prisma/client");

async function notifyUser(userId, notification) {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      userId,
    },
  });

  await Promise.all(
    subscriptions.map((subscription) =>
      sendPushNotification(subscription, notification),
    ),
  );
}
