// Once a payout is authorised, in flight or done, the edit route freezes the
// assignee and reward. The other admin routes must not move the payee, change
// the assignees or change the status of that bounty either: earnings and
// leaderboard credit follow the assignee of a DONE bounty.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadRoutes } = require("./helpers/bountyValidationHarness.js");

// Returns only the selected fields, as Prisma does, so a route that does not
// select the payment flags cannot see them here either.
function project(value, select) {
  if (!select || value == null) return value;
  if (Array.isArray(value)) return value.map((item) => project(item, select));
  return Object.fromEntries(
    Object.entries(select).map(([key, nested]) => [key, project(value[key], nested.select)]),
  );
}

// A DONE bounty paid (or being paid) to alice. Bob, a second assignee, has an
// approved submission; alice's own is still pending.
function fixture(payment = {}) {
  const bounty = {
    id: "b1",
    title: "Payout fixture",
    description: "A complete local regression fixture.",
    bountyAmount: 1,
    timeToComplete: "2099-01-01T00:00:00.000Z",
    chain: "MAIN",
    createdBy: "admin",
    teamId: null,
    status: "DONE",
    isApproved: true,
    assignee: "alice",
    completedAt: new Date("2026-10-01T00:00:00.000Z"),
    isPaid: false,
    paymentAuthorized: false,
    paymentInFlight: false,
    dateCreated: new Date(),
    ...payment,
  };
  let roster = ["alice", "bob"];
  const submissions = [
    { id: "s1", bountyId: "b1", submittedBy: "bob", status: "approved" },
    { id: "s2", bountyId: "b1", submittedBy: "alice", status: "pending" },
  ];
  const writes = [];
  const full = () => ({
    ...bounty,
    assignees: roster.map((userId) => ({ bountyId: "b1", userId, user: { id: userId } })),
  });
  const db = {
    bounty: {
      findUnique: async ({ select } = {}) => project(full(), select),
      findUniqueOrThrow: async ({ select } = {}) => project(full(), select),
      update: async ({ data }) => {
        writes.push(data);
        Object.assign(bounty, data);
        return full();
      },
      updateMany: async ({ where, data }) => {
        if (where.status?.not === bounty.status) return { count: 0 };
        if (where.assignee?.notIn?.includes(bounty.assignee)) return { count: 0 };
        writes.push(data);
        Object.assign(bounty, data);
        return { count: 1 };
      },
    },
    bountyAssignee: {
      findMany: async () => full().assignees,
      deleteMany: async ({ where }) => {
        const removed = where.userId === undefined ? roster : where.userId.in ?? [where.userId];
        writes.push({ removed });
        roster = roster.filter((id) => !removed.includes(id));
      },
      createMany: async ({ data }) => {
        writes.push({ added: data.map((a) => a.userId) });
        roster = data.map((a) => a.userId);
      },
    },
    workSubmission: {
      findUnique: async ({ select }) => project({ ...submissions[0], bounty: full() }, select),
      findMany: async ({ where }) =>
        submissions.filter((s) => s.id !== where.id.not && s.status === where.status),
      updateMany: async ({ where, data }) => {
        writes.push(data);
        submissions.filter((s) => where.id.in.includes(s.id)).forEach((s) => Object.assign(s, data));
      },
    },
    user: { findMany: async () => [] },
    bountyCategory: { findUnique: async () => null },
    teamMember: { findUnique: async () => null },
    $queryRaw: async () => [],
    $transaction: async (fn) => fn(db),
  };
  return {
    ...loadRoutes(db),
    db,
    bounty,
    submissions,
    writes,
    roster: () => [...roster],
  };
}

const requests = [
  {
    action: "re-picking the winner",
    route: "status",
    body: { status: "DONE", winnerId: "bob" },
    unpaid: (h) => assert.equal(h.bounty.assignee, "bob"),
  },
  {
    action: "reopening the bounty",
    route: "status",
    body: { status: "IN_PROGRESS" },
    unpaid: (h) => assert.equal(h.bounty.status, "IN_PROGRESS"),
  },
  {
    action: "clearing the assignees",
    route: "assignees",
    body: { userIds: [] },
    unpaid: (h) => {
      assert.equal(h.bounty.status, "CANCELLED");
      assert.equal(h.bounty.assignee, null);
      assert.deepEqual(h.roster(), []);
    },
  },
  {
    action: "replacing the assignees",
    route: "assignees",
    body: { userIds: ["bob"] },
    unpaid: (h) => assert.deepEqual(h.roster(), ["bob"]),
  },
  {
    action: "Reject Bounty (isApproved: false)",
    route: "edit",
    body: { isApproved: false },
    unpaid: (h) => assert.equal(h.bounty.status, "CANCELLED"),
  },
  {
    action: "Approve Bounty (isApproved: true)",
    route: "edit",
    body: { isApproved: true },
    unpaid: (h) => assert.equal(h.bounty.status, "IN_PROGRESS"),
  },
  {
    action: "approving a bounty its creator is assigned to",
    route: "approve",
    body: {},
    bounty: { createdBy: "alice" },
    unpaid: (h) => {
      assert.equal(h.bounty.assignee, null);
      assert.deepEqual(h.roster(), ["bob"]);
    },
  },
  {
    action: "rejecting the other submissions",
    route: "rejectOthers",
    body: {},
    unpaid: (h) => {
      assert.equal(h.bounty.assignee, "bob");
      assert.equal(h.submissions[1].status, "rejected");
      assert.deepEqual(h.roster(), ["bob"]);
    },
  },
];

const frozenStates = [
  ["paid", { isPaid: true }],
  ["in flight", { paymentInFlight: true }],
  ["authorised", { paymentAuthorized: true }],
];

for (const { action, route, body, bounty } of requests) {
  for (const [state, payment] of frozenStates) {
    test(`${action} is refused once the payout is ${state}`, async () => {
      const h = fixture({ ...bounty, ...payment });
      const res = await h.request(route, body);
      assert.equal(res.statusCode, 409, JSON.stringify(res.body));
      assert.match(res.body.error, /cannot be changed once payment is authorised or in progress/);
      assert.deepEqual(h.writes, []);
      assert.equal(h.bounty.status, "DONE");
      assert.equal(h.bounty.assignee, "alice");
      assert.deepEqual(h.roster(), ["alice", "bob"]);
      assert.equal(h.submissions[1].status, "pending");
    });
  }
}

for (const { action, route, body, bounty, unpaid } of requests) {
  test(`control: ${action} still works before payment`, async () => {
    const h = fixture(bounty);
    const res = await h.request(route, body);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    unpaid(h);
  });
}

for (const [state, payment] of frozenStates) {
  test(`a title-only edit still works once the payout is ${state}`, async () => {
    const h = fixture(payment);
    const res = await h.request("edit", { title: "Renamed fixture" });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(h.bounty.title, "Renamed fixture");
    assert.equal(h.bounty.status, "DONE");
    assert.equal(h.bounty.assignee, "alice");
  });
}

test("rejecting the other submissions with none pending is still a no-op once paid", async () => {
  const h = fixture({ isPaid: true });
  h.submissions[1].status = "rejected";
  const res = await h.request("rejectOthers", {});
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.rejectedCount, 0);
  assert.deepEqual(h.writes, []);
});

test("a payout claimed after the first read is caught before the assignees change", async () => {
  const h = fixture();
  // The payout claim commits while the route waits for the bounty's row lock.
  h.db.$queryRaw = async () => {
    h.bounty.paymentInFlight = true;
    return [];
  };
  const res = await h.request("assignees", { userIds: [] });
  assert.equal(res.statusCode, 409, JSON.stringify(res.body));
  assert.deepEqual(h.writes, []);
  assert.equal(h.bounty.status, "DONE");
  assert.deepEqual(h.roster(), ["alice", "bob"]);
});
