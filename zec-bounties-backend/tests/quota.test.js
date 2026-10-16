const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadHelpers, loadRoutes } = require("./helpers/quotaHarness");

const user = { id: "fixture-user", role: "HUNTER" };
const createArgs = { data: { createdBy: user.id, title: "Fixture" } };

function database({ used = 0, badges = [], completed = 0, failure } = {}) {
  let attempts = 0;
  const created = [];
  const quotaReads = [];
  const tx = {
    user: { findUnique: async () => ({ badges }) },
    bounty: {
      count: async ({ where }) => {
        if (where.status === "DONE") return completed;
        quotaReads.push(where);
        return used;
      },
      create: async (args) => {
        if (failure) throw failure;
        created.push(args);
        return { id: "fixture-bounty", ...args.data, createdByUser: { name: "Fixture" } };
      },
    },
  };
  const prisma = {
    ...tx,
    user: { ...tx.user, findMany: async () => [] },
    team: { findUnique: async () => ({ id: "fixture-team", name: "Fixture", isVerified: true, isPrivate: false }) },
    teamMember: { findUnique: async () => ({ role: "OWNER" }) },
    async $transaction(callback, options) {
      attempts++;
      assert.equal(options.isolationLevel, "Serializable");
      return callback(tx);
    },
  };
  return { prisma, tx, created, quotaReads, get attempts() { return attempts; } };
}

test("retries serialization conflicts, then returns the successful creation", async () => {
  const fixture = database();
  let conflicts = 2;
  const transaction = fixture.prisma.$transaction;
  fixture.prisma.$transaction = async (...args) => {
    if (conflicts-- > 0) throw Object.assign(new Error("serialization conflict"), { code: "P2034" });
    return transaction(...args);
  };
  const result = await loadHelpers(fixture.prisma).createBountyWithQuota(user, createArgs);
  assert.equal(result.id, "fixture-bounty");
  assert.equal(fixture.created.length, 1);
  assert.equal(conflicts, -1);
});

test("stops after bounded serialization retries and propagates the failure", async () => {
  const fixture = database();
  const failure = Object.assign(new Error("serialization conflict"), { code: "P2034" });
  let attempts = 0;
  fixture.prisma.$transaction = async () => { attempts++; throw failure; };
  await assert.rejects(loadHelpers(fixture.prisma).createBountyWithQuota(user, createArgs), (error) => error === failure);
  assert.equal(attempts, 5);
  assert.equal(fixture.created.length, 0);
});

test("does not retry unrelated database failures", async () => {
  const failure = Object.assign(new Error("foreign key failure"), { code: "P2003" });
  const fixture = database({ failure });
  await assert.rejects(loadHelpers(fixture.prisma).createBountyWithQuota(user, createArgs), (error) => error === failure);
  assert.equal(fixture.attempts, 1);
  assert.equal(fixture.created.length, 0);
});

test("quota reads use the transaction client and share the inserted timestamp's week", async () => {
  const fixture = database();
  fixture.prisma.user.findUnique = async () => { throw new Error("outside transaction"); };
  fixture.prisma.bounty = { ...fixture.tx.bounty, count: async () => { throw new Error("outside transaction"); } };
  class Sunday extends Date { constructor(...args) { super(...(args.length ? args : ["2026-09-27T23:59:59.999Z"])); } }
  await loadHelpers(fixture.prisma, Sunday).createBountyWithQuota(user, createArgs);
  assert.equal(fixture.created[0].data.dateCreated.toISOString(), "2026-09-27T23:59:59.999Z");
  assert.equal(fixture.quotaReads[0].dateCreated.gte.toISOString(), "2026-09-21T00:00:00.000Z");
  assert.equal(fixture.quotaReads[0].dateCreated.lt.toISOString(), "2026-09-28T00:00:00.000Z");
});

for (const route of ["bounties", "teams"]) {
  test(`${route}: rejects exhausted quota with its metadata and no side effects`, async () => {
    const fixture = database({ used: 1 });
    const app = loadRoutes(fixture.prisma);
    const response = await app.create(route, user, "fixture-team");
    assert.equal(response.statusCode, 429);
    assert.equal(response.body.limit, 1);
    assert.equal(response.body.used, 1);
    assert.equal(response.body.remaining, 0);
    assert.ok(response.body.resetsAt instanceof Date);
    assert.equal(fixture.created.length, 0);
    assert.equal(app.effects.broadcasts.length, 0);
    assert.equal(app.effects.invalidations, 0);
    assert.equal(app.effects.discord.length, 0);
  });
  test(`${route}: administrators remain exempt from weekly quotas`, async () => {
    const fixture = database({ used: 10 });
    const app = loadRoutes(fixture.prisma);
    const response = await app.create(route, { ...user, role: "ADMIN" }, "fixture-team");
    assert.equal(response.statusCode, 201);
    assert.equal(fixture.created.length, 1);
    assert.equal(fixture.quotaReads.length, 0);
    assert.equal(fixture.attempts, 0);
    assert.equal(app.effects.broadcasts.length, 1);
  });
  test(`${route}: failed creates do not emit success side effects`, async () => {
    const fixture = database({ failure: new Error("write failed") });
    const app = loadRoutes(fixture.prisma);
    const response = await app.create(route, user, "fixture-team");
    assert.equal(response.statusCode, 500);
    assert.equal(app.effects.broadcasts.length, 0);
    assert.equal(app.effects.invalidations, 0);
    assert.equal(app.effects.discord.length, 0);
  });
}

test("Gold qualification still honors explicit lower-tier overrides", async () => {
  const fixture = database({ used: 1, badges: ["avatar:5"], completed: 20 });
  const helpers = loadHelpers(fixture.prisma);
  await assert.rejects(helpers.createBountyWithQuota(user, createArgs), (error) => error.quota?.limit === 1);
  assert.equal(fixture.created.length, 0);
});
