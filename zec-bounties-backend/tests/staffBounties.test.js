const test = require("node:test");
const assert = require("node:assert/strict");
const { isAdmin } = require("../middleware/auth");
const {
  FORBIDDEN_STAFF_KEYS,
  resolveStaffUser,
  buildStaffView,
  staffBountyRow,
} = require("../utils/staffBounties");

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
}

function walk(value, found) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, found);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_STAFF_KEYS.includes(key)) found.push(key);
    walk(child, found);
  }
}

test("isAdmin: non-admin gets 403 JSON and no next()", () => {
  const res = mockRes();
  let nextCalled = false;
  isAdmin({ user: { role: "HUNTER" } }, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: "Admins only" });
});

test("resolveStaffUser: ambiguous name does not pick a user", async () => {
  const prisma = {
    user: {
      findUnique: async () => null,
      findMany: async () => [
        { id: "a", name: "sam", nickname: "sam1" },
        { id: "b", name: "sam", nickname: "sam2" },
      ],
    },
  };
  const resolved = await resolveStaffUser(prisma, "sam");
  assert.equal(resolved.status, 409);
  assert.equal(resolved.user, undefined);
});

test("resolveStaffUser: unique nickname wins over a shared name", async () => {
  const prisma = {
    user: {
      findUnique: async ({ where }) =>
        where.nickname ? { id: "nick", name: "sam", nickname: "sam" } : null,
      findMany: async () => {
        throw new Error("name lookup should not run");
      },
    },
  };
  const resolved = await resolveStaffUser(prisma, "sam");
  assert.equal(resolved.user.id, "nick");
});

test("staff view pages history and drops private user fields", () => {
  const leaked = {
    id: "b1",
    title: "private task",
    description: "secret notes",
    status: "DONE",
    chain: "MAIN",
    bountyAmount: 1,
    isPrivate: true,
    isPaid: false,
    isApproved: true,
    dateCreated: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-02T00:00:00.000Z",
    paidAt: null,
    email: "hunter@example.com",
    z_address: "zs1secret",
    UA_address: "u1secret",
    githubId: "123",
    team: { name: "ZecHub" },
  };
  const row = staffBountyRow(leaked, "created");
  const found = [];
  walk(row, found);
  assert.deepEqual(found, []);

  const created = Array.from({ length: 101 }, (_, i) => ({
    ...leaked,
    id: `h${i}`,
    title: `task ${i}`,
    completedAt: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
  }));
  const view = buildStaffView(
    { id: "user", name: "sam", nickname: "sam" },
    "MAIN",
    created,
    [],
    [],
    [],
    { openOffset: 0, historyOffset: 0 },
  );
  assert.equal(view.history.length, 100);
  assert.equal(view.historyTotal, 101);
  assert.equal(view.historyNextOffset, 100);
  const next = buildStaffView(
    { id: "user", name: "sam", nickname: "sam" },
    "MAIN",
    created,
    [],
    [],
    [],
    { openOffset: 0, historyOffset: view.historyNextOffset },
  );
  assert.equal(next.history.length, 1);
  assert.equal(next.historyNextOffset, null);
  const leakedKeys = [];
  walk(view, leakedKeys);
  assert.deepEqual(leakedKeys, []);
});
