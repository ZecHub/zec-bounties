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

const applicant = { id: "hunter-1", role: "HUNTER" };

test("POST /apply selects bounty status and rejects non-TO_DO statuses", async () => {
  for (const status of ["IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]) {
    let selectedFields = null;
    let createCalled = false;

    prisma.bounty.findUnique = async ({ select }) => {
      selectedFields = select;
      return {
        id: "b1",
        createdBy: "owner-1",
        assignee: null,
        isPrivate: false,
        teamId: null,
        status,
      };
    };
    prisma.bountyApplication.findUnique = async () => null;
    prisma.bountyApplication.create = async () => {
      createCalled = true;
      throw new Error("should not create application for non-TO_DO bounty");
    };

    const res = mockRes();
    await handler("post", "/apply")(
      {
        user: applicant,
        body: { bountyId: "b1", message: "I can help with this bounty." },
      },
      res,
    );

    assert.equal(selectedFields?.status, true);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "Bounty is not accepting applications");
    assert.equal(createCalled, false);
  }
});

test("POST /apply hides private non-TO_DO bounties with 404 before status check", async () => {
  prisma.bounty.findUnique = async () => ({
    id: "b-private",
    createdBy: "owner-1",
    assignee: null,
    isPrivate: true,
    teamId: null,
    status: "DONE",
  });
  prisma.bountyAssignee.findUnique = async () => null;

  const res = mockRes();
  await handler("post", "/apply")(
    {
      user: applicant,
      body: { bountyId: "b-private", message: "Interested" },
    },
    res,
  );

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error, "Bounty not found");
});

test("POST /apply allows applying to an unassigned TO_DO bounty", async () => {
  prisma.bounty.findUnique = async () => ({
    id: "b-todo",
    createdBy: "owner-1",
    assignee: null,
    isPrivate: false,
    teamId: null,
    status: "TO_DO",
  });
  prisma.bountyApplication.findUnique = async () => null;
  prisma.bountyApplication.create = async ({ data }) => ({
    id: "app-1",
    ...data,
    bounty: { id: "b-todo", title: "Open task", bountyAmount: 0.5 },
    applicantUser: { id: applicant.id, name: "Hunter One" },
  });
  prisma.user.findMany = async () => [];

  const res = mockRes();
  await handler("post", "/apply")(
    {
      user: applicant,
      body: { bountyId: "b-todo", message: "  I can complete this.  " },
    },
    res,
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.id, "app-1");
  assert.equal(res.body.message, "I can complete this.");
});

test("POST /apply still rejects an assigned TO_DO bounty and self-applications", async () => {
  prisma.bounty.findUnique = async () => ({
    id: "b-assigned",
    createdBy: "owner-1",
    assignee: "other-hunter",
    isPrivate: false,
    teamId: null,
    status: "TO_DO",
  });

  const assignedRes = mockRes();
  await handler("post", "/apply")(
    {
      user: applicant,
      body: { bountyId: "b-assigned", message: "Can I take this?" },
    },
    assignedRes,
  );
  assert.equal(assignedRes.statusCode, 400);
  assert.equal(assignedRes.body.error, "Bounty already assigned");

  prisma.bounty.findUnique = async () => ({
    id: "b-own",
    createdBy: applicant.id,
    assignee: null,
    isPrivate: false,
    teamId: null,
    status: "TO_DO",
  });

  const ownRes = mockRes();
  await handler("post", "/apply")(
    {
      user: applicant,
      body: { bountyId: "b-own", message: "Self apply" },
    },
    ownRes,
  );
  assert.equal(ownRes.statusCode, 400);
  assert.equal(ownRes.body.error, "Cannot apply to your own bounty");
});
