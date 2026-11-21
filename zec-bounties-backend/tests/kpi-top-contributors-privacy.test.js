const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Runs the real GET /top-contributors handler. Only Express registration and
// the database are replaced; utils/privacy is the real module.
async function topContributors(rows, user) {
  const routes = new Map();
  const router = {
    get(route, ...handlers) { routes.set(route, handlers.at(-1)); },
    patch() {},
  };
  const db = { bounty: { findMany: async () => rows }, user: { findMany: async () => [] } };
  const dependencies = {
    express: { Router: () => router },
    "@prisma/client": { PrismaClient: function () { return db; } },
    "../middleware/auth": { authenticate() {}, isAdmin() {} },
    "../utils/cache": { delCache() {} },
    "../utils/privacy": require("../utils/privacy"),
  };
  const filename = path.join(__dirname, "../routes/kpis.js");
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module: { exports: {} }, console, Date,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`);
      return dependencies[name];
    },
  }, { filename });
  let body;
  await routes.get("/top-contributors")(
    { query: {}, user },
    { json(value) { body = JSON.parse(JSON.stringify(value)); }, status() { return this; } },
  );
  return body;
}

const hidden = {
  id: "hidden-hunter",
  name: "Jane Realname",
  nickname: "janer",
  avatar: "https://avatars.example/jane.png",
  UA_address: "u1secret",
  z_address: null,
  role: "HUNTER",
  badges: [],
  // Opted out of name and avatar; completed count is off by default.
  profileVisibility: { showDisplayName: false, showAvatar: false },
};
const rows = [
  { assignee: hidden.id, status: "DONE", bountyAmount: 2, completedAt: "2026-10-01T00:00:00Z", assigneeUser: hidden },
  { assignee: hidden.id, status: "IN_REVIEW", bountyAmount: 1, completedAt: null, assigneeUser: hidden },
];
const viewer = { id: "someone-else", role: "HUNTER" };

test("a non-admin does not get the name or nickname of a user who hid their display name", async () => {
  const [row] = await topContributors(rows, viewer);
  assert.equal(row.id, hidden.id);
  assert.notEqual(row.name, "Jane Realname");
  assert.equal(row.nickname, null);
});

test("a non-admin does not get the avatar of a user who hid their avatar", async () => {
  const [row] = await topContributors(rows, viewer);
  assert.equal(row.avatar, null);
});

test("a non-admin does not get completed/submitted counts unless showCompleted is on", async () => {
  const [row] = await topContributors(rows, viewer);
  assert.equal(row.completed, null);
  assert.equal(row.submitted, null);
  assert.equal(row.cancelled, null);
});

test("users who allow it are still shown in full, and admins always see the full row", async () => {
  const open = {
    ...hidden,
    id: "open-hunter",
    profileVisibility: { showDisplayName: true, showAvatar: true, showCompleted: true },
  };
  const openRows = rows.map((r) => ({ ...r, assignee: open.id, assigneeUser: open }));
  const [pub] = await topContributors(openRows, viewer);
  assert.equal(pub.name, "Jane Realname");
  assert.equal(pub.nickname, "janer");
  assert.equal(pub.avatar, hidden.avatar);
  assert.equal(pub.completed, 1);
  assert.equal(pub.submitted, 2);
  assert.equal(pub.UA_address, undefined);

  const [adm] = await topContributors(rows, { id: "admin", role: "ADMIN" });
  assert.equal(adm.name, "Jane Realname");
  assert.equal(adm.avatar, hidden.avatar);
  assert.equal(adm.completed, 1);
  assert.equal(adm.UA_address, "u1secret");
});
