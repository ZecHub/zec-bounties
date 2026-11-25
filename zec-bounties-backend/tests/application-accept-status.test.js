const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadRoutes } = require("./helpers/bountyValidationHarness");

// Accepting an application adds the applicant as an assignee. It must not
// reopen a finished bounty or move one that is already under review back to
// IN_PROGRESS; POST /:id/assignees only starts work from TO_DO or CANCELLED.
function fakeDb(status) {
  const bounty = { id: "b1", title: "Fixture", createdBy: "creator", teamId: null, status, isApproved: true };
  const application = { id: "a1", bountyId: "b1", applicantId: "late", status: "pending" };
  const assignees = [];
  const applyWhere = (where) => where.id === bounty.id &&
    (!where.status?.in || where.status.in.includes(bounty.status));
  const prisma = {
    bountyApplication: {
      findUnique: async () => ({ ...application, bounty: { title: bounty.title, createdBy: bounty.createdBy, teamId: bounty.teamId, status: bounty.status } }),
      update: async ({ data }) => Object.assign(application, data, { applicantUser: { id: "late", name: "Late" } }),
    },
    bountyAssignee: {
      upsert: async ({ create }) => { assignees.push(create.userId); return create; },
    },
    bounty: {
      update: async ({ data }) => Object.assign(bounty, data),
      updateMany: async ({ where, data }) => {
        if (!applyWhere(where)) return { count: 0 };
        Object.assign(bounty, data);
        return { count: 1 };
      },
      findUnique: async () => ({ ...bounty, assignees: assignees.map((userId) => ({ userId })) }),
    },
    user: { findUnique: async () => null },
  };
  prisma.$transaction = async (fn) => fn(prisma);
  return { prisma, bounty, application, assignees };
}

async function accept(db) {
  return loadRoutes(db.prisma).request("reviewApplication", { status: "accepted" });
}

test("accepting a late application on a DONE bounty is refused and changes nothing", async () => {
  const db = fakeDb("DONE");
  const res = await accept(db);
  assert.equal(res.statusCode, 400);
  assert.equal(db.bounty.status, "DONE");
  assert.equal(db.application.status, "pending");
  assert.deepEqual(db.assignees, []);
});

test("accepting while the bounty is IN_REVIEW adds the assignee and keeps IN_REVIEW", async () => {
  const db = fakeDb("IN_REVIEW");
  const res = await accept(db);
  assert.equal(res.statusCode, 200);
  assert.equal(db.bounty.status, "IN_REVIEW");
  assert.deepEqual(db.assignees, ["late"]);
});

test("accepting on an open bounty still starts work", async () => {
  const db = fakeDb("TO_DO");
  const res = await accept(db);
  assert.equal(res.statusCode, 200);
  assert.equal(db.bounty.status, "IN_PROGRESS");
  assert.deepEqual(db.assignees, ["late"]);
});
