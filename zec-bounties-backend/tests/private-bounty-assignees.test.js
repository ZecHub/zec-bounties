const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// The bounties router pulls in the mailer and push modules, which open an SMTP
// connection / demand VAPID keys at load time. Stub them before loading.
for (const mod of ["../utils/sendMail", "../utils/notifyUser"]) {
  const file = require.resolve(path.join(__dirname, mod));
  require.cache[file] = {
    id: file,
    filename: file,
    loaded: true,
    exports: async () => {},
  };
}

// No Redis in tests: make cache calls no-ops instead of logging errors.
const { redisClient } = require("../config/redis");
for (const method of ["get", "setEx", "del", "incr"]) {
  redisClient[method] = async () => null;
}

const prisma = require("../prisma/client");
const router = require("../routes/bounties");
const { getBroadcastRecipients } = require("../utils/bountyHelpers");

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

const admin = { id: "admin", role: "ADMIN" };
const owner = { id: "owner", role: "TEAM" };
const member = { id: "member", role: "HUNTER" };
const outsider = { id: "outsider", role: "HUNTER" };
const legacy = { id: "legacy", role: "HUNTER" };
const stranger = { id: "stranger", role: "HUNTER" };

const teamMembers = ["owner", "member"];

// A private team bounty. `roster` holds its bountyAssignee user ids and
// `assignee` its legacy single-assignee column.
function useFakeDb({ roster = [], assignee = null } = {}) {
  const bounty = {
    id: "b1",
    title: "Private team task",
    isPrivate: true,
    teamId: "team-1",
    createdBy: "owner",
    assignee,
    suggestionReviewStatus: null,
  };
  const rows = roster.map((userId) => ({ bountyId: "b1", userId }));

  prisma.bounty.findUnique = async ({ select } = {}) => {
    // Callers that select scalar fields only get no roster, like Prisma.
    if (select && !select.assignees) return { ...bounty };
    return {
      ...bounty,
      assignees: rows.map((r) => ({ ...r, user: { id: r.userId } })),
    };
  };
  prisma.bountyAssignee.findUnique = async ({ where }) => {
    const { bountyId, userId } = where.bountyId_userId;
    return rows.find((r) => r.bountyId === bountyId && r.userId === userId)
      ? { id: `${bountyId}:${userId}` }
      : null;
  };
  prisma.bountyAssignee.findMany = async () =>
    rows.map((r) => ({ ...r, user: { id: r.userId } }));
  prisma.teamMember.findUnique = async ({ where }) =>
    teamMembers.includes(where.teamId_userId.userId) ? { role: "MEMBER" } : null;
  prisma.teamMember.findMany = async () =>
    teamMembers.map((userId) => ({ userId }));
  prisma.teamFavorite.findUnique = async () => null;
  prisma.teamFavorite.findMany = async () => [];
  prisma.user.findMany = async () => [{ id: "admin" }];
}

async function detail(user) {
  const res = mockRes();
  await handler("get", "/:id")({ user, params: { id: "b1" } }, res);
  return res.statusCode;
}

async function roster(user) {
  const res = mockRes();
  await handler("get", "/:id/assignees")({ user, params: { id: "b1" } }, res);
  return res.statusCode;
}

test("an outside assignee of a private team bounty can GET it", async () => {
  useFakeDb({ roster: ["outsider"] });
  assert.equal(await detail(outsider), 200);
  assert.equal(await roster(outsider), 200);
});

test("an outside assignee is in the broadcast audience", async () => {
  useFakeDb({ roster: ["outsider"] });
  const recipients = await getBroadcastRecipients({
    id: "b1",
    isPrivate: true,
    createdBy: "owner",
    teamId: "team-1",
  });
  assert.deepEqual(recipients.sort(), ["admin", "member", "outsider", "owner"]);
});

test("the legacy assignee column alone grants the same access", async () => {
  useFakeDb({ assignee: "legacy" });
  assert.equal(await detail(legacy), 200);
  assert.equal(await roster(legacy), 200);
  const recipients = await getBroadcastRecipients({
    id: "b1",
    isPrivate: true,
    createdBy: "owner",
    teamId: "team-1",
  });
  assert.ok(recipients.includes("legacy"));
});

test("an unrelated user still gets 404", async () => {
  useFakeDb({ roster: ["outsider"], assignee: "legacy" });
  assert.equal(await detail(stranger), 404);
  assert.equal(await roster(stranger), 404);
  assert.equal(await detail(undefined), 404);
  const recipients = await getBroadcastRecipients({
    id: "b1",
    isPrivate: true,
    createdBy: "owner",
    teamId: "team-1",
  });
  assert.ok(!recipients.includes("stranger"));
});

test("creator, team members and admins keep their access", async () => {
  useFakeDb();
  for (const user of [admin, owner, member]) {
    assert.equal(await detail(user), 200);
  }
});

test("a team-wide broadcast without a bounty id skips the assignee lookup", async () => {
  useFakeDb({ roster: ["outsider"] });
  prisma.bounty.findUnique = async () => {
    throw new Error("no bounty to look up");
  };
  const recipients = await getBroadcastRecipients({ isPrivate: true, teamId: "team-1" });
  // No creator on a team-wide call; that slot was already undefined before.
  assert.deepEqual(recipients.filter(Boolean).sort(), ["admin", "member", "owner"]);
});

test("public bounties still broadcast to everyone", async () => {
  useFakeDb();
  assert.equal(await getBroadcastRecipients({ id: "b1", isPrivate: false }), null);
});
