const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { loadSubmissionRoute } = require("./helpers/submissionHarness");

// Explicit opt-in. Never read the application's DATABASE_URL as a fallback.
const databaseUrl = process.env.SUBMISSION_TEST_DATABASE_URL;

// Wrap actual queries only to control scheduling or inject a write failure.
// This works with both the old array transaction and interactive transactions.
function wrap(client, afterRead, beforeUpdate = () => {}) {
  return new Proxy(client, {
    get(target, key) {
      if (key === "bounty") return new Proxy(target.bounty, {
        get(model, method) {
          if (method === "findUnique") return async args => {
            const value = await model.findUnique(args);
            if (args.select?.workSubmissions) await afterRead();
            return value;
          };
          if (method === "update") return args => {
            beforeUpdate();
            return model.update(args);
          };
          return model[method];
        },
      });
      if (key === "$transaction") return (arg, options) => target.$transaction(
        typeof arg === "function" ? tx => arg(wrap(tx, afterRead, beforeUpdate)) : arg,
        options,
      );
      const value = target[key];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

test("work submission eligibility and writes are atomic in PostgreSQL", {
  skip: !databaseUrl && "Set SUBMISSION_TEST_DATABASE_URL to a disposable PostgreSQL database with the Prisma schema",
  timeout: 60000,
}, async t => {
  const { PrismaClient } = require("@prisma/client");
  const clients = [0, 1].map(() => new PrismaClient({ datasources: { db: { url: databaseUrl } } }));
  const db = clients[0];
  const userIds = [];
  async function fixture(data = {}) {
    const users = await Promise.all([0, 1].map(() => db.user.create({ data: {
      id: `submission-${randomUUID()}`, name: "Submission fixture", role: "HUNTER",
      emailNotifications: false, pushNotifications: false,
    } })));
    userIds.push(...users.map(u => u.id));
    const bounty = await db.bounty.create({ data: {
      title: "Local regression fixture", description: "No external side effects",
      bountyAmount: 0.01, timeToComplete: new Date("2099-01-01"),
      createdBy: users[0].id, status: "IN_PROGRESS", isApproved: true,
      assignees: { create: users.map(u => ({ userId: u.id })) }, ...data,
    } });
    return { users, bounty };
  }
  try {
    for (const sameUser of [true, false]) {
      await t.test(sameUser ? "one user cannot submit twice concurrently" : "two assigned users can both submit concurrently", async () => {
        const { users, bounty } = await fixture();
        let reads = 0;
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        const afterRead = async () => {
          if (reads++ < 2) {
            if (reads === 2) release();
            await gate;
          }
        };
        const routes = clients.map(c => loadSubmissionRoute(wrap(c, afterRead)));
        const results = await Promise.all(routes.map((r, i) => r.submit(users[sameUser ? 0 : i], bounty.id)));
        assert.deepEqual(results.map(r => r.statusCode).sort(), sameUser ? [200, 400] : [200, 200]);
        const successes = sameUser ? 1 : 2;
        const rows = await db.workSubmission.findMany({ where: { bountyId: bounty.id } });
        assert.equal(rows.length, successes);
        assert.ok(rows.every(r => r.status === "pending" && r.description === "Work completed" && r.deliverableUrl === "https://example.com/work"));
        assert.equal((await db.bounty.findUnique({ where: { id: bounty.id } })).status, "IN_REVIEW");
        assert.equal(routes.reduce((n, r) => n + r.effects.broadcasts.length, 0), successes * 2);
        assert.equal(routes.reduce((n, r) => n + r.effects.invalidations.length, 0), successes * 3);
        if (sameUser) assert.equal(results.find(r => r.statusCode === 400).body.error, "You have already submitted work for this bounty");
      });
    }
    await t.test("a status change after the eligibility read is rechecked before submission", async () => {
      const { users, bounty } = await fixture();
      let changed = false;
      const route = loadSubmissionRoute(wrap(db, async () => {
        if (changed) return;
        changed = true;
        await clients[1].bounty.update({ where: { id: bounty.id }, data: { status: "DONE", completedAt: new Date() } });
      }));
      const response = await route.submit(users[0], bounty.id);
      assert.equal(response.statusCode, 400);
      assert.match(response.body.error, /this status/);
      assert.equal(await db.workSubmission.count({ where: { bountyId: bounty.id } }), 0);
      assert.equal((await db.bounty.findUnique({ where: { id: bounty.id } })).status, "DONE");
      assert.equal(route.effects.broadcasts.length, 0);
    });
    for (const [label, data, expected] of [
      ["unapproved bounty", { isApproved: false }, /must be approved/],
      ["cancelled bounty", { status: "CANCELLED" }, /this status/],
      ["completed bounty", { status: "DONE" }, /this status/],
    ]) {
      await t.test(`${label} rejects without writes`, async () => {
        const { users, bounty } = await fixture(data);
        const route = loadSubmissionRoute(db);
        const response = await route.submit(users[0], bounty.id);
        assert.equal(response.statusCode, 400);
        assert.match(response.body.error, expected);
        assert.equal(await db.workSubmission.count({ where: { bountyId: bounty.id } }), 0);
        assert.equal(route.effects.broadcasts.length, 0);
        assert.equal(route.effects.invalidations.length, 0);
      });
    }
    await t.test("unassigned users and missing bounties retain their errors", async () => {
      const { users, bounty } = await fixture();
      await db.bountyAssignee.delete({ where: { bountyId_userId: { bountyId: bounty.id, userId: users[1].id } } });
      const route = loadSubmissionRoute(db);
      assert.equal((await route.submit(users[1], bounty.id)).statusCode, 403);
      assert.equal((await route.submit(users[0], "missing-bounty")).statusCode, 404);
      assert.equal(await db.workSubmission.count({ where: { bountyId: bounty.id } }), 0);
    });
    for (const status of ["pending", "approved", "rejected"]) {
      await t.test(`existing ${status} submission retains current resubmission policy`, async () => {
        const { users, bounty } = await fixture();
        await db.workSubmission.create({ data: { bountyId: bounty.id, submittedBy: users[0].id, description: "Earlier work", status } });
        const route = loadSubmissionRoute(db);
        const response = await route.submit(users[0], bounty.id);
        assert.equal(response.statusCode, status === "rejected" ? 200 : 400);
        assert.equal(await db.workSubmission.count({ where: { bountyId: bounty.id } }), status === "rejected" ? 2 : 1);
      });
    }
    await t.test("a failed bounty write rolls back the new submission", async () => {
      const { users, bounty } = await fixture();
      const route = loadSubmissionRoute(wrap(db, async () => {}, () => { throw new Error("Injected bounty update failure"); }));
      assert.equal((await route.submit(users[0], bounty.id)).statusCode, 500);
      assert.equal(await db.workSubmission.count({ where: { bountyId: bounty.id } }), 0);
      assert.equal((await db.bounty.findUnique({ where: { id: bounty.id } })).status, "IN_PROGRESS");
      assert.equal(route.effects.broadcasts.length, 0);
      assert.equal(route.effects.invalidations.length, 0);
    });
  } finally {
    // Delete only this run's UUID-scoped fixtures.
    await db.bountyAssignee.deleteMany({ where: { userId: { in: userIds } } });
    await db.bounty.deleteMany({ where: { createdBy: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await Promise.all(clients.map(c => c.$disconnect()));
  }
});
