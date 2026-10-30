const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Each member of a team holds an own ZcashParams copy of the team wallet
// (ownerId, accountName, teamId). Setting a team wallet as default must flip
// the caller's copy, never another member's.
function harness(rows) {
  const matches = (row, where) => Object.entries(where).every(([k, v]) => row[k] === v);
  const db = {
    zcashParams: {
      findFirst: async ({ where }) => rows.find(r => matches(r, where)) ?? null,
      update: async ({ where, data }) => Object.assign(rows.find(r => r.id === where.id), data),
    },
  };
  db.$transaction = async fn => fn(db);
  let handlers;
  const router = Object.fromEntries(["get", "post", "put", "patch", "delete", "use"].map(method => [method,
    (url, ...h) => { if (method === "patch" && url === "/params/:accountName/set-default") handlers = h; },
  ]));
  const file = path.join(__dirname, "../routes/zcash.js");
  const module = { exports: {} };
  const unused = () => { throw new Error("unexpected side effect"); };
  const deps = {
    express: { Router: () => router }, axios: {}, bcrypt: {}, jsonwebtoken: {},
    "../prisma/client": db,
    "../middleware/auth": { authenticate() {}, isAdmin() {} },
    "../zcash/init": { initZcashOnce: unused },
    "../utils/zingo/zingoLibSeed": unused,
    "../helpers/zcash/zcashHelper.js": { getWalletDataDir: unused, getDefaultZcashParams: unused },
    "../utils/zingo/zingoLibInfo": unused,
    "../helpers/zcash/walletConnection": {},
    "../middleware/websocket": { sendToUser() {}, sendRealtimeUpdate() {} },
    fs: { promises: {} }, path,
    "../utils/zingo/getZingo": { invalidateZingo: unused },
  };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), {
    module, exports: module.exports, console: { log() {}, error() {} }, process,
    require(name) { if (Object.hasOwn(deps, name)) return deps[name]; throw new Error(`Unexpected dependency: ${name}`); },
  }, { filename: file });
  const route = handlers[handlers.length - 1];
  return async (userId, accountName, body) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
    await route({ params: { accountName }, body, user: { id: userId, role: "ADMIN" } }, res);
    return res;
  };
}

test("setting a team wallet as default flips the caller's own copy, not another member's", async () => {
  const rows = [
    // the owner's copy was created first, so an unscoped lookup finds it first
    { id: "owner-copy", ownerId: "owner", accountName: "Treasury", teamId: "t1", isDefault: true },
    { id: "admin-personal", ownerId: "admin", accountName: "Main", teamId: null, isDefault: true },
    { id: "admin-copy", ownerId: "admin", accountName: "Treasury", teamId: "t1", isDefault: false },
  ];
  const setDefault = harness(rows);
  const res = await setDefault("admin", "Treasury", { teamId: "t1" });
  assert.equal(res.statusCode, 200);
  const by = Object.fromEntries(rows.map(r => [r.id, r.isDefault]));
  assert.deepEqual(by, { "owner-copy": true, "admin-personal": false, "admin-copy": true });
  assert.equal(res.body.data.id, "admin-copy");
});

test("a team wallet the caller holds no copy of is not found", async () => {
  const rows = [{ id: "owner-copy", ownerId: "owner", accountName: "Treasury", teamId: "t1", isDefault: true }];
  const setDefault = harness(rows);
  const res = await setDefault("admin", "Treasury", { teamId: "t1" });
  assert.equal(res.statusCode, 404);
  assert.equal(rows[0].isDefault, true);
});
