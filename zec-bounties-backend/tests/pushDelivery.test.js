const test = require("node:test");
const assert = require("node:assert/strict");

// The push library is replaced before the module under test is loaded, so no
// request ever leaves the process.
const pushLib = require.resolve("../utils/pushNotifications");
const CHROME = "https://fcm.googleapis.com/fcm/send/abc:def";
const KEYS = { p256dh: "key", auth: "auth" };

let sent;
let behaviour;
require.cache[pushLib] = {
  id: pushLib,
  filename: pushLib,
  loaded: true,
  exports: {
    sendNotification: async () => {
      sent += 1;
      if (behaviour) throw behaviour;
    },
  },
};
const sendPushNotification = require("../utils/sendPushNotification");
// The detailed form is what callers that need to tell "not delivered" from
// "delivered" use; the default export stays boolean for existing callers.
const sendRaw = sendPushNotification.sendPushNotificationDetailed;

test.beforeEach(() => {
  sent = 0;
  behaviour = null;
});

test("a delivered push reports success and keeps the subscription", async () => {
  const result = await sendRaw({ endpoint: CHROME, ...KEYS }, {});
  assert.deepEqual(result, { delivered: true, keepSubscription: true });
  assert.equal(sent, 1);
});

test("the push service saying the endpoint is gone drops it", async () => {
  for (const statusCode of [404, 410]) {
    behaviour = Object.assign(new Error("gone"), { statusCode });
    const result = await sendRaw({ endpoint: CHROME, ...KEYS }, {});
    assert.equal(result.delivered, false);
    assert.equal(result.keepSubscription, false, `status ${statusCode}`);
    assert.match(result.reason, /dead-endpoint/);
  }
});

test("a temporary provider failure is reported as a failure but keeps the subscription", async () => {
  for (const statusCode of [429, 500, 503, undefined]) {
    behaviour = Object.assign(new Error("later"), { statusCode });
    const result = await sendRaw({ endpoint: CHROME, ...KEYS }, {});
    assert.equal(result.delivered, false, `status ${statusCode} must not look delivered`);
    assert.equal(result.keepSubscription, true, `status ${statusCode}`);
  }
});

test("an endpoint outside the allowlist gets no request at all", async () => {
  const result = await sendRaw(
    { endpoint: "https://169.254.169.254/latest", ...KEYS },
    {},
  );
  assert.equal(result.delivered, false);
  assert.equal(result.keepSubscription, false);
  assert.equal(sent, 0);
});

test("the boolean form still answers 'keep the subscription'", async () => {
  assert.equal(await sendPushNotification({ endpoint: CHROME, ...KEYS }, {}), true);
  behaviour = Object.assign(new Error("gone"), { statusCode: 410 });
  assert.equal(await sendPushNotification({ endpoint: CHROME, ...KEYS }, {}), false);
});
