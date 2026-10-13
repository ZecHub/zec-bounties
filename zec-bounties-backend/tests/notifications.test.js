const test = require("node:test");
const assert = require("node:assert/strict");

function loadSendPushNotification(sendNotification) {
  const pushPath = require.resolve("../utils/pushNotifications");
  const senderPath = require.resolve("../utils/sendPushNotification");

  require.cache[pushPath] = {
    id: pushPath,
    filename: pushPath,
    loaded: true,
    exports: { sendNotification },
  };
  delete require.cache[senderPath];

  return require(senderPath);
}

const subscription = {
  endpoint: "https://push.example.test/subscription",
  p256dh: "p256dh-key",
  auth: "auth-key",
};

test("push delivery reports a successful send truthfully", async () => {
  const sendPushNotification = loadSendPushNotification(async () => {});
  const result = await sendPushNotification(subscription, {
    title: "Test",
    body: "Hello",
  });

  assert.deepEqual(result, {
    delivered: true,
    removeSubscription: false,
    statusCode: null,
  });
});

test("dead push subscriptions are marked for cleanup", async () => {
  const sendPushNotification = loadSendPushNotification(async () => {
    const error = new Error("Gone");
    error.statusCode = 410;
    throw error;
  });

  const result = await sendPushNotification(subscription, { title: "Test" });

  assert.equal(result.delivered, false);
  assert.equal(result.removeSubscription, true);
  assert.equal(result.statusCode, 410);
});

test("transient push failures are not reported as successful deliveries", async () => {
  const sendPushNotification = loadSendPushNotification(async () => {
    const error = new Error("Service unavailable");
    error.statusCode = 500;
    throw error;
  });

  const result = await sendPushNotification(subscription, { title: "Test" });

  assert.equal(result.delivered, false);
  assert.equal(result.removeSubscription, false);
  assert.equal(result.statusCode, 500);
});

test("in-app notifications are persisted even when users cannot receive push", async () => {
  const prismaPath = require.resolve("../prisma/client");
  const cachePath = require.resolve("../utils/cache");
  const sendMailPath = require.resolve("../utils/sendMail");
  const notifyUserPath = require.resolve("../utils/notifyUser");
  const helperPath = require.resolve("../utils/bountyHelpers");

  let persisted = [];
  let pushRecipients = [];

  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: {
      inAppNotification: {
        createMany: async ({ data }) => {
          persisted = data;
          return { count: data.length };
        },
      },
      user: {
        findMany: async () => [{ id: "u2" }],
      },
    },
  };

  require.cache[cachePath] = {
    id: cachePath,
    filename: cachePath,
    loaded: true,
    exports: {
      delCache: async () => {},
      bumpVersion: async () => {},
    },
  };

  require.cache[sendMailPath] = {
    id: sendMailPath,
    filename: sendMailPath,
    loaded: true,
    exports: async () => {},
  };

  require.cache[notifyUserPath] = {
    id: notifyUserPath,
    filename: notifyUserPath,
    loaded: true,
    exports: async (userId) => {
      pushRecipients.push(userId);
    },
  };

  delete require.cache[helperPath];
  const { sendPushToOptedIn } = require(helperPath);

  await sendPushToOptedIn(["u1", "u2", "u1"], {
    type: "BOUNTY_UPDATED",
    title: "Bounty updated",
    body: "Deadline changed",
    url: "/bounty/b1",
  });

  assert.deepEqual(
    persisted.map((item) => item.userId),
    ["u1", "u2"],
  );
  assert.equal(persisted[0].title, "Bounty updated");
  assert.equal(persisted[0].bountyId, "b1");
  assert.deepEqual(pushRecipients, ["u2"]);
});

[executed on device: ayobami-Latitude-7490 (7d1414a3-3c53-4ca4-bd2e-0634cf62f6c1)]