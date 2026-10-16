const test = require("node:test");
const assert = require("node:assert/strict");
const { isAdmin } = require("../middleware/auth");
const {
  FORBIDDEN_STAFF_KEYS,
  STAFF_BOUNTY_SELECT,
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

test("resolveStaffUser: another user's display name cannot shadow a nickname", async () => {
  const users = [
    { id: "imposter", name: "sam", nickname: "sam.9" },
    { id: "real", name: "Sam Doe", nickname: "sam" },
  ];
  const prisma = {
    user: {
      findUnique: async ({ where }) =>
        users.find((u) =>
          where.id ? u.id === where.id : u.nickname === where.nickname,
        ) || null,
      findMany: async ({ where }) =>
        users.filter((u) => u.name === where.name),
    },
  };
  const resolved = await resolveStaffUser(prisma, "sam");
  assert.equal(resolved.user.id, "real");
});

test("resolveStaffUser: passes the caller's select to every lookup", async () => {
  const select = { id: true, bio: true };
  const seen = [];
  const prisma = {
    user: {
      findUnique: async (args) => {
        seen.push(args.select);
        return null;
      },
      findMany: async (args) => {
        seen.push(args.select);
        return [];
      },
    },
  };
  const resolved = await resolveStaffUser(prisma, "100%", select);
  assert.equal(resolved.status, 404);
  assert.deepEqual(seen, [select, select, select]);
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

function datedBounty(id, status, dates) {
  return {
    id,
    title: id,
    status,
    chain: "MAIN",
    bountyAmount: 1,
    isPrivate: false,
    isPaid: false,
    isApproved: true,
    dateCreated: null,
    completedAt: null,
    paidAt: null,
    team: null,
    ...dates,
  };
}

function staffViewOf(created, assigned = []) {
  return buildStaffView(
    { id: "user", name: "sam", nickname: "sam" },
    "MAIN",
    created,
    assigned,
    [],
    [],
    { openOffset: 0, historyOffset: 0 },
  );
}

test("staff view orders Date values newest first, not by weekday name", () => {
  // Wed 7 Oct, Fri 9 Oct, Mon 12 Oct 2026: as strings "Wed" > "Mon" > "Fri".
  const view = staffViewOf([
    datedBounty("wed", "DONE", { completedAt: new Date("2026-10-07T12:00:00Z") }),
    datedBounty("mon", "DONE", { completedAt: new Date("2026-10-12T12:00:00Z") }),
    datedBounty("fri", "DONE", { completedAt: new Date("2026-10-09T12:00:00Z") }),
    datedBounty("thu-open", "TO_DO", { dateCreated: new Date("2026-10-08T12:00:00Z") }),
    datedBounty("sun-open", "TO_DO", { dateCreated: new Date("2026-10-11T12:00:00Z") }),
  ]);
  assert.deepEqual(view.history.map((row) => row.id), ["mon", "fri", "wed"]);
  assert.deepEqual(view.open.map((row) => row.id), ["sun-open", "thu-open"]);
});

test("staff view orders a mix of ISO strings, dates and rows without a date", () => {
  const view = staffViewOf([
    datedBounty("undated", "CANCELLED", {}),
    datedBounty("iso", "DONE", { completedAt: "2026-10-09T12:00:00.000Z" }),
    datedBounty("paid", "DONE", { paidAt: new Date("2026-10-12T12:00:00Z") }),
    datedBounty("created", "CANCELLED", { dateCreated: new Date("2026-10-07T12:00:00Z") }),
  ]);
  assert.deepEqual(view.history.map((row) => row.id), ["paid", "iso", "created", "undated"]);
});

test("staff select reads every bounty column the staff row uses", () => {
  const read = new Set();
  const spy = new Proxy(
    {},
    {
      get(_target, key) {
        read.add(key);
        return undefined;
      },
    },
  );
  staffBountyRow(spy, "assigned");
  const missing = [...read].filter((key) => !STAFF_BOUNTY_SELECT[key]);
  assert.deepEqual(missing, []);
});

test("an exported, not yet paid bounty counts as earned once exportedAt is selected", () => {
  assert.equal(STAFF_BOUNTY_SELECT.exportedAt, true);
  const exported = datedBounty("exported", "DONE", {
    completedAt: new Date("2026-10-10T12:00:00Z"),
    exportedAt: new Date("2026-10-11T23:07:00Z"),
    bountyAmount: 0.05,
  });
  const view = staffViewOf([], [exported]);
  assert.equal(view.history[0].exportedAt.toISOString(), "2026-10-11T23:07:00.000Z");
  assert.equal(view.zecEarned, 0.05);
});
