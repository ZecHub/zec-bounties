const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadNotificationsRouter(overrides = {}) {
  const calls = {
    updateMany: [],
    deleteMany: [],
    upsert: [],
  };
  const routes = {};

  const db = {
    inAppNotification: {
      findMany: async () => [],
      count: async () => 0,
      updateMany: async (args) => {
        calls.updateMany.push(args);
        return { count: overrides.updateCount ?? 1 };
      },
    },
    pushSubscription: {
      upsert: async (args) => {
        calls.upsert.push(args);
      },
      findMany: async () => [],
      deleteMany: async (args) => {
        calls.deleteMany.push(JSON.parse(JSON.stringify(args)));
        return { count: 1 };
      },
    },
  };

  const dependencies = {
    express: {
      Router: () =>
        new Proxy(
          {},
          {
            get: (_, method) => (url, ...handlers) => {
              routes[`${method} ${url}`] = handlers;
            },
          },
        ),
    },
    "../prisma/client": db,
    "../middleware/auth": { authenticate: () => {} },
    "../utils/pushEndpoint": require("../utils/pushEndpoint"),
  };

  const filename = path.join(__dirname, "../routes/notifications.js");
  const mod = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(filename, "utf8"),
    {
      module: mod,
      exports: mod.exports,
      require: (name) => dependencies[name],
      console: { log() {}, error() {} },
    },
    { filename },
  );

  async function invoke(routeKey, req = {}) {
    const res = {
      statusCode: 200,
      body: undefined,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = JSON.parse(JSON.stringify(payload));
        return this;
      },
    };
    await routes[routeKey].at(-1)(
      { user: { id: "user-1" }, params: {}, body: {}, ...req },
      res,
    );
    return res;
  }

  return { calls, invoke };
}

test("POST /push/unsubscribe rejects non-string, filter-object, blank, and missing-body endpoints", async () => {
  const { calls, invoke } = loadNotificationsRouter();

  for (const body of [
    undefined,
    null,
    {},
    { endpoint: "" },
    { endpoint: "   " },
    { endpoint: { not: "" } },
    { endpoint: ["https://fcm.googleapis.com/x"] },
    { endpoint: 12345 },
    { endpoint: "x".repeat(1025) },
  ]) {
    const res = await invoke("post /push/unsubscribe", { body });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "endpoint required");
  }

  assert.equal(calls.deleteMany.length, 0);
});

test("POST /push/unsubscribe trims valid string endpoint and scopes deletion to current user", async () => {
  const { calls, invoke } = loadNotificationsRouter();
  const endpoint = "https://fcm.googleapis.com/fcm/send/token-123";

  const res = await invoke("post /push/unsubscribe", {
    user: { id: "user-42" },
    body: { endpoint: `  ${endpoint}  ` },
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
  assert.equal(calls.deleteMany.length, 1);
  assert.deepEqual(calls.deleteMany[0], {
    where: { endpoint, userId: "user-42" },
  });
});

test("POST /push/subscribe returns 400 instead of 500 when req.body is missing or non-object", async () => {
  const { calls, invoke } = loadNotificationsRouter();

  for (const body of [undefined, null, "not-an-object"]) {
    const res = await invoke("post /push/subscribe", { body });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "Invalid push subscription");
  }

  assert.equal(calls.upsert.length, 0);
});

test("PATCH /:notificationId/read rejects blank notificationId and trims valid IDs", async () => {
  const { calls, invoke } = loadNotificationsRouter({ updateCount: 1 });

  const blank = await invoke("patch /:notificationId/read", {
    params: { notificationId: "   " },
  });
  assert.equal(blank.statusCode, 400);
  assert.equal(calls.updateMany.length, 0);

  const ok = await invoke("patch /:notificationId/read", {
    user: { id: "user-7" },
    params: { notificationId: "  notif-99  " },
  });
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(ok.body, { success: true, updated: true });
  assert.equal(calls.updateMany.length, 1);
  assert.equal(calls.updateMany[0].where.id, "notif-99");
  assert.equal(calls.updateMany[0].where.userId, "user-7");
});
