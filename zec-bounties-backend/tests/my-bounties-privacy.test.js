const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Runs the real GET /api/bounties/mine handler. Only Express registration,
// the cache and the database are replaced; utils/privacy and
// utils/userSelects are the real modules.
const people = {
  me: {
    id: "me",
    name: "Mia Me",
    nickname: "mia",
    avatar: "https://avatars.example/mia.png",
    email: "mia@example.com",
    role: "HUNTER",
    z_address: "zs1mia",
    UA_address: "u1mia",
    // The viewer hid everything; their own rows must still come back whole.
    profileVisibility: { showDisplayName: false, showAvatar: false },
  },
  creator: {
    id: "creator",
    name: "Cara Creator",
    nickname: "cara",
    avatar: "https://avatars.example/cara.png",
    email: "cara@example.com",
    role: "TEAM",
    z_address: null,
    UA_address: "u1cara",
    profileVisibility: { showDisplayName: false, showAvatar: false },
  },
  peer: {
    id: "peer",
    name: "Pat Peer",
    nickname: "patp",
    avatar: "https://avatars.example/pat.png",
    email: "pat@example.com",
    role: "HUNTER",
    z_address: "zs1pat",
    UA_address: null,
    profileVisibility: { showDisplayName: false, showAvatar: false },
  },
  open: {
    id: "open",
    name: "Olu Open",
    nickname: "olu",
    avatar: "https://avatars.example/olu.png",
    email: "olu@example.com",
    role: "HUNTER",
    z_address: null,
    UA_address: null,
    profileVisibility: {},
  },
};

function pick(row, select) {
  if (!row) return null;
  const out = {};
  for (const [key, on] of Object.entries(select)) {
    if (on === true && key in row) out[key] = row[key];
  }
  return out;
}

// b1: created by someone else, the viewer and two others assigned.
// b2: the viewer's own suggested task, assigned to someone else.
const bounties = [
  {
    id: "b1",
    createdBy: "creator",
    assignee: "me",
    assignees: ["me", "peer", "open"],
  },
  { id: "b2", createdBy: "me", assignee: "peer", assignees: ["peer"] },
];

async function getMine(user) {
  const routes = new Map();
  const record = (method) => (route, ...handlers) => {
    routes.set(`${method} ${route}`, handlers.at(-1));
  };
  const router = Object.fromEntries(
    ["get", "post", "put", "patch", "delete", "use"].map((m) => [m, record(m)]),
  );
  const db = {
    bounty: {
      findMany: async ({ include }) =>
        bounties.map((b) => ({
          id: b.id,
          title: `Bounty ${b.id}`,
          createdBy: b.createdBy,
          assignee: b.assignee,
          assignees: b.assignees.map((id) => ({
            bountyId: b.id,
            userId: id,
            user: pick(people[id], include.assignees.include.user.select),
          })),
          assigneeUser: pick(people[b.assignee], include.assigneeUser.select),
          createdByUser: pick(
            people[b.createdBy],
            include.createdByUser.select,
          ),
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
  await routes.get("get /mine")(
    { params: {}, query: {}, user },
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
  return Object.fromEntries(body.data.map((b) => [b.id, b]));
}

const hunter = { id: "me", role: "HUNTER" };
const assigneeOf = (bounty, id) =>
  bounty.assignees.find((a) => a.userId === id).user;

test("the creator's hidden name and avatar are not sent to an assignee", async () => {
  const { b1 } = await getMine(hunter);
  assert.equal(b1.createdByUser.id, "creator");
  assert.notEqual(b1.createdByUser.name, "Cara Creator");
  assert.equal(b1.createdByUser.nickname, null);
  assert.equal(b1.createdByUser.avatar, null);
});

test("a co-assignee's hidden name and avatar are not sent to another assignee or the creator", async () => {
  const { b1, b2 } = await getMine(hunter);
  for (const peer of [assigneeOf(b1, "peer"), assigneeOf(b2, "peer"), b2.assigneeUser]) {
    assert.equal(peer.id, "peer");
    assert.notEqual(peer.name, "Pat Peer");
    assert.equal(peer.nickname, null);
    assert.equal(peer.avatar, null);
  }
});

test("the viewer's own rows and users who allow it are unchanged, and no flags are sent", async () => {
  const { b1, b2 } = await getMine(hunter);
  assert.equal(b1.assigneeUser.name, "Mia Me");
  assert.equal(b1.assigneeUser.z_address, "zs1mia");
  assert.equal(assigneeOf(b1, "me").nickname, "mia");
  assert.equal(b2.createdByUser.name, "Mia Me");
  assert.equal(b2.createdByUser.role, "HUNTER");
  assert.equal(assigneeOf(b1, "open").name, "Olu Open");
  assert.equal(assigneeOf(b1, "open").avatar, people.open.avatar);
  assert.ok(!JSON.stringify([b1, b2]).includes("profileVisibility"));
});

test("an admin still sees every user in full", async () => {
  const { b1, b2 } = await getMine({ id: "admin", role: "ADMIN" });
  assert.equal(b1.createdByUser.name, "Cara Creator");
  assert.equal(b1.createdByUser.role, "TEAM");
  assert.equal(assigneeOf(b1, "peer").name, "Pat Peer");
  assert.equal(b2.assigneeUser.avatar, people.peer.avatar);
  assert.equal(b2.assigneeUser.z_address, "zs1pat");
});
