// POST /api/bounties/:id/assignees replaces a bounty's whole roster. For a
// team bounty, people being added must be team members or in the team's
// community. Someone can already be on the roster without that: an accepted
// applicant (applying to a public team bounty needs neither), or a member who
// has since left. The roster must stay editable with them on it, which is what
// the edit modals and the "Mark as Done" winner trim send.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Stands in for every dependency a test does not care about: any property,
// call or `new` returns the stub again, and `await` resolves to it.
const anything = new Proxy(function () {}, {
  get: (_, key) => (key === "then" ? undefined : anything),
  apply: () => anything,
  construct: () => anything,
});

const USERS = [
  // Accepted through an application; never joined the community.
  { id: "applicant", role: "HUNTER", favoriteTeams: [], teamMembers: [] },
  { id: "member", role: "HUNTER", favoriteTeams: ["team-1"], teamMembers: [] },
  { id: "staff", role: "HUNTER", favoriteTeams: [], teamMembers: ["team-1"] },
  { id: "outsider", role: "HUNTER", favoriteTeams: [], teamMembers: [] },
  { id: "admin", role: "ADMIN", favoriteTeams: ["team-1"], teamMembers: [] },
];

// Evaluates the user filter the route builds: id in, role not, and the
// favoriteTeams / teamMembers "some" relations, alone or inside OR.
function userMatches(user, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "id") return value.in.includes(user.id);
    if (key === "role") return user.role !== value.not;
    if (key === "OR") return value.some((w) => userMatches(user, w));
    if (key === "favoriteTeams" || key === "teamMembers") {
      return user[key].includes(value.some.teamId);
    }
    throw new Error(`fake db: unsupported user filter ${key}`);
  });
}

function createDb(assigneeIds) {
  const db = {
    bountyRow: {
      id: "b1",
      title: "team task",
      status: "IN_PROGRESS",
      isApproved: true,
      teamId: "team-1",
      createdBy: "owner",
      assignee: null,
    },
    rows: assigneeIds.map((userId) => ({ bountyId: "b1", userId })),
  };
  const withUser = (row) => ({ ...row, user: { id: row.userId } });
  Object.assign(db, {
    bounty: {
      findUnique: async () => ({
        ...db.bountyRow,
        assignees: db.rows.map((r) => ({ userId: r.userId })),
      }),
      findUniqueOrThrow: async () => ({ ...db.bountyRow }),
      update: async ({ data }) => Object.assign(db.bountyRow, data),
      updateMany: async () => ({ count: 0 }),
    },
    bountyAssignee: {
      findMany: async () => db.rows.map(withUser),
      deleteMany: async () => {
        db.rows = [];
      },
      createMany: async ({ data }) => {
        db.rows.push(...data);
      },
      upsert: async ({ create }) => {
        if (!db.rows.some((r) => r.userId === create.userId)) {
          db.rows.push(create);
        }
        return create;
      },
    },
    // One pending application from "applicant" to b1.
    bountyApplication: {
      findUnique: async () => ({
        id: "app1",
        bountyId: "b1",
        applicantId: "applicant",
        bounty: {
          title: db.bountyRow.title,
          createdBy: db.bountyRow.createdBy,
          teamId: db.bountyRow.teamId,
        },
      }),
      update: async ({ data }) => ({
        id: "app1",
        ...data,
        applicantUser: { id: "applicant" },
      }),
    },
    // The caller is the team's OWNER, checked by the real canAdministerBounty.
    teamMember: {
      findUnique: async ({ where }) =>
        where.teamId_userId.teamId === "team-1" &&
        where.teamId_userId.userId === "owner"
          ? { teamId: "team-1", userId: "owner", role: "OWNER" }
          : null,
    },
    user: {
      findMany: async ({ where }) =>
        USERS.filter((u) => userMatches(u, where)).map((u) => ({ id: u.id })),
    },
    $queryRaw: async () => [{ id: "b1" }],
    $transaction: async (arg) =>
      typeof arg === "function" ? arg(db) : Promise.all(arg),
  });
  return db;
}

function loadBountyRoutes(db) {
  const routes = {};
  const router = new Proxy(
    {},
    {
      get: (_, method) => (url, ...handlers) => {
        routes[`${method} ${url}`] = handlers;
      },
    },
  );
  const dependencies = {
    express: { Router: () => router },
    "../prisma/client": db,
  };
  const filename = path.join(__dirname, "../routes/bounties.js");
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(filename, "utf8"),
    {
      module,
      exports: module.exports,
      require: (name) =>
        Object.hasOwn(dependencies, name) ? dependencies[name] : anything,
      console: { log() {}, error() {} },
      process: { env: {} },
      // Only the delayed second cache wipe uses it; the caches are stubbed.
      setTimeout: () => {},
    },
    { filename },
  );
  const owner = { id: "owner", role: "HUNTER" };
  const call = async (route, req) => {
    const res = {
      statusCode: 200,
      headersSent: false,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        this.headersSent = true;
        return this;
      },
    };
    await routes[route].at(-1)({ user: owner, ...req }, res);
    return res;
  };
  const setAssignees = (userIds) =>
    call("post /:id/assignees", { params: { id: "b1" }, body: { userIds } });
  setAssignees.acceptApplication = () =>
    call("put /applications/:applicationId", {
      params: { applicationId: "app1" },
      body: { status: "accepted" },
    });
  return setAssignees;
}

const roster = (db) => db.rows.map((r) => r.userId).sort();

test("an accepted applicant from outside the community stays editable", async () => {
  const db = createDb([]);
  const routes = loadBountyRoutes(db);

  // Accepting adds the applicant with no community check.
  const accepted = await routes.acceptApplication();
  assert.equal(accepted.statusCode, 200, JSON.stringify(accepted.body));
  assert.deepEqual(roster(db), ["applicant"]);

  // The owner then adds a community member in the edit modal, which sends
  // the full roster.
  const res = await routes(["applicant", "member"]);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(roster(db), ["applicant", "member"]);
});

test("a community member can be added next to an accepted applicant", async () => {
  const db = createDb(["applicant"]);
  const res = await loadBountyRoutes(db)(["applicant", "member"]);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(roster(db), ["applicant", "member"]);
});

test("removing one assignee keeps an accepted applicant on the roster", async () => {
  // Also what the "Mark as Done" winner trim sends: userIds = [winnerId].
  const db = createDb(["applicant", "member"]);
  const res = await loadBountyRoutes(db)(["applicant"]);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(roster(db), ["applicant"]);
});

test("a person outside the team and its community still cannot be added", async () => {
  const db = createDb(["applicant"]);
  const res = await loadBountyRoutes(db)(["applicant", "outsider"]);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /belong to this team or its community/);
  assert.deepEqual(roster(db), ["applicant"]);
});

test("a global admin still cannot be added", async () => {
  const db = createDb(["member"]);
  const res = await loadBountyRoutes(db)(["member", "admin"]);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(roster(db), ["member"]);
});

test("team members and community members can be added to an empty roster", async () => {
  const db = createDb([]);
  const res = await loadBountyRoutes(db)(["member", "staff"]);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(roster(db), ["member", "staff"]);
});
