const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { loadRoutes, loadHelpers } = require("./helpers/quotaHarness");

// Explicit opt-in: never fall back to an application's DATABASE_URL.
const databaseUrl = process.env.QUOTA_TEST_DATABASE_URL;

test("concurrent creation respects weekly quotas in PostgreSQL", {
  skip: !databaseUrl && "Set QUOTA_TEST_DATABASE_URL to a disposable PostgreSQL database with the Prisma schema",
  timeout: 60000,
}, async (t) => {
  const { PrismaClient } = require("@prisma/client");
  const clients = [0, 1].map(() => new PrismaClient({ datasources: { db: { url: databaseUrl } } }));
  const db = clients[0];
  const userIds = [];
  const teamIds = [];
  try {
    for (const [label, endpoints, gold, initialUsed] of [
      ["general endpoint", ["bounties", "bounties"], false, 0],
      ["team endpoint", ["teams", "teams"], false, 0],
      ["mixed endpoints", ["bounties", "teams"], false, 0],
      ["Gold last slot across endpoints", ["bounties", "teams"], true, 1],
      ["Gold can fill both available slots", ["bounties", "teams"], true, 0],
    ]) {
      await t.test(label, async () => {
        const user = await db.user.create({ data: { id: `quota-${randomUUID()}`, name: "Quota test", role: "TEAM", badges: gold ? ["avatar:15"] : [], emailNotifications: false, pushNotifications: false } });
        userIds.push(user.id);
        const team = await db.team.create({ data: { name: `Quota ${randomUUID()}`, isVerified: true, members: { create: { userId: user.id, role: "OWNER" } } } });
        teamIds.push(team.id);
        for (let i = 0; i < initialUsed; i++) {
          await db.bounty.create({ data: { title: "Earlier fixture", description: "Fixture", bountyAmount: 0.01, timeToComplete: new Date("2099-01-01"), createdBy: user.id } });
        }
        let reads = 0;
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        // Force both requests to read the same real committed count before
        // either inserts. Only the first two reads wait; retries run normally.
        const wrap = (client) => new Proxy(client, {
          get(target, key) {
            if (key === "bounty") return new Proxy(target.bounty, {
              get(model, method) {
                if (method !== "count") return model[method];
                return async (args) => {
                  const count = await model.count(args);
                  if (args.where.createdBy === user.id && reads++ < 2) {
                    if (reads === 2) release();
                    await gate;
                  }
                  return count;
                };
              },
            });
            if (key === "$transaction") return (callback, options) => target.$transaction((tx) => callback(wrap(tx)), options);
            const value = target[key];
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        const routes = clients.map((client) => loadRoutes(wrap(client)));
        const responses = await Promise.all(routes.map((r, i) => r.create(endpoints[i], user, team.id)));
        const expectedSuccesses = gold && initialUsed === 0 ? 2 : 1;
        assert.deepEqual(responses.map((r) => r.statusCode).sort(), expectedSuccesses === 2 ? [201, 201] : [201, 429]);
        assert.equal(await db.bounty.count({ where: { createdBy: user.id } }), gold ? 2 : 1);
        const rejected = (responses.find((r) => r.statusCode === 429) ?? await routes[0].create(endpoints[0], user, team.id)).body;
        assert.equal(rejected.limit, gold ? 2 : 1);
        assert.equal(rejected.used, gold ? 2 : 1);
        assert.equal(rejected.remaining, 0);
        assert.ok(new Date(rejected.resetsAt) > new Date());
        // Rejected/retried transactions must not broadcast or invalidate.
        assert.equal(routes.reduce((n, r) => n + r.effects.broadcasts.length, 0), expectedSuccesses);
        assert.equal(routes.reduce((n, r) => n + r.effects.invalidations, 0), expectedSuccesses);
        assert.equal(routes.reduce((n, r) => n + r.effects.discord.length, 0), expectedSuccesses);
      });
    }
    await t.test("failed nested writes roll back without consuming quota", async () => {
      const user = await db.user.create({ data: { id: `quota-${randomUUID()}`, name: "Rollback fixture", role: "HUNTER" } });
      userIds.push(user.id);
      const helpers = loadHelpers(db);
      const args = { data: { title: "Rollback fixture", description: "Fixture", bountyAmount: 0.01, timeToComplete: new Date("2099-01-01"), createdBy: user.id } };
      await assert.rejects(helpers.createBountyWithQuota(user, {
        data: { ...args.data, assignees: { create: { userId: `missing-${randomUUID()}` } } },
      }), (error) => error.code === "P2003");
      assert.equal(await db.bounty.count({ where: { createdBy: user.id } }), 0);
      await helpers.createBountyWithQuota(user, args);
      assert.equal(await db.bounty.count({ where: { createdBy: user.id } }), 1);
    });
  } finally {
    await db.bounty.deleteMany({ where: { createdBy: { in: userIds } } });
    await db.teamMember.deleteMany({ where: { userId: { in: userIds } } });
    await db.team.deleteMany({ where: { id: { in: teamIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await Promise.all(clients.map((client) => client.$disconnect()));
  }
});
