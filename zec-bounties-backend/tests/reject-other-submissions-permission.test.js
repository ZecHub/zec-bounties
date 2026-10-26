const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadRoutes } = require("./helpers/bountyValidationHarness");

// "Reject remaining pending submissions" must be open to whoever may approve a
// submission: the bounty's team OWNER/ADMIN (canAdministerBounty), as well as
// its creator and global admins.
function fakeDb(teamRole) {
  const submissions = [
    { id: "s1", bountyId: "b1", submittedBy: "winner", status: "approved" },
    { id: "s2", bountyId: "b1", submittedBy: "other", status: "pending" },
  ];
  const known = {
    workSubmission: {
      findUnique: async () => ({ ...submissions[0], bounty: { id: "b1", createdBy: "creator", teamId: "team1", assignee: "winner" } }),
      findMany: async ({ where }) => submissions.filter((s) => s.bountyId === where.bountyId && s.id !== where.id.not && s.status === where.status),
      updateMany: async ({ where, data }) => {
        submissions.filter((s) => where.id.in.includes(s.id)).forEach((s) => Object.assign(s, data));
        return { count: where.id.in.length };
      },
    },
    teamMember: {
      findUnique: async ({ where }) => (teamRole && where.teamId_userId.userId === "teamAdmin" ? { role: teamRole } : null),
    },
  };
  // Every other model call (notifications, recipients) succeeds with no rows.
  const model = (name) => new Proxy(known[name] ?? {}, {
    get: (target, op) => target[op] ?? (async () => (/^find(Unique|First)/.test(op) ? null : [])),
  });
  const prisma = new Proxy({}, {
    get: (_, name) => (name === "$transaction" ? async (fn) => fn(prisma) : model(name)),
  });
  return { prisma, submissions };
}

async function rejectOthers(db, user) {
  return loadRoutes(db.prisma).request("rejectOthers", {}, { user, submissionId: "s1" });
}

test("a team ADMIN who did not create the bounty can reject the remaining submissions", async () => {
  const db = fakeDb("ADMIN");
  const res = await rejectOthers(db, { id: "teamAdmin", role: "TEAM" });
  assert.equal(res.statusCode, 200);
  assert.equal(db.submissions[1].status, "rejected");
});

test("the creator still can; a plain team MEMBER still cannot", async () => {
  const byCreator = fakeDb(null);
  assert.equal((await rejectOthers(byCreator, { id: "creator", role: "HUNTER" })).statusCode, 200);
  const byMember = fakeDb("MEMBER");
  const res = await rejectOthers(byMember, { id: "teamAdmin", role: "TEAM" });
  assert.equal(res.statusCode, 403);
  assert.equal(byMember.submissions[1].status, "pending");
});
