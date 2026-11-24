const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadNotifyUser({ prisma, sendPushNotification }) {
  const filename = path.join(__dirname, "../utils/notifyUser.js");
  const mod = { exports: {} };
  const deps = {
    "../prisma/client": prisma,
    "./sendPushNotification": sendPushNotification,
  };
  vm.runInNewContext(
    fs.readFileSync(filename, "utf8"),
    {
      module: mod,
      exports: mod.exports,
      require(name) {
        if (Object.hasOwn(deps, name)) return deps[name];
        throw new Error(`Unexpected dependency: ${name}`);
      },
      console: { log() {}, error() {} },
    },
    { filename },
  );
  return mod.exports;
}

test("notifyUser ignores missing, null, non-string, or blank userId without querying Prisma", async () => {
  let findManyCalls = 0;
  const notifyUser = loadNotifyUser({
    prisma: {
      pushSubscription: {
        findMany: async () => {
          findManyCalls += 1;
          return [];
        },
        delete: async () => {},
      },
    },
    sendPushNotification: async () => true,
  });

  for (const invalidId of [undefined, null, "", "   ", 123, {}]) {
    await notifyUser(invalidId, { title: "Hello" });
  }
  assert.equal(findManyCalls, 0);
});

test("notifyUser delivers to all user subscriptions and deletes only failed ones", async () => {
  const sent = [];
  const deleted = [];
  const notifyUser = loadNotifyUser({
    prisma: {
      pushSubscription: {
        findMany: async ({ where }) => {
          assert.equal(where.userId, "user-1");
          assert.deepEqual(Object.keys(where), ["userId"]);
          return [
            { id: "sub-ok", endpoint: "https://fcm.googleapis.com/fcm/send/ok" },
            { id: "sub-gone", endpoint: "https://fcm.googleapis.com/fcm/send/gone" },
          ];
        },
        delete: async ({ where }) => {
          deleted.push(where.id);
        },
      },
    },
    sendPushNotification: async (sub, payload) => {
      sent.push({ id: sub.id, payload });
      return sub.id === "sub-ok";
    },
  });

  await notifyUser("user-1", { title: "Paid" });
  assert.equal(sent.length, 2);
  assert.deepEqual(deleted, ["sub-gone"]);
});

test("notifyUser isolates throwing sendPushNotification and handles missing endpoint safely", async () => {
  const deleted = [];
  const notifyUser = loadNotifyUser({
    prisma: {
      pushSubscription: {
        findMany: async () => [
          { id: "sub-throw", endpoint: null },
          { id: "sub-stale", endpoint: undefined },
          { id: "sub-ok", endpoint: "https://updates.push.services.mozilla.com/wpush/v2/abc" },
        ],
        delete: async ({ where }) => {
          deleted.push(where.id);
        },
      },
    },
    sendPushNotification: async (sub) => {
      if (sub.id === "sub-throw") throw new Error("network boom");
      if (sub.id === "sub-stale") return false;
      return true;
    },
  });

  await assert.doesNotReject(() => notifyUser("user-2", { title: "Update" }));
  assert.deepEqual(deleted, ["sub-stale"]);
});

test("notifyUser swallows Prisma delete errors when cleaning up stale subscriptions", async () => {
  const notifyUser = loadNotifyUser({
    prisma: {
      pushSubscription: {
        findMany: async () => [{ id: "sub-race", endpoint: "https://fcm.googleapis.com/fcm/send/x" }],
        delete: async () => {
          throw new Error("Record to delete does not exist");
        },
      },
    },
    sendPushNotification: async () => false,
  });

  await assert.doesNotReject(() => notifyUser("user-3", { title: "Test" }));
});
