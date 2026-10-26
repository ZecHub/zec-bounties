const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { loadRoutes } = require("./helpers/bountyValidationHarness");

// Never use the application's DATABASE_URL implicitly.
const databaseUrl = process.env.BOUNTY_VALIDATION_TEST_DATABASE_URL;

test("a started payout freezes payee, assignees and status in real PostgreSQL", {
  skip: !databaseUrl && "Set BOUNTY_VALIDATION_TEST_DATABASE_URL to a disposable database with the Prisma schema",
}, async t => {
  const { PrismaClient } = require("@prisma/client");
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const fixtureId = randomUUID();
  const ids = Object.fromEntries(["admin", "alice", "bob"].map(name => [name, `payout-${name}-${fixtureId}`]));
  try {
    const admin = await db.user.create({ data: {
      id: ids.admin, name: "Payout admin fixture", role: "ADMIN",
      emailNotifications: false, pushNotifications: false,
    } });
    for (const name of ["alice", "bob"]) {
      await db.user.create({ data: {
        id: ids[name], name: `Payout ${name} fixture`, role: "HUNTER",
        emailNotifications: false, pushNotifications: false,
      } });
    }
    const h = loadRoutes(db);
    // DONE and assigned to alice; bob's later submission was approved, alice's
    // own is still pending.
    async function seed(payment) {
      const bounty = await db.bounty.create({ data: {
        title: "Payout freeze fixture", description: "Local integration fixture without outbound notifications.",
        bountyAmount: 1, timeToComplete: new Date("2099-01-01T00:00:00Z"), createdBy: ids.admin,
        status: "DONE", isApproved: true, assignee: ids.alice, completedAt: new Date(), ...payment,
        assignees: { create: [{ userId: ids.alice }, { userId: ids.bob }] },
      } });
      const kept = await db.workSubmission.create({ data: {
        bountyId: bounty.id, submittedBy: ids.bob, description: "Approved work", status: "approved",
      } });
      await db.workSubmission.create({ data: {
        bountyId: bounty.id, submittedBy: ids.alice, description: "Pending work", status: "pending",
      } });
      return { bountyId: bounty.id, submissionId: kept.id };
    }
    async function state(bountyId) {
      const row = await db.bounty.findUniqueOrThrow({
        where: { id: bountyId }, include: { assignees: true, workSubmissions: true },
      });
      return {
        status: row.status, assignee: row.assignee, completedAt: row.completedAt?.toISOString() ?? null,
        roster: row.assignees.map(a => a.userId).sort(),
        submissions: row.workSubmissions.map(s => `${s.submittedBy}:${s.status}`).sort(),
      };
    }
    const requests = [
      ["re-picking the winner", "status", { status: "DONE", winnerId: ids.bob }],
      ["reopening the bounty", "status", { status: "IN_PROGRESS" }],
      ["clearing the assignees", "assignees", { userIds: [] }],
      ["Reject Bounty (isApproved: false)", "edit", { isApproved: false }],
      ["Approve Bounty (isApproved: true)", "edit", { isApproved: true }],
      ["rejecting the other submissions", "rejectOthers", {}],
    ];
    for (const [action, route, body] of requests) {
      await t.test(`paid: ${action} is refused and nothing is written`, async () => {
        const f = await seed({ isPaid: true, paymentAuthorized: true, paidAt: new Date() });
        const before = await state(f.bountyId);
        const res = await h.request(route, body, { user: admin, ...f });
        assert.equal(res.statusCode, 409, JSON.stringify(res.body));
        assert.deepEqual(await state(f.bountyId), before);
      });
    }
    await t.test("paid: approving a bounty its creator is assigned to is refused", async () => {
      const f = await seed({ isPaid: true, paymentAuthorized: true, paidAt: new Date(), createdBy: ids.alice });
      const before = await state(f.bountyId);
      const res = await h.request("approve", {}, { user: admin, ...f });
      assert.equal(res.statusCode, 409, JSON.stringify(res.body));
      assert.deepEqual(await state(f.bountyId), before);
    });
    await t.test("a payout claimed while the assignees route waits for its row lock is caught", async () => {
      const f = await seed({});
      const before = await state(f.bountyId);
      // Commits the claim on another connection just before the route locks
      // the bounty, after its first read saw an unpaid bounty.
      const claimFirst = (tx) => new Proxy(tx, {
        get(target, key) {
          const value = target[key];
          if (key !== "$queryRaw") return typeof value === "function" ? value.bind(target) : value;
          return async (...args) => {
            await db.bounty.update({ where: { id: f.bountyId }, data: { paymentInFlight: true } });
            return value.apply(target, args);
          };
        },
      });
      const racing = new Proxy(db, {
        get(target, key) {
          if (key === "$transaction") return (fn, options) => target.$transaction(tx => fn(claimFirst(tx)), options);
          const value = target[key];
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const res = await loadRoutes(racing).request("assignees", { userIds: [] }, { user: admin, ...f });
      assert.equal(res.statusCode, 409, JSON.stringify(res.body));
      assert.deepEqual(await state(f.bountyId), before);
    });
    await t.test("in flight: clearing the assignees is refused", async () => {
      const f = await seed({ paymentInFlight: true });
      const before = await state(f.bountyId);
      const res = await h.request("assignees", { userIds: [] }, { user: admin, ...f });
      assert.equal(res.statusCode, 409, JSON.stringify(res.body));
      assert.deepEqual(await state(f.bountyId), before);
    });
    await t.test("control: before payment the winner can still be re-picked", async () => {
      const f = await seed({});
      const res = await h.request("status", { status: "DONE", winnerId: ids.bob }, { user: admin, ...f });
      assert.equal(res.statusCode, 200, JSON.stringify(res.body));
      assert.equal((await state(f.bountyId)).assignee, ids.bob);
    });
    await t.test("control: before payment clearing the assignees still cancels", async () => {
      const f = await seed({});
      const res = await h.request("assignees", { userIds: [] }, { user: admin, ...f });
      assert.equal(res.statusCode, 200, JSON.stringify(res.body));
      const after = await state(f.bountyId);
      assert.equal(after.status, "CANCELLED");
      assert.deepEqual(after.roster, []);
    });
  } finally {
    await db.bounty.deleteMany({ where: { createdBy: { in: Object.values(ids) } } });
    await db.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await db.$disconnect();
  }
});
