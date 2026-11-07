const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const {
  hideOtherUsersEmails,
  withoutOtherUsersEmails,
} = require("../middleware/hideOtherUsersEmails");

// Shaped like a team bounty response: creator, assignees, applicants and an
// activity actor, each a user row with an email.
function bountyPayload() {
  return {
    id: "bounty-1",
    title: "Fix the docs",
    createdByUser: { id: "creator", name: "Creator", email: "c@example.com" },
    assigneeUser: {
      id: "hunter",
      email: "h@example.com",
      z_address: "zs1hunter",
      UA_address: "u1hunter",
    },
    assignees: [{ user: { id: "hunter", email: "h@example.com" } }],
    applications: [
      { id: "app-1", applicantUser: { id: "other", email: "o@example.com" } },
    ],
    activity: [{ type: "APPROVED", actor: { id: "admin", email: "a@x.org" } }],
  };
}

function emailsIn(value, found = []) {
  if (!value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value)) {
    if (key === "email") found.push(child);
    emailsIn(child, found);
  }
  return found;
}

test("a signed-in user keeps their own email and loses everyone else's", () => {
  const out = withoutOtherUsersEmails(bountyPayload(), "hunter");
  assert.deepEqual(emailsIn(out), ["h@example.com", "h@example.com"]);
  assert.equal(out.assigneeUser.z_address, "zs1hunter");
  assert.equal(out.title, "Fix the docs");
});

test("an anonymous caller gets no emails at all", () => {
  assert.deepEqual(emailsIn(withoutOtherUsersEmails(bountyPayload())), []);
});

test("non-object bodies pass through unchanged", () => {
  assert.equal(withoutOtherUsersEmails("ok", "hunter"), "ok");
  assert.equal(withoutOtherUsersEmails(null, "hunter"), null);
});

// The filter is mounted before the router, so it must read req.user at send
// time, after the route's own auth middleware has run.
async function request(user) {
  const app = express();
  const router = express.Router();
  router.get("/", (req, res) => {
    req.user = user;
    res.json(bountyPayload());
  });
  router.get("/send", (req, res) => {
    req.user = user;
    res.send(bountyPayload());
  });
  app.use("/api/bounties", hideOtherUsersEmails, router);

  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/bounties`;
    const [json, send] = await Promise.all(
      [base, `${base}/send`].map((url) => fetch(url).then((r) => r.json())),
    );
    return { json, send };
  } finally {
    server.close();
  }
}

test("a hunter sees only their own email, through res.json and res.send", async () => {
  const { json, send } = await request({ id: "hunter", role: "HUNTER" });
  assert.deepEqual(emailsIn(json), ["h@example.com", "h@example.com"]);
  assert.deepEqual(emailsIn(send), ["h@example.com", "h@example.com"]);
});

test("a team user sees no other user's email", async () => {
  const { json } = await request({ id: "creator", role: "TEAM" });
  assert.deepEqual(emailsIn(json), ["c@example.com"]);
});

test("an admin still sees every email", async () => {
  const { json } = await request({ id: "admin", role: "ADMIN" });
  assert.equal(emailsIn(json).length, 5);
});

// Payout addresses (z_address / UA_address) are as sensitive as email and must
// follow the same owner/admin-only rule.
function addressesIn(value, found = []) {
  if (!value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value)) {
    if (key === "z_address" || key === "UA_address") found.push(child);
    addressesIn(child, found);
  }
  return found;
}

test("a non-owner, non-admin loses other users' payout addresses", async () => {
  // creator (TEAM) viewing a bounty whose assignee is the hunter
  const { json } = await request({ id: "creator", role: "TEAM" });
  assert.deepEqual(addressesIn(json), []);
});

test("the owner keeps their own payout addresses", () => {
  const out = withoutOtherUsersEmails(bountyPayload(), "hunter");
  assert.equal(out.assigneeUser.z_address, "zs1hunter");
  assert.equal(out.assigneeUser.UA_address, "u1hunter");
});

test("an admin still sees payout addresses", async () => {
  const { json } = await request({ id: "admin", role: "ADMIN" });
  assert.deepEqual(addressesIn(json).sort(), ["u1hunter", "zs1hunter"]);
});

test("an anonymous caller gets no payout addresses", () => {
  assert.deepEqual(addressesIn(withoutOtherUsersEmails(bountyPayload())), []);
});

// Self-payout team managers (role === "TEAM", teamMember.role in OWNER/ADMIN,
// team.payoutBy === "TEAM") need assignee payout addresses and emails on
// GET /:teamId/export-completed so the Export Completed modal and CSV have
// destination addresses.
function loadTeamsRouter(db, currentUser) {
  const fs = require("node:fs");
  const path = require("node:path");
  const vm = require("node:vm");
  const anything = new Proxy(function () {}, {
    get: (_, key) => (key === "then" ? undefined : anything),
    apply: () => anything,
    construct: () => anything,
  });
  const dependencies = {
    express,
    "@prisma/client": {
      PrismaClient: function () {
        return db;
      },
    },
    "../middleware/auth": {
      authenticate: (req, _res, next) => {
        req.user = currentUser;
        next();
      },
      optionalAuthenticate: (req, _res, next) => {
        req.user = currentUser;
        next();
      },
      requireAdmin: (_req, _res, next) => next(),
    },
    "../utils/exportableBounty": require("../utils/exportableBounty"),
    "../utils/userSelects": require("../utils/userSelects"),
  };
  const filename = path.join(__dirname, "../routes/teams.js");
  const mod = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(filename, "utf8"),
    {
      module: mod,
      exports: mod.exports,
      require: (name) =>
        Object.hasOwn(dependencies, name) ? dependencies[name] : anything,
      console: { log() {}, error() {} },
      process: { env: {} },
      Promise,
    },
    { filename },
  );
  return mod.exports;
}

async function requestTeamExport({ user, memberRole, payoutBy }) {
  const db = {
    teamMember: {
      findUnique: async () => (memberRole ? { role: memberRole } : null),
    },
    team: {
      findUnique: async () => (payoutBy ? { payoutBy } : null),
    },
    bounty: {
      findMany: async () => [
        {
          id: "bounty-1",
          title: "Completed team bounty",
          teamId: "team-1",
          chain: "MAIN",
          status: "DONE",
          isApproved: true,
          isPaid: false,
          paymentInFlight: false,
          exportedAt: null,
          assigneeUser: {
            id: "hunter-1",
            name: "Hunter One",
            email: "hunter1@example.com",
            z_address: "zs1hunter1",
            UA_address: "u1hunter1",
          },
          assignees: [
            {
              user: {
                id: "hunter-2",
                name: "Hunter Two",
                email: "hunter2@example.com",
                z_address: "zs1hunter2",
                UA_address: "u1hunter2",
              },
            },
          ],
        },
      ],
    },
  };

  const app = express();
  app.use(
    "/api/teams",
    hideOtherUsersEmails,
    loadTeamsRouter(db, user),
  );

  const server = app.listen(0);
  try {
    const res = await fetch(
      `http://127.0.0.1:${server.address().port}/api/teams/team-1/export-completed`,
    );
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
}

test("a self-payout team OWNER or ADMIN receives assignee payout addresses and emails on GET /:teamId/export-completed", async () => {
  for (const memberRole of ["OWNER", "ADMIN"]) {
    const { status, body } = await requestTeamExport({
      user: { id: "team-owner", role: "TEAM" },
      memberRole,
      payoutBy: "TEAM",
    });
    assert.equal(status, 200);
    const [bounty] = body.data;
    assert.equal(bounty.assigneeUser.UA_address, "u1hunter1");
    assert.equal(bounty.assigneeUser.z_address, "zs1hunter1");
    assert.equal(bounty.assigneeUser.email, "hunter1@example.com");
    assert.equal(bounty.assignees[0].user.UA_address, "u1hunter2");
    assert.equal(bounty.assignees[0].user.z_address, "zs1hunter2");
    assert.equal(bounty.assignees[0].user.email, "hunter2@example.com");
  }
});

test("non-manager team members and admin-payout teams cannot export completed team bounties", async () => {
  const memberRes = await requestTeamExport({
    user: { id: "team-member", role: "TEAM" },
    memberRole: "MEMBER",
    payoutBy: "TEAM",
  });
  assert.equal(memberRes.status, 403);

  const adminPayoutRes = await requestTeamExport({
    user: { id: "team-owner", role: "TEAM" },
    memberRole: "OWNER",
    payoutBy: "ADMIN",
  });
  assert.equal(adminPayoutRes.status, 403);
});

