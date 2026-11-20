const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadSubmissionRoute } = require("./helpers/submissionHarness");

// The bounty_activity event goes out through sendToUser, which does not
// redact (it assumes the payload belongs to the recipient). Its audience is
// the bounty creator, platform admins and team OWNER/ADMINs, so the actor on
// that row must carry only public profile fields, as logActivity() does.
const users = {
  creator: { id: "creator", name: "Creator", nickname: "creator", email: "creator@example.com", avatar: null, role: "HUNTER" },
  hunter: { id: "hunter", name: "Hunter", nickname: "hunter", email: "hunter@example.com", avatar: null, role: "HUNTER" },
  admin: { id: "admin", name: "Admin", nickname: "admin", email: "admin@example.com", avatar: null, role: "ADMIN" },
};

const pick = (row, select) =>
  row && Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k]]));

function fakeDb() {
  const bounty = {
    id: "bounty",
    isApproved: true,
    status: "IN_PROGRESS",
    assignee: "hunter",
    createdBy: "creator",
    teamId: null,
    isPrivate: false,
  };
  const db = {
    async $transaction(fn) { return fn(db); },
    bounty: {
      async findUnique({ select }) {
        return select?.workSubmissions ? { ...bounty, workSubmissions: [] } : bounty;
      },
      async update() { return { ...bounty, status: "IN_REVIEW", workSubmissions: [] }; },
    },
    bountyAssignee: { async findUnique() { return null; } },
    workSubmission: { async create({ data }) { return { id: "submission", ...data }; } },
    bountyActivity: {
      async create({ data, include }) {
        return { id: "activity", createdAt: new Date(), ...data, actor: pick(users[data.actorId], include.actor.select) };
      },
    },
    user: {
      async findMany({ where }) {
        return where?.role === "ADMIN" ? [{ id: "admin" }] : [];
      },
    },
    teamMember: { async findMany() { return []; } },
  };
  return db;
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

for (const [label, caller, body, actorEmail] of [
  ["a hunter's own submission", users.hunter, { description: "Work done" }, "hunter@example.com"],
  ["an admin's submission on a hunter's behalf", users.admin, { description: "Work done", onBehalfOf: "hunter" }, "admin@example.com"],
]) {
  test(`the WORK_SUBMITTED activity event for ${label} does not carry the actor's email`, async () => {
    const route = loadSubmissionRoute(fakeDb());
    const response = await route.submit(caller, "bounty", body);
    assert.equal(response.statusCode, 200);
    await settle();
    await settle();

    const toCreator = route.effects.broadcasts.filter(
      ([userId, type]) => userId === "creator" && type === "bounty_activity",
    );
    assert.equal(toCreator.length, 1, "the bounty creator is sent the activity event");
    const [, , row] = toCreator[0];
    assert.equal(row.type, "WORK_SUBMITTED");
    assert.equal(row.actor.id, caller.id);
    assert.equal(row.actor.email, undefined);
    assert.ok(!JSON.stringify(row).includes(actorEmail));
  });
}
