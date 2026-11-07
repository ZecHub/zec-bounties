const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

for (const mod of ["../utils/sendMail", "../utils/notifyUser"]) {
  const file = require.resolve(path.join(__dirname, mod));
  require.cache[file] = {
    id: file,
    filename: file,
    loaded: true,
    exports: async () => {},
  };
}

const { redisClient } = require("../config/redis");
for (const method of ["get", "setEx", "del", "incr"]) {
  redisClient[method] = async () => null;
}

const prisma = require("../prisma/client");
const router = require("../routes/bounties");

function handler(method, routePath) {
  const layer = router.stack.find(
    (l) => l.route?.path === routePath && l.route.methods[method],
  );
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(body) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function useFakeDb({
  teamId = "team-1",
  createdBy = "creator-1",
  assignee = null,
  assigneeIds = ["hunter-1", "hunter-2"],
  teamMembers = {},
} = {}) {
  const submissions = [
    {
      id: "sub-1",
      bountyId: "b1",
      submittedBy: "hunter-1",
      description: "Hunter 1 work",
      attachments: null,
      submittedAt: new Date("2026-11-01T00:00:00Z"),
      submitterUser: { id: "hunter-1", name: "Hunter One" },
    },
    {
      id: "sub-2",
      bountyId: "b1",
      submittedBy: "hunter-2",
      description: "Hunter 2 work",
      attachments: JSON.stringify(["https://example.com/file.png"]),
      submittedAt: new Date("2026-11-02T00:00:00Z"),
      submitterUser: { id: "hunter-2", name: "Hunter Two" },
    },
  ];

  const applications = [
    {
      id: "app-1",
      bountyId: "b1",
      applicantId: "hunter-1",
      message: "I can build this",
      status: "accepted",
      appliedAt: new Date("2026-10-30T00:00:00Z"),
      applicantUser: { id: "hunter-1", name: "Hunter One" },
    },
  ];

  const activities = [
    {
      id: "act-1",
      bountyId: "b1",
      type: "APPLICATION_ACCEPTED",
      createdAt: new Date("2026-10-31T00:00:00Z"),
      actor: { id: "team-admin", name: "Team Admin" },
    },
  ];

  let lastBountySelect = null;

  prisma.bounty.findUnique = async ({ where, select }) => {
    if (where.id !== "b1") return null;
    lastBountySelect = select;
    const full = {
      id: "b1",
      createdBy,
      assignee,
      teamId,
    };
    if (!select) return full;
    return Object.fromEntries(
      Object.keys(select)
        .filter((k) => select[k])
        .map((k) => [k, full[k]]),
    );
  };

  prisma.teamMember.findUnique = async ({ where }) => {
    const key = `${where.teamId_userId.teamId}:${where.teamId_userId.userId}`;
    const role = teamMembers[key];
    return role ? { teamId: where.teamId_userId.teamId, userId: where.teamId_userId.userId, role } : null;
  };

  prisma.bountyAssignee.findUnique = async ({ where }) =>
    assigneeIds.includes(where.bountyId_userId.userId)
      ? { userId: where.bountyId_userId.userId }
      : null;

  prisma.workSubmission.findMany = async ({ where }) =>
    submissions.filter(
      (s) =>
        s.bountyId === where.bountyId &&
        (!where.submittedBy || s.submittedBy === where.submittedBy),
    );

  prisma.bountyApplication.findMany = async ({ where }) =>
    applications.filter((a) => a.bountyId === where.bountyId);

  prisma.bountyActivity.findMany = async ({ where }) =>
    activities.filter((a) => a.bountyId === where.bountyId);

  return {
    getLastBountySelect: () => lastBountySelect,
  };
}

test("GET /:id/submissions allows team OWNER and ADMIN who did not create the bounty to view all submissions", async () => {
  const db = useFakeDb({
    teamMembers: {
      "team-1:team-owner": "OWNER",
      "team-1:team-admin": "ADMIN",
      "team-1:team-member": "MEMBER",
    },
  });

  for (const userId of ["team-owner", "team-admin"]) {
    const res = mockRes();
    await handler("get", "/:id/submissions")(
      { params: { id: "b1" }, user: { id: userId, role: "TEAM" } },
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.length, 2);
    assert.equal(db.getLastBountySelect().teamId, true);
  }

  // Ordinary team MEMBER who is neither creator nor assignee is rejected
  const memberRes = mockRes();
  await handler("get", "/:id/submissions")(
    { params: { id: "b1" }, user: { id: "team-member", role: "HUNTER" } },
    memberRes,
  );
  assert.equal(memberRes.statusCode, 403);

  // Assigned hunter still sees only their own submission
  const assigneeRes = mockRes();
  await handler("get", "/:id/submissions")(
    { params: { id: "b1" }, user: { id: "hunter-1", role: "HUNTER" } },
    assigneeRes,
  );
  assert.equal(assigneeRes.statusCode, 200);
  assert.equal(assigneeRes.body.length, 1);
  assert.equal(assigneeRes.body[0].submittedBy, "hunter-1");
});

test("GET /:bountyId/applications allows team OWNER and ADMIN who did not create the bounty and rejects plain team MEMBER", async () => {
  const db = useFakeDb({
    teamMembers: {
      "team-1:team-owner": "OWNER",
      "team-1:team-admin": "ADMIN",
      "team-1:team-member": "MEMBER",
    },
  });

  for (const userId of ["team-owner", "team-admin"]) {
    const res = mockRes();
    await handler("get", "/:bountyId/applications")(
      { params: { bountyId: "b1" }, user: { id: userId, role: "TEAM" } },
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].id, "app-1");
    assert.equal(db.getLastBountySelect().teamId, true);
  }

  const memberRes = mockRes();
  await handler("get", "/:bountyId/applications")(
    { params: { bountyId: "b1" }, user: { id: "team-member", role: "HUNTER" } },
    memberRes,
  );
  assert.equal(memberRes.statusCode, 403);
  assert.deepEqual(memberRes.body, { error: "Access denied" });
});

test("GET /:id/activity allows bounty creator and team OWNER/ADMIN while rejecting plain team MEMBER", async () => {
  useFakeDb({
    teamMembers: {
      "team-1:team-owner": "OWNER",
      "team-1:team-admin": "ADMIN",
      "team-1:team-member": "MEMBER",
    },
  });

  for (const user of [
    { id: "creator-1", role: "HUNTER" },
    { id: "team-owner", role: "TEAM" },
    { id: "team-admin", role: "TEAM" },
    { id: "global-admin", role: "ADMIN" },
  ]) {
    const res = mockRes();
    await handler("get", "/:id/activity")(
      { params: { id: "b1" }, user },
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].id, "act-1");
  }

  const memberRes = mockRes();
  await handler("get", "/:id/activity")(
    { params: { id: "b1" }, user: { id: "team-member", role: "HUNTER" } },
    memberRes,
  );
  assert.equal(memberRes.statusCode, 403);
  assert.deepEqual(memberRes.body, { error: "Access denied" });
});
