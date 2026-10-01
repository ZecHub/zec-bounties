const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// bountyHelpers pulls in the mailer and push modules, which open an SMTP
// connection / demand VAPID keys at load time. Stub them before loading.
for (const mod of ["../utils/sendMail", "../utils/notifyUser"]) {
  const file = require.resolve(path.join(__dirname, mod));
  require.cache[file] = { id: file, filename: file, loaded: true, exports: async () => {} };
}

const prisma = require("../prisma/client");
const {
  handleWebSocket,
  sendRealtimeUpdate,
  sendToUser,
} = require("../middleware/websocket");
const {
  broadcastBountyEvent,
  broadcastTeamEvent,
} = require("../utils/bountyHelpers");

// Minimal stand-in for a `ws` socket: records what it was sent.
function connect(id) {
  const handlers = {};
  const ws = {
    readyState: 1,
    received: [],
    send(message) {
      ws.received.push(JSON.parse(message));
    },
    on(event, fn) {
      handlers[event] = fn;
    },
    close() {},
    disconnect() {
      handlers.close();
    },
  };
  handleWebSocket(ws, prisma, { id, name: id });
  ws.received.length = 0; // drop the join/welcome chatter
  return ws;
}

function eventsOf(ws, type) {
  return ws.received.filter((m) => m.type === type);
}

// A payload shaped like the real ones: a bounty with nested users.
function bountyPayload() {
  return {
    id: "b1",
    title: "Bounty",
    createdByUser: {
      id: "alice",
      name: "Alice",
      email: "alice@example.com",
      role: "HUNTER",
    },
    assigneeUser: {
      id: "alice",
      name: "Alice",
      email: "alice@example.com",
      z_address: "zs1private",
      UA_address: "u1private",
    },
    assignees: [
      { userId: "bob", user: { id: "bob", name: "Bob", email: "bob@example.com" } },
    ],
  };
}

const PRIVATE_KEYS = [
  "email",
  "password",
  "z_address",
  "UA_address",
  "githubId",
  "discordUserId",
  "emailNotifications",
  "pushNotifications",
  "ofacVerified",
  "profileVisibility",
];

function assertNoPrivateFields(value) {
  const json = JSON.stringify(value);
  for (const key of PRIVATE_KEYS) {
    assert.ok(!json.includes(`"${key}"`), `payload leaked "${key}": ${json}`);
  }
}

test("broadcasts strip private user fields at any depth", (t) => {
  const alice = connect("alice");
  const bob = connect("bob");
  t.after(() => [alice, bob].forEach((ws) => ws.disconnect()));

  sendRealtimeUpdate("bounty_updated", bountyPayload(), "alice");

  const [event] = eventsOf(bob, "bounty_updated");
  assert.ok(event, "bob should receive the public bounty update");
  assertNoPrivateFields(event);
  assert.equal(event.payload.assigneeUser.name, "Alice");
  assert.equal(event.payload.assignees[0].user.name, "Bob");
});

test("a full user row broadcast loses every private field", (t) => {
  const bob = connect("bob");
  t.after(() => bob.disconnect());

  sendRealtimeUpdate("user_updated", {
    id: "alice",
    name: "Alice",
    nickname: "alice",
    avatar: "https://example.com/a.png",
    role: "HUNTER",
    email: "alice@example.com",
    password: "$2b$10$hash",
    z_address: "zs1private",
    UA_address: "u1private",
    githubId: "123",
    discordUserId: "456",
    emailNotifications: true,
    pushNotifications: true,
    ofacVerified: true,
    profileVisibility: { earnings: false },
  });

  const [event] = eventsOf(bob, "user_updated");
  assertNoPrivateFields(event);
  assert.deepEqual(Object.keys(event.payload).sort(), [
    "avatar",
    "id",
    "name",
    "nickname",
    "role",
  ]);
});

test("sendToUser delivers the owner's own data only to the owner", (t) => {
  const alice = connect("alice");
  const bob = connect("bob");
  t.after(() => [alice, bob].forEach((ws) => ws.disconnect()));

  sendToUser("alice", "user_updated", {
    id: "alice",
    email: "alice@example.com",
    UA_address: "u1private",
  });

  const [own] = eventsOf(alice, "user_updated");
  assert.equal(own.payload.email, "alice@example.com");
  assert.equal(own.payload.UA_address, "u1private");
  assert.equal(eventsOf(bob, "user_updated").length, 0);
});

test("recipient-scoped updates reach only the listed users", (t) => {
  const alice = connect("alice");
  const bob = connect("bob");
  const carol = connect("carol");
  t.after(() => [alice, bob, carol].forEach((ws) => ws.disconnect()));

  sendRealtimeUpdate("bounty_updated", bountyPayload(), "alice", ["alice", "bob"]);

  assert.equal(eventsOf(alice, "bounty_updated").length, 0, "sender is excluded");
  assert.equal(eventsOf(bob, "bounty_updated").length, 1);
  assert.equal(eventsOf(carol, "bounty_updated").length, 0);
  assertNoPrivateFields(eventsOf(bob, "bounty_updated")[0]);
});

// broadcastBountyEvent resolves the audience from the database. Stub the
// three lookups it (via getBroadcastRecipients) performs.
function stubBountyLookups(t, bounty, { members = [], favoriters = [], admins = [] } = {}) {
  const originals = {
    bounty: prisma.bounty.findUnique,
    users: prisma.user.findMany,
    members: prisma.teamMember.findMany,
    favorites: prisma.teamFavorite.findMany,
  };
  prisma.bounty.findUnique = async () => bounty;
  prisma.user.findMany = async () => admins.map((id) => ({ id }));
  prisma.teamMember.findMany = async () => members.map((userId) => ({ userId }));
  prisma.teamFavorite.findMany = async () => favoriters.map((userId) => ({ userId }));
  t.after(() => {
    prisma.bounty.findUnique = originals.bounty;
    prisma.user.findMany = originals.users;
    prisma.teamMember.findMany = originals.members;
    prisma.teamFavorite.findMany = originals.favorites;
  });
}

test("private-team bounty events reach only that team's audience", async (t) => {
  stubBountyLookups(
    t,
    { isPrivate: true, createdBy: "owner", teamId: "team1" },
    { members: ["member"], favoriters: ["fan"], admins: ["admin"] },
  );
  const sockets = Object.fromEntries(
    ["owner", "member", "fan", "admin", "outsider"].map((id) => [id, connect(id)]),
  );
  t.after(() => Object.values(sockets).forEach((ws) => ws.disconnect()));

  await broadcastBountyEvent("bounty_updated", bountyPayload(), "b1", null);

  for (const id of ["owner", "member", "fan", "admin"]) {
    assert.equal(eventsOf(sockets[id], "bounty_updated").length, 1, `${id} should receive it`);
  }
  assert.equal(eventsOf(sockets.outsider, "bounty_updated").length, 0);
});

test("public bounty events still reach everyone, minus the sender", async (t) => {
  stubBountyLookups(t, { isPrivate: false, createdBy: "owner", teamId: null });
  const owner = connect("owner");
  const other = connect("other");
  t.after(() => [owner, other].forEach((ws) => ws.disconnect()));

  await broadcastBountyEvent("bounty_updated", bountyPayload(), "b1", "owner");

  assert.equal(eventsOf(owner, "bounty_updated").length, 0);
  assert.equal(eventsOf(other, "bounty_updated").length, 1);
  assertNoPrivateFields(eventsOf(other, "bounty_updated")[0]);
});

test("nothing is sent when the bounty's audience cannot be resolved", async (t) => {
  const original = prisma.bounty.findUnique;
  prisma.bounty.findUnique = async () => {
    throw new Error("db down");
  };
  const originalError = console.error;
  console.error = () => {};
  t.after(() => {
    prisma.bounty.findUnique = original;
    console.error = originalError;
  });
  const other = connect("other");
  t.after(() => other.disconnect());

  await broadcastBountyEvent("bounty_updated", bountyPayload(), "b1", null);

  assert.equal(eventsOf(other, "bounty_updated").length, 0);
});

function stubTeamLookups(t, team, { members = [], favoriters = [], admins = [] } = {}) {
  const originals = {
    team: prisma.team.findUnique,
    users: prisma.user.findMany,
    members: prisma.teamMember.findMany,
    favorites: prisma.teamFavorite.findMany,
  };
  prisma.team.findUnique = async () => team;
  prisma.user.findMany = async () => admins.map((id) => ({ id }));
  prisma.teamMember.findMany = async () => members.map((userId) => ({ userId }));
  prisma.teamFavorite.findMany = async () => favoriters.map((userId) => ({ userId }));
  t.after(() => {
    prisma.team.findUnique = originals.team;
    prisma.user.findMany = originals.users;
    prisma.teamMember.findMany = originals.members;
    prisma.teamFavorite.findMany = originals.favorites;
  });
}

test("team-internal events reach only members and admins, even for public teams", async (t) => {
  stubTeamLookups(t, { isPrivate: false }, { members: ["member"], favoriters: ["fan"], admins: ["admin"] });
  const sockets = Object.fromEntries(
    ["member", "fan", "admin", "outsider"].map((id) => [id, connect(id)]),
  );
  t.after(() => Object.values(sockets).forEach((ws) => ws.disconnect()));

  await broadcastTeamEvent(
    "team_wallet_created",
    { teamId: "team1", wallet: { accountName: "team-wallet" } },
    "team1",
    null,
    { membersOnly: true },
  );

  assert.equal(eventsOf(sockets.member, "team_wallet_created").length, 1);
  assert.equal(eventsOf(sockets.admin, "team_wallet_created").length, 1);
  assert.equal(eventsOf(sockets.fan, "team_wallet_created").length, 0);
  assert.equal(eventsOf(sockets.outsider, "team_wallet_created").length, 0);
});

test("a removed member is still told they were removed", async (t) => {
  stubTeamLookups(t, { isPrivate: false }, { members: ["member"] });
  const member = connect("member");
  const removed = connect("removed");
  const outsider = connect("outsider");
  t.after(() => [member, removed, outsider].forEach((ws) => ws.disconnect()));

  await broadcastTeamEvent(
    "team_member_removed",
    { teamId: "team1", userId: "removed" },
    "team1",
    null,
    { membersOnly: true, extraUserIds: ["removed"] },
  );

  assert.equal(eventsOf(member, "team_member_removed").length, 1);
  assert.equal(eventsOf(removed, "team_member_removed").length, 1);
  assert.equal(eventsOf(outsider, "team_member_removed").length, 0);
});

test("directory events: public teams reach everyone, private teams only their audience", async (t) => {
  const sockets = Object.fromEntries(
    ["member", "fan", "admin", "outsider"].map((id) => [id, connect(id)]),
  );
  t.after(() => Object.values(sockets).forEach((ws) => ws.disconnect()));

  await t.test("public team", async (t) => {
    stubTeamLookups(t, { isPrivate: false });
    await broadcastTeamEvent("team_updated", { id: "team1", name: "Team" }, "team1", null);
    assert.equal(eventsOf(sockets.outsider, "team_updated").length, 1);
  });

  for (const ws of Object.values(sockets)) ws.received.length = 0;

  await t.test("private team", async (t) => {
    stubTeamLookups(t, { isPrivate: true }, { members: ["member"], favoriters: ["fan"], admins: ["admin"] });
    await broadcastTeamEvent("team_updated", { id: "team1", name: "Team" }, "team1", null);
    for (const id of ["member", "fan", "admin"]) {
      assert.equal(eventsOf(sockets[id], "team_updated").length, 1, `${id} should receive it`);
    }
    assert.equal(eventsOf(sockets.outsider, "team_updated").length, 0);
  });
});
