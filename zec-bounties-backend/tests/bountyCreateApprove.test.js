const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// The bounties router pulls in the mailer and push modules, which open an SMTP
// connection / demand VAPID keys at load time. Stub them before loading.
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
const router = require("../routes/bounties");

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
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(body) {
      res.body = body;
      return res;
    },
  };
  return res;
}

const admin = { id: "admin", role: "ADMIN" };

test("an admin can create a bounty, and its target repo is saved", async () => {
  let saved;
  prisma.bounty.create = async ({ data }) => {
    saved = data;
    return { id: "new", ...data, createdByUser: { id: "admin" } };
  };
  prisma.user.findMany = async () => [];
  prisma.bountyActivity.create = async () => null;

  const res = mockRes();
  await handler("post", "/")(
    {
      user: admin,
      body: {
        title: "A valid title here",
        description: "A valid description that is long enough.",
        bountyAmount: 0.1,
        timeToComplete: "2027-01-01",
        categoryId: "c1",
        targetRepo: "zec-bounties",
      },
    },
    res,
  );

  assert.equal(res.statusCode, 201);
  assert.equal(saved.isApproved, true);
  assert.equal(saved.targetRepo, "zec-bounties");
});

test("approving a bounty returns the approved bounty", async () => {
  prisma.bounty.findUnique = async () => ({
    createdBy: "creator",
    assignee: null,
  });
  prisma.bounty.update = async ({ data }) => ({ id: "b1", ...data });
  prisma.bountyActivity.create = async () => null;
  prisma.$transaction = async (fn) => fn(prisma);

  const res = mockRes();
  await handler("patch", "/:id/approve")(
    { params: { id: "b1" }, user: admin },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.isApproved, true);
});
