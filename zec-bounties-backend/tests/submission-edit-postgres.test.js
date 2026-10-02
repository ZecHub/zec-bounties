const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { loadSubmissionEditRoute } = require("./helpers/submissionEditHarness");

// Explicitly opt into a disposable database; never use DATABASE_URL implicitly.
const databaseUrl = process.env.SUBMISSION_EDIT_TEST_DATABASE_URL;
function afterSubmissionRead(client, afterRead) {
  return new Proxy(client, {
    get(target, key) {
      if (key === "workSubmission") return new Proxy(target.workSubmission, {
        get(model, method) {
          if (method === "findUnique") return async args => {
            const row = await model.findUnique(args);
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

test("submission edits preserve committed reviews in PostgreSQL", {
  skip: !databaseUrl && "Set SUBMISSION_EDIT_TEST_DATABASE_URL to a disposable database with the Prisma schema",
  timeout: 60000,
}, async t => {
  const { PrismaClient } = require("@prisma/client");
  const [db, reviewer] = [0, 1].map(() => new PrismaClient({ datasources: { db: { url: databaseUrl } } }));
  const userIds = [];
  const original = "Deliverable reviewed by the administrator";
  const replacement = { description: "  New unreviewed deliverable  ", deliverableUrl: "  https://example.com/revised  " };
  async function fixture(status = "pending", extra = {}, bountyStatus = "IN_REVIEW") {
    const user = await db.user.create({ data: {
      id: `edit-${randomUUID()}`, name: "Edit fixture", role: "HUNTER",
      emailNotifications: false, pushNotifications: false,
    } });
    userIds.push(user.id);
    const bounty = await db.bounty.create({ data: {
      title: "Local edit fixture", description: "No outbound services", bountyAmount: 1,
      timeToComplete: new Date("2099-01-01"), createdBy: user.id,
      status: bountyStatus, isApproved: true,
    } });
    const submission = await db.workSubmission.create({ data: {
      bountyId: bounty.id, submittedBy: user.id, status, description: original,
      ...(status === "needs_revision" && { reviewedBy: user.id, reviewedAt: new Date(), reviewNotes: "Revise this" }),
      ...extra,
    } });
    return { user, bounty, submission };
  }
  async function rows(f) {
    return {
      submission: await db.workSubmission.findUniqueOrThrow({ where: { id: f.submission.id } }),
      bounty: await db.bounty.findUniqueOrThrow({ where: { id: f.bounty.id } }),
    };
  }
  try {
    for (const status of ["pending", "needs_revision"]) {
      await t.test(`${status} edit cannot replace content after concurrent approval`, async () => {
        const f = await fixture(status);
        const reviewedAt = new Date();
        const route = loadSubmissionEditRoute(afterSubmissionRead(db, async () => {
          await reviewer.$transaction([
            reviewer.workSubmission.update({ where: { id: f.submission.id }, data: { status: "approved", reviewedBy: f.user.id, reviewedAt, reviewNotes: "Approved" } }),
            reviewer.bounty.update({ where: { id: f.bounty.id }, data: { status: "DONE", completedAt: reviewedAt } }),
          ]);
        }));
        const response = await route.edit(f.user, f.submission.id, replacement);
        assert.equal(response.statusCode, 409);
        const saved = await rows(f);
        assert.equal(saved.submission.description, original);
        assert.equal(saved.submission.status, "approved");
        assert.equal(saved.submission.reviewNotes, "Approved");
        assert.equal(saved.submission.reviewedAt.getTime(), reviewedAt.getTime());
        assert.equal(saved.bounty.status, "DONE");
        assert.equal(route.effects.broadcasts.length, 0);
        assert.equal(route.effects.invalidations.length, 0);
      });
    }
    for (const status of ["DONE", "CANCELLED"]) {
      await t.test(`revision resubmission cannot reopen a concurrently ${status} bounty`, async () => {
        const f = await fixture("needs_revision");
        const route = loadSubmissionEditRoute(afterSubmissionRead(db, async () => {
          await reviewer.bounty.update({ where: { id: f.bounty.id }, data: { status } });
        }));
        const response = await route.edit(f.user, f.submission.id, replacement);
        assert.equal(response.statusCode, 409);
        const saved = await rows(f);
        assert.equal(saved.bounty.status, status);
        assert.equal(saved.submission.status, "needs_revision");
        assert.equal(saved.submission.description, original);
        assert.equal(saved.submission.reviewNotes, "Revise this");
        assert.equal(route.effects.broadcasts.length, 0);
      });
    }
    await t.test("a new needs-revision review is not cleared by an older edit", async () => {
      const f = await fixture("needs_revision", { reviewedAt: new Date("2000-01-01") });
      const route = loadSubmissionEditRoute(afterSubmissionRead(db, async () => {
        await reviewer.workSubmission.update({ where: { id: f.submission.id }, data: { reviewedAt: new Date(), reviewNotes: "New review instructions" } });
      }));
      assert.equal((await route.edit(f.user, f.submission.id, replacement)).statusCode, 409);
      assert.equal((await rows(f)).submission.reviewNotes, "New review instructions");
    });
    for (const status of ["pending", "needs_revision"]) {
      await t.test(`${status} remains editable when eligible`, async () => {
        const f = await fixture(status, status === "needs_revision" ? { submittedAt: new Date("2000-01-01") } : {});
        const route = loadSubmissionEditRoute(db);
        const before = Date.now();
        const response = await route.edit(f.user, f.submission.id, replacement);
        assert.equal(response.statusCode, 200);
        const saved = await rows(f);
        assert.equal(saved.submission.description, "New unreviewed deliverable");
        assert.equal(saved.submission.deliverableUrl, "https://example.com/revised");
        assert.equal(saved.submission.status, "pending");
        assert.equal(saved.bounty.status, "IN_REVIEW");
        if (status === "needs_revision") {
          assert.ok(saved.submission.submittedAt.getTime() >= before);
          assert.equal(saved.submission.reviewedBy, null);
          assert.equal(saved.submission.reviewNotes, null);
        } else assert.equal(saved.submission.submittedAt.getTime(), f.submission.submittedAt.getTime());
        assert.equal(route.effects.broadcasts.length, status === "needs_revision" ? 2 : 1);
      });
    }
    for (const status of ["approved", "rejected"]) {
      await t.test(`${status} submissions retain the existing rejection`, async () => {
        const f = await fixture(status);
        assert.equal((await loadSubmissionEditRoute(db).edit(f.user, f.submission.id, replacement)).statusCode, 400);
        assert.equal((await rows(f)).submission.description, original);
      });
    }
    await t.test("expired edit window, wrong user, missing submission, and blank content retain their errors", async () => {
      const f = await fixture("pending", { submittedAt: new Date("2000-01-01") });
      const route = loadSubmissionEditRoute(db);
      assert.equal((await route.edit(f.user, f.submission.id, replacement)).statusCode, 400);
      assert.equal((await route.edit({ id: "stranger" }, f.submission.id, replacement)).statusCode, 403);
      assert.equal((await route.edit(f.user, "missing", replacement)).statusCode, 404);
      assert.equal((await route.edit(f.user, f.submission.id, { description: " " })).statusCode, 400);
      assert.equal(route.effects.broadcasts.length, 0);
    });
  } finally {
    await db.bounty.deleteMany({ where: { createdBy: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await Promise.all([db.$disconnect(), reviewer.$disconnect()]);
  }
});
