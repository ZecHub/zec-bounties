const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { loadSubmissionReviewRoute } = require("./helpers/submissionReviewHarness");

const databaseUrl = process.env.SUBMISSION_REVIEW_TEST_DATABASE_URL;

// Pause both requests after reading the same initial snapshot. Wrap transaction
// clients too, so the same interleaving exercises the fixed and original route.
function interleave(client, afterRead, stats, readMethod = "findUnique") {
  return new Proxy(client, {
    get(target, key) {
      if (key === "$transaction") return async (callback, options) => {
        stats.attempts++;
        try {
          return await target.$transaction(tx => callback(interleave(tx, afterRead, stats, readMethod)), options);
        } catch (error) {
          if (error.code === "P2034") stats.conflicts++;
          throw error;
        }
      };
      if (key === "workSubmission") return new Proxy(target.workSubmission, {
        get(model, method) {
          if (method === readMethod) return async args => {
            const row = await model[method](args);
            await afterRead();
            return row;
          };
          return model[method];
        },
      });
      const value = target[key];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

test("submission reviews keep aggregate state consistent in PostgreSQL", {
  skip: !databaseUrl && "Set SUBMISSION_REVIEW_TEST_DATABASE_URL to a disposable database with the Prisma schema",
  timeout: 60000,
}, async t => {
  const { PrismaClient } = require("@prisma/client");
  const clients = [0, 1, 2].map(() => new PrismaClient({ datasources: { db: { url: databaseUrl } } }));
  const [db, first, second] = clients;
  const userIds = [];
  const teamIds = [];
  async function fixture(initial = "pending") {
    const users = await Promise.all([0, 1, 2].map(i => db.user.create({ data: {
      id: `review-${randomUUID()}`, name: "Local review fixture", role: i === 0 ? "ADMIN" : "HUNTER",
      emailNotifications: false, pushNotifications: false,
    } })));
    userIds.push(...users.map(u => u.id));
    const bounty = await db.bounty.create({ data: {
      title: "Review race fixture", description: "No outbound services", bountyAmount: 1,
      timeToComplete: new Date("2099-01-01"), createdBy: users[0].id, isApproved: true,
      status: initial === "approved" ? "DONE" : "IN_REVIEW",
      completedAt: initial === "approved" ? new Date() : null,
      assignee: users[1].id,
    } });
    const submissions = await Promise.all(users.slice(1).map(user => db.workSubmission.create({ data: {
      bountyId: bounty.id, submittedBy: user.id, status: initial, description: "Work",
    } })));
    await db.bountyAssignee.createMany({ data: users.slice(1).map(user => ({ bountyId: bounty.id, userId: user.id })) });
    return { users, bounty, submissions };
  }
  async function runOrdered(f, statuses, readMethod = "findUnique") {
    let releaseReads, signalSecond, finishFirst;
    const reads = new Promise(resolve => { releaseReads = resolve; });
    const secondRead = new Promise(resolve => { signalSecond = resolve; });
    const firstDone = new Promise(resolve => { finishFirst = resolve; });
    let seenFirst = false, seenSecond = false;
    const stats = { attempts: 0, conflicts: 0 };
    const routes = [
      loadSubmissionReviewRoute(interleave(first, async () => {
        if (seenFirst) return;
        seenFirst = true;
        await secondRead;
        releaseReads();
      }, stats, readMethod)),
      loadSubmissionReviewRoute(interleave(second, async () => {
        if (seenSecond) return;
        seenSecond = true;
        signalSecond();
        await reads;
        await firstDone;
      }, stats, readMethod)),
    ];
    const a = routes[0].review(f.users[0], f.submissions[0].id, { status: statuses[0], reviewNotes: " reviewed " })
      .finally(finishFirst);
    const b = routes[1].review(f.users[0], f.submissions[1].id, { status: statuses[1] });
    const responses = await Promise.all([a, b]);
    assert.deepEqual(responses.map(r => r.statusCode), [200, 200]);
    for (const route of routes) assert.equal(route.effects.broadcasts.length, 2, "effects happen once after commit");
    return stats;
  }
  try {
    for (const lastReview of ["rejected", "needs_revision"]) {
      await t.test(`approval followed by concurrent ${lastReview} preserves DONE`, async () => {
        const f = await fixture();
        const stats = await runOrdered(f, ["approved", lastReview]);
        const bounty = await db.bounty.findUniqueOrThrow({ where: { id: f.bounty.id } });
        assert.equal(bounty.status, "DONE");
        assert.equal(bounty.assignee, f.users[1].id);
        assert.ok(bounty.completedAt);
        assert.ok(stats.conflicts >= 1, "the stale transaction must be retried");
        assert.ok(stats.attempts >= 3);
      });
    }
    await t.test("rejecting both approved submissions clears completion", async () => {
      const f = await fixture("approved");
      await runOrdered(f, ["rejected", "rejected"], "findFirst");
      const bounty = await db.bounty.findUniqueOrThrow({ where: { id: f.bounty.id } });
      assert.equal(bounty.status, "IN_PROGRESS");
      assert.equal(bounty.completedAt, null);
      assert.equal(bounty.assignee, null);
      assert.equal(await db.bountyAssignee.count({ where: { bountyId: f.bounty.id } }), 0);
    });
    await t.test("rejection followed by approval completes normally", async () => {
      const f = await fixture();
      await runOrdered(f, ["rejected", "approved"]);
      const bounty = await db.bounty.findUniqueOrThrow({ where: { id: f.bounty.id } });
      assert.equal(bounty.status, "DONE");
      assert.equal(bounty.assignee, f.users[2].id);
      assert.ok(bounty.completedAt);
    });
    await t.test("sequential reviews and authorization errors retain their contracts", async () => {
      const f = await fixture();
      const route = loadSubmissionReviewRoute(db);
      assert.equal((await route.review(f.users[1], f.submissions[0].id, { status: "approved" })).statusCode, 403);
      assert.equal((await route.review(f.users[0], "missing", { status: "approved" })).statusCode, 404);
      assert.equal((await route.review(f.users[0], f.submissions[0].id, { status: "unknown" })).statusCode, 400);
      assert.equal(route.effects.broadcasts.length, 0);
      assert.equal((await route.review(f.users[0], f.submissions[0].id, { status: "approved", reviewNotes: " accepted " })).statusCode, 200);
      const row = await db.workSubmission.findUniqueOrThrow({ where: { id: f.submissions[0].id } });
      assert.equal(row.reviewNotes, "accepted");
      assert.equal(row.reviewedBy, f.users[0].id);
      assert.ok(row.reviewedAt);
      assert.equal((await route.review(f.users[0], f.submissions[0].id, { status: "needs_revision" })).statusCode, 200);
      const bounty = await db.bounty.findUniqueOrThrow({ where: { id: f.bounty.id } });
      assert.equal(bounty.status, "IN_PROGRESS");
      assert.equal(bounty.completedAt, null);
      assert.equal(await db.bountyAssignee.count({ where: { bountyId: f.bounty.id } }), 2);
    });
    await t.test("team OWNER and ADMIN can review, ordinary members cannot", async () => {
      const f = await fixture();
      const team = await db.team.create({ data: { name: `review-${randomUUID()}` } });
      teamIds.push(team.id);
      await db.bounty.update({ where: { id: f.bounty.id }, data: { teamId: team.id } });
      const member = await db.teamMember.create({ data: { teamId: team.id, userId: f.users[1].id, role: "MEMBER" } });
      const route = loadSubmissionReviewRoute(db);
      assert.equal((await route.review(f.users[1], f.submissions[1].id, { status: "approved" })).statusCode, 403);
      for (const role of ["OWNER", "ADMIN"]) {
        await db.teamMember.update({ where: { id: member.id }, data: { role } });
        assert.equal((await route.review(f.users[1], f.submissions[1].id, { status: "approved" })).statusCode, 200);
      }
    });
    for (const code of ["P2034", "P2003"]) {
      await t.test(`${code} rolls back every write and emits no success effects`, async () => {
        const f = await fixture("approved");
        let attempts = 0;
        const failing = new Proxy(first, {
          get(target, key) {
            if (key === "$transaction") return (callback, options) => {
              attempts++;
              return target.$transaction(async tx => {
                await callback(tx);
                throw Object.assign(new Error("Injected failure before commit"), { code });
              }, options);
            };
            const value = target[key];
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        const route = loadSubmissionReviewRoute(failing);
        assert.equal((await route.review(f.users[0], f.submissions[0].id, { status: "rejected" })).statusCode, 500);
        assert.equal(attempts, code === "P2034" ? 3 : 1);
        const saved = await db.workSubmission.findUniqueOrThrow({ where: { id: f.submissions[0].id } });
        assert.equal(saved.status, "approved");
        assert.equal(saved.reviewedAt, null);
        const bounty = await db.bounty.findUniqueOrThrow({ where: { id: f.bounty.id } });
        assert.equal(bounty.status, "DONE");
        assert.equal(bounty.assignee, f.bounty.assignee);
        assert.equal(bounty.completedAt.getTime(), f.bounty.completedAt.getTime());
        assert.equal(await db.bountyAssignee.count({ where: { bountyId: f.bounty.id } }), 2);
        assert.equal(route.effects.broadcasts.length, 0);
        assert.equal(route.effects.invalidations.length, 0);
      });
    }
  } finally {
    await db.bounty.deleteMany({ where: { createdBy: { in: userIds } } });
    await db.team.deleteMany({ where: { id: { in: teamIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await Promise.all(clients.map(client => client.$disconnect()));
  }
});
