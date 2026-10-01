const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadRoutes } = require("./helpers/bountyValidationHarness");

const valid = {
  title: "Validation fixture", description: "A complete local regression fixture.",
  bountyAmount: 0.01, timeToComplete: "2099-01-01T00:00:00.000Z",
  categoryId: "Development", assignee: "none", chain: "MAIN",
};

function fixture() {
  const bounty = { id: "b1", ...valid, createdBy: "owner", teamId: null, status: "TO_DO" };
  const writes = [];
  const db = {
    bounty: {
      findUnique: async () => ({ ...bounty }),
      create: async ({ data }) => {
        writes.push(data);
        return { id: "new-bounty", ...data, createdByUser: { name: "Fixture" } };
      },
      update: async ({ data }) => { writes.push(data); Object.assign(bounty, data); return { ...bounty }; },
    },
    bountyCategory: { findUnique: async ({ where }) => where.name === "Development" ? { name: where.name } : null },
    team: { findUnique: async () => ({ id: "team1", name: "Fixture", isVerified: true, isPrivate: false }) },
    teamMember: { findUnique: async () => null },
  };
  return { ...loadRoutes(db), bounty, writes };
}

const invalid = [
  ["negative reward", { bountyAmount: -1 }],
  ["zero reward", { bountyAmount: 0 }],
  ["non-finite reward", { bountyAmount: "Infinity" }],
  ["numeric prefix followed by junk", { bountyAmount: "1 ZEC" }],
  ["array reward", { bountyAmount: [1] }],
  ["object reward", { bountyAmount: {} }],
  ["blank reward", { bountyAmount: " " }],
  ["blank title", { title: " " }],
  ["short description", { description: "bad" }],
  ["invalid date", { timeToComplete: "not-a-date" }],
  ["past deadline", { timeToComplete: "2000-01-01" }],
  ["unknown category", { categoryId: "Missing category" }],
  ["non-string category", { categoryId: { name: "Development" } }],
];

for (const route of ["create", "team", "edit"]) {
  for (const [label, fields] of invalid) {
    test(`${route}: rejects ${label} before writes or notifications`, async () => {
      const h = fixture();
      const res = await h.request(route, route === "edit" ? fields : { ...valid, ...fields });
      assert.equal(res.statusCode, 400);
      assert.equal(typeof res.body.error, "string");
      assert.equal(h.writes.length, 0);
      assert.equal(h.effects.broadcasts.length, 0);
      assert.equal(h.effects.invalidations, 0);
      assert.equal(h.effects.discord.length, 0);
    });
  }
  test(`${route}: accepts and normalizes a valid numeric reward`, async () => {
    const h = fixture();
    const res = await h.request(route, { ...valid, bountyAmount: "1.25" });
    assert.equal(res.statusCode, route === "edit" ? 200 : 201);
    assert.equal(h.writes[0].bountyAmount, 1.25);
    assert.equal(new Date(h.writes[0].timeToComplete).toISOString(), valid.timeToComplete);
    assert.equal(h.effects.broadcasts.length, 1);
  });
}

test("an edit can change only the reward after the original deadline has passed", async () => {
  const h = fixture();
  h.bounty.timeToComplete = "2000-01-01";
  const res = await h.request("edit", { bountyAmount: 2 });
  assert.equal(res.statusCode, 200);
  assert.equal(h.bounty.bountyAmount, 2);
  assert.equal(h.bounty.timeToComplete, "2000-01-01");
});

test("edit permission is checked before invalid input is examined", async () => {
  const h = fixture();
  const res = await h.request("edit", { bountyAmount: -1 }, { user: { id: "stranger", role: "HUNTER" } });
  assert.equal(res.statusCode, 403);
  assert.equal(h.writes.length, 0);
});
