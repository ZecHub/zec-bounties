const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Runs the real GET /api/bounties/:id/assignees handler. Only Express
// registration, the cache and the database are replaced; utils/privacy and
// utils/userSelects are the real modules.
const people = {
  hidden: {
    id: "hidden-hunter",
    name: "Jane Realname",
    nickname: "janer",
    avatar: "https://avatars.example/jane.png",
    email: "jane@example.com",
    z_address: "zs1jane",
    UA_address: "u1jane",
    // Opted out of name and avatar on the public profile.
    profileVisibility: { showDisplayName: false, showAvatar: false },
  },
  open: {
    id: "open-hunter",
    name: "Olu Open",
    nickname: "olu",
    avatar: "https://avatars.example/olu.png",
    email: "olu@example.com",
    z_address: null,
    UA_address: "u1olu",
    profileVisibility: {},
  },
};

function pick(row, select) {
  const out = {};
  for (const [key, on] of Object.entries(select)) {
    if (on === true && key in row) out[key] = row[key];
  }
  return out;
}

async function getAssignees(user) {
  const routes = new Map();
  const record = (method) => (route, ...handlers) => {
    routes.set(`${method} ${route}`, handlers.at(-1));
  };
  const router = Object.fromEntries(
    ["get", "post", "put", "patch", "delete", "use"].map((m) => [m, record(m)]),
  );
  const db = {
    bounty: {
      findUnique: async () => ({
        id: "b1",
        isPrivate: false,
        createdBy: "creator",
        teamId: null,
      }),
    },
    bountyAssignee: {
      findMany: async ({ include }) =>
        [people.hidden, people.open].map((u, i) => ({
          id: `row-${i}`,
          bountyId: "b1",
          userId: u.id,
          assignedAt: "2026-11-01T00:00:00Z",
          user: pick(u, include.user.select),
        })),
    },
  };
  const noop = () => {};
  const dependencies = {
    express: { Router: () => router },
    "../prisma/client": db,
    "../utils/suggestionSettings": { getSuggestionSettings: noop },
    "../helpers/email": { escapeHtml: String, formatEmailText: String },
    "../middleware/auth": {
      authenticate: noop,
      isAdmin: noop,
      optionalAuthenticate: noop,
      signSessionToken: noop,
    },
    "../middleware/websocket": { sendRealtimeUpdate: noop, sendToUser: noop },
    "../utils/cache": {
      getCache: async () => null,
      setCache: async () => {},
      delCache: async () => {},
      deleteCacheByPattern: async () => {},
      getVersion: async () => 0,
      bumpVersion: async () => {},
      invalidateUserDirectory: async () => {},
      TTL: {},
    },
    "../utils/sendMail": noop,
    "../utils/notifyUser": noop,
    "../utils/discord/discordNotify": { notifyNewBounty: noop },
    "../utils/discord/discordAssignWebhook": {
      notifyAssignment: noop,
      notifyBountyAssignees: noop,
      notifyBountyState: noop,
    },
    "../utils/constants": { REQUIRED_TEAM_VERIFICATIONS: [] },
    "../helpers/validateBounty": {},
    "../utils/bountySuggestionReview": {},
    "../utils/userSelects": require("../utils/userSelects"),
    "../utils/bountyHelpers": {},
    "../utils/userIdentity": {},
    "../utils/bountyActivity": {},
    "../utils/privacy": require("../utils/privacy"),
    "../utils/exportableBounty": {},
  };
  const filename = path.join(__dirname, "../routes/bounties.js");
  vm.runInNewContext(
    fs.readFileSync(filename, "utf8"),
    {
      module: { exports: {} },
      console,
      process,
      setTimeout,
      require(name) {
        assert.ok(
          Object.hasOwn(dependencies, name),
          `Unexpected dependency ${name}`,
        );
        return dependencies[name];
      },
    },
    { filename },
  );
  let body;
  let status = 200;
  await routes.get("get /:id/assignees")(
    { params: { id: "b1" }, query: {}, user },
    {
      status(code) {
        status = code;
        return this;
      },
      json(value) {
        body = JSON.parse(JSON.stringify(value));
      },
    },
  );
  assert.equal(status, 200);
  return Object.fromEntries(body.map((row) => [row.userId, row.user]));
}

const hunter = { id: "someone-else", role: "HUNTER" };

test("a signed-in hunter does not get the name or nickname of an assignee who hid their display name", async () => {
  const rows = await getAssignees(hunter);
  const user = rows[people.hidden.id];
  assert.equal(user.id, people.hidden.id);
  assert.notEqual(user.name, "Jane Realname");
  assert.equal(user.nickname, null);
});

test("a signed-in hunter does not get the avatar of an assignee who hid their avatar", async () => {
  const rows = await getAssignees(hunter);
  assert.equal(rows[people.hidden.id].avatar, null);
});

test("the visibility flags themselves are not sent", async () => {
  const rows = await getAssignees(hunter);
  for (const user of Object.values(rows)) {
    assert.equal(user.profileVisibility, undefined);
  }
});

test("an assignee who allows it is shown in full, and an admin sees every assignee in full", async () => {
  const pub = (await getAssignees(hunter))[people.open.id];
  assert.equal(pub.name, "Olu Open");
  assert.equal(pub.nickname, "olu");
  assert.equal(pub.avatar, people.open.avatar);
  assert.equal(pub.email, undefined);
  assert.equal(pub.UA_address, undefined);

  const adm = (await getAssignees({ id: "admin", role: "ADMIN" }))[
    people.hidden.id
  ];
  assert.equal(adm.name, "Jane Realname");
  assert.equal(adm.nickname, "janer");
  assert.equal(adm.avatar, people.hidden.avatar);
  assert.equal(adm.email, "jane@example.com");
  assert.equal(adm.UA_address, "u1jane");
});
