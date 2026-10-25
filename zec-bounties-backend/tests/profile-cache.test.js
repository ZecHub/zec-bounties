const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// The users router (transitively) pulls in modules that open an SMTP
// connection / demand VAPID keys at load time. Stub them before loading,
// same as tests/assignees.test.js does for the bounties router.
for (const mod of ["../utils/sendMail", "../utils/notifyUser"]) {
  const file = require.resolve(path.join(__dirname, mod));
  require.cache[file] = {
    id: file,
    filename: file,
    loaded: true,
    exports: async () => {},
  };
}

// No Redis in tests: make cache calls no-ops instead of logging errors.
const { redisClient } = require("../config/redis");
for (const method of ["get", "setEx", "del", "incr"]) {
  redisClient[method] = async () => null;
}

const prisma = require("../prisma/client");
const router = require("../routes/users");

function handler(method, routePath) {
  const layer = router.stack.find(
    (l) => l.route?.path === routePath && l.route.methods[method],
  );
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    headersSent: false,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(body) {
      res.body = body;
      res.headersSent = true;
      return res;
    },
  };
  return res;
}

// GET /api/bounties/users caches the public directory under `users:public`
// and GET /api/bounties/users/full caches `users:all` (routes/bounties.js).
// PATCH /me/profile must evict both keys, not just `users:all`.
test("updating the profile clears both user directory caches", async () => {
  const deleted = [];
  redisClient.del = async (keys) => {
    deleted.push(...(Array.isArray(keys) ? keys : [keys]));
    return null;
  };
  const findUnique = prisma.user.findUnique;
  const update = prisma.user.update;
  prisma.user.findUnique = async () => ({ profileVisibility: null });
  prisma.user.update = async ({ data }) => ({
    id: "u1",
    bio: data.bio ?? null,
    profileVisibility: null,
    nickname: "bes",
    name: "Bes",
    avatar: null,
  });
  try {
    await handler("patch", "/me/profile")(
      { body: { bio: "bounty hunter" }, user: { id: "u1" } },
      mockRes(),
    );
  } finally {
    redisClient.del = async () => null;
    prisma.user.findUnique = findUnique;
    prisma.user.update = update;
  }
  for (const key of ["users:all", "users:public"]) {
    assert.ok(deleted.includes(key), `${key} was not cleared`);
  }
});
