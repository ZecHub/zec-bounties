// PUT /api/bounties/:id must not treat a re-sent, unchanged bountyAmount as a
// payout edit: the edit forms send the current reward with every save.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadRoutes } = require("./helpers/bountyValidationHarness.js");

function fixture(overrides = {}) {
  const bounty = {
    id: "b1",
    title: "Validation fixture",
    description: "A complete local regression fixture.",
    bountyAmount: 0.01,
    timeToComplete: "2099-01-01T00:00:00.000Z",
    chain: "MAIN",
    createdBy: "owner",
    assignee: null,
    teamId: null,
    status: "TO_DO",
    isPaid: false,
    paymentAuthorized: false,
    paymentInFlight: false,
    dateCreated: new Date(),
    ...overrides,
  };
  const writes = [];
  const db = {
    bounty: {
      findUnique: async () => ({ ...bounty }),
      update: async ({ data }) => {
        writes.push(data);
        Object.assign(bounty, data);
        return { ...bounty, assignees: [] };
      },
    },
    bountyCategory: { findUnique: async () => null },
    bountyActivity: { create: async () => ({ id: "act1" }) },
    team: { findUnique: async () => null },
    teamMember: { findUnique: async () => null },
    $transaction: async (fn) => fn(db),
  };
  return { ...loadRoutes(db), bounty, writes };
}

test("hunter creator can fix the title inside the edit window when the reward is re-sent unchanged", async () => {
  const h = fixture();
  const res = await h.request(
    "edit",
    { title: "Renamed fixture", description: "A complete local regression fixture.", bountyAmount: 0.01 },
    { user: { id: "owner", role: "HUNTER" } },
  );
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(h.bounty.title, "Renamed fixture");
});

test("admin can fix the title of a paid bounty when the reward is re-sent unchanged", async () => {
  const h = fixture({ status: "DONE", isPaid: true });
  const res = await h.request("edit", { title: "Renamed fixture", bountyAmount: 0.01 });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(h.bounty.title, "Renamed fixture");
});

test("control: a hunter creator still cannot change the reward", async () => {
  const h = fixture();
  const res = await h.request(
    "edit",
    { bountyAmount: 5 },
    { user: { id: "owner", role: "HUNTER" } },
  );
  assert.equal(res.statusCode, 403);
  assert.equal(h.writes.length, 0);
});

test("control: the reward of a paid bounty still cannot change", async () => {
  const h = fixture({ status: "DONE", isPaid: true });
  const res = await h.request("edit", { bountyAmount: 5 });
  assert.equal(res.statusCode, 409);
  assert.equal(h.writes.length, 0);
});
