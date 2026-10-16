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

// One bounty whose legacy `assignee` points to "legacy", and its join-table rows.
function useFakeDb(assigneeIds, status = "IN_PROGRESS") {
  const db = {
    bounty: {
      id: "b1",
      title: "task",
      status,
      isApproved: true,
      isPrivate: false,
      teamId: null,
      createdBy: "creator",
      assignee: "legacy",
    },
    rows: assigneeIds.map((userId) => ({ bountyId: "b1", userId })),
  };
  const withUser = (row) => ({ ...row, user: { id: row.userId } });

  prisma.bounty.findUnique = async () => ({
    ...db.bounty,
    workSubmissions: [],
    assignees: db.rows.map(withUser),
  });
  prisma.bounty.findUniqueOrThrow = async () => db.bounty;
  prisma.bounty.update = async ({ data }) => Object.assign(db.bounty, data);
  prisma.bounty.updateMany = async ({ where, data }) => {
    const current = db.bounty.assignee;
    const hit =
      where.id === db.bounty.id &&
      where.status?.not !== db.bounty.status &&
      (typeof where.assignee === "object"
        ? current !== null && !where.assignee.notIn.includes(current)
        : current === where.assignee);
    if (!hit) return { count: 0 };
    Object.assign(db.bounty, data);
    return { count: 1 };
  };
  prisma.bountyAssignee.findUnique = async ({ where }) =>
    db.rows.find((r) => r.userId === where.bountyId_userId.userId) ?? null;
  prisma.bountyAssignee.findMany = async () => db.rows.map(withUser);
  prisma.bountyAssignee.delete = async ({ where }) => {
    const row = db.rows.find((r) => r.userId === where.bountyId_userId.userId);
    if (!row) throw new Error("Record to delete does not exist");
    db.rows = db.rows.filter((r) => r !== row);
    return withUser(row);
  };
  prisma.bountyAssignee.deleteMany = async () => {
    db.rows = [];
  };
  prisma.bountyAssignee.createMany = async ({ data }) => {
    db.rows.push(...data);
  };
  prisma.bountyActivity.create = async () => null;
  prisma.user.findMany = async () => [];
  prisma.$queryRaw = async () => [{ id: "b1" }];
  prisma.$transaction = async (arg) =>
    typeof arg === "function" ? arg(prisma) : Promise.all(arg);
  return db;
}

const admin = { id: "admin", role: "ADMIN" };

async function assertCannotSubmit(userId) {
  const res = mockRes();
  await handler("post", "/:id/submit")(
    {
      params: { id: "b1" },
      body: { description: "done" },
      user: { id: userId, role: "HUNTER" },
    },
    res,
  );
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "You are not assigned to this bounty" });
}

test("removing the legacy assignee clears the field and blocks their submissions", async () => {
  const db = useFakeDb(["legacy", "other"]);
  const res = mockRes();
  await handler("delete", "/:id/assignees/:userId")(
    { params: { id: "b1", userId: "legacy" }, user: admin },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(db.bounty.assignee, null);
  await assertCannotSubmit("legacy");
});

test("removing another assignee keeps the legacy field", async () => {
  const db = useFakeDb(["legacy", "other"]);
  await handler("delete", "/:id/assignees/:userId")(
    { params: { id: "b1", userId: "other" }, user: admin },
    mockRes(),
  );
  assert.equal(db.bounty.assignee, "legacy");
});

test("replacing assignees without the legacy assignee clears the field", async () => {
  const db = useFakeDb(["legacy"]);
  const res = mockRes();
  await handler("post", "/:id/assignees")(
    { params: { id: "b1" }, body: { userIds: ["other"] }, user: admin },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(db.bounty.assignee, null);
  await assertCannotSubmit("legacy");
});

test("replacing assignees that keeps the legacy assignee keeps the field", async () => {
  const db = useFakeDb(["legacy"]);
  await handler("post", "/:id/assignees")(
    {
      params: { id: "b1" },
      body: { userIds: ["legacy", "other"] },
      user: admin,
    },
    mockRes(),
  );
  assert.equal(db.bounty.assignee, "legacy");
});

test("removing assignees from a DONE bounty keeps its payee", async () => {
  const db = useFakeDb(["legacy", "other"], "DONE");
  await handler("delete", "/:id/assignees/:userId")(
    { params: { id: "b1", userId: "legacy" }, user: admin },
    mockRes(),
  );
  assert.equal(db.bounty.assignee, "legacy");

  await handler("post", "/:id/assignees")(
    { params: { id: "b1" }, body: { userIds: ["other"] }, user: admin },
    mockRes(),
  );
  assert.equal(db.bounty.assignee, "legacy");
});

test("changing the assignees clears the cached list for admins and for other viewers", async () => {
  useFakeDb(["legacy", "other"]);
  const written = [];
  const deleted = [];
  redisClient.setEx = async (key) => {
    written.push(key);
    return null;
  };
  redisClient.del = async (keys) => {
    deleted.push(...(Array.isArray(keys) ? keys : [keys]));
    return null;
  };
  try {
    for (const user of [admin, { id: "other", role: "HUNTER" }]) {
      await handler("get", "/:id/assignees")(
        { params: { id: "b1" }, user },
        mockRes(),
      );
    }
    const cachedLists = written.filter((key) => key.startsWith("assignees:"));
    assert.equal(new Set(cachedLists).size, 2);

    await handler("delete", "/:id/assignees/:userId")(
      { params: { id: "b1", userId: "other" }, user: admin },
      mockRes(),
    );
    for (const key of cachedLists) {
      assert.ok(deleted.includes(key), `${key} was not cleared`);
    }
  } finally {
    redisClient.setEx = async () => null;
    redisClient.del = async () => null;
  }
});
