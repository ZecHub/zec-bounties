const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { loadRoutes } = require("./helpers/bountyValidationHarness");

// Never use the application's DATABASE_URL implicitly.
const databaseUrl = process.env.BOUNTY_VALIDATION_TEST_DATABASE_URL;

test("bounty validation protects real PostgreSQL writes", {
  skip: !databaseUrl && "Set BOUNTY_VALIDATION_TEST_DATABASE_URL to a disposable database with the Prisma schema",
}, async t => {
  const { PrismaClient } = require("@prisma/client");
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const fixtureId = randomUUID();
  const userId = `validation-${fixtureId}`;
  let team;
  try {
    const user = await db.user.create({ data: {
      id: userId, name: "Validation fixture", role: "ADMIN",
      emailNotifications: false, pushNotifications: false,
    } });
    team = await db.team.create({ data: { name: `Validation ${fixtureId}`, isVerified: true } });
    const h = loadRoutes(db);
    const valid = {
      title: "Validation database fixture", description: "Local integration fixture without outbound notifications.",
      bountyAmount: "1.25", timeToComplete: "2099-01-01", assignee: "none", chain: "MAIN",
    };
    for (const route of ["create", "team"]) {
      await t.test(`${route}: rejected negative amount leaves no row`, async () => {
        const count = await db.bounty.count({ where: { createdBy: userId } });
        const res = await h.request(route, { ...valid, bountyAmount: -1 }, { user, teamId: team.id });
        assert.equal(res.statusCode, 400);
        assert.equal(await db.bounty.count({ where: { createdBy: userId } }), count);
      });
      await t.test(`${route}: numeric strings and empty optional category persist correctly`, async () => {
        const res = await h.request(route, { ...valid, categoryId: "" }, { user, teamId: team.id });
        assert.equal(res.statusCode, 201, JSON.stringify(res.body));
        const saved = await db.bounty.findUniqueOrThrow({ where: { id: res.body.id } });
        assert.equal(saved.bountyAmount, 1.25);
        assert.equal(saved.categoryId, null);
        assert.equal(saved.timeToComplete.toISOString(), "2099-01-01T00:00:00.000Z");
      });
    }
    await t.test("edit: rejected data preserves the row, valid string values become database types", async () => {
      const row = await db.bounty.findFirstOrThrow({ where: { createdBy: userId } });
      const rejected = await h.request("edit", { bountyAmount: -1 }, { user, bountyId: row.id });
      assert.equal(rejected.statusCode, 400);
      assert.equal((await db.bounty.findUniqueOrThrow({ where: { id: row.id } })).bountyAmount, 1.25);
      const accepted = await h.request("edit", { bountyAmount: "2.5", timeToComplete: "2099-02-01" }, { user, bountyId: row.id });
      assert.equal(accepted.statusCode, 200, JSON.stringify(accepted.body));
      const saved = await db.bounty.findUniqueOrThrow({ where: { id: row.id } });
      assert.equal(saved.bountyAmount, 2.5);
      assert.equal(saved.timeToComplete.toISOString(), "2099-02-01T00:00:00.000Z");
    });
  } finally {
    await db.bounty.deleteMany({ where: { createdBy: userId } });
    if (team) await db.team.delete({ where: { id: team.id } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  }
});
