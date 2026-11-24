const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Load the real chat route with an in-memory chat table. No server, database,
// Redis or websocket is used.
function fixture(messages, bounty = { id: "bounty", status: "IN_PROGRESS", assignee: "hunter", assignees: [] }) {
  const routes = new Map();
  const router = Object.fromEntries(["get", "post"].map((method) => [
    method, (route, ...handlers) => routes.set(method + " " + route, handlers.at(-1)),
  ]));
  const newestFirst = (a, b) => b.createdAt - a.createdAt || (b.id < a.id ? -1 : b.id > a.id ? 1 : 0);
  const matches = (row, where) => {
    if (row.bountyId !== where.bountyId) return false;
    if (where.id !== undefined && row.id !== where.id) return false;
    if (!where.OR) return true;
    return where.OR.some((clause) =>
      (clause.createdAt?.lt && row.createdAt < clause.createdAt.lt) ||
      (clause.createdAt instanceof Date && row.createdAt.getTime() === clause.createdAt.getTime() &&
        clause.id?.lt !== undefined && row.id < clause.id.lt));
  };
  const prisma = {
    bounty: { findUnique: async () => ({ ...bounty }) },
    bountyChat: {
      findFirst: async ({ where }) => messages.find((row) => matches(row, where)) ?? null,
      findMany: async ({ where, take }) =>
        messages.filter((row) => matches(row, where)).sort(newestFirst).slice(0, take),
    },
  };
  const modules = {
    express: { Router: () => router },
    "../prisma/client": prisma,
    "../middleware/auth": { authenticate: () => {} },
    "../middleware/websocket": { sendToUser: () => {} },
    "../helpers/bountyChatValidation": require("../helpers/bountyChatValidation"),
  };
  const file = path.join(__dirname, "../routes/bountyChat.js");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), {
    module, exports: module.exports, console, Set, Map, Date, Array, Object, Promise, JSON,
    require: (name) => {
      if (!(name in modules)) throw new Error("unexpected require: " + name);
      return modules[name];
    },
  }, { filename: file });
  const get = routes.get("get /:bountyId/chat");
  return async (user, query = {}) => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await get({ params: { bountyId: bounty.id }, query, user }, res);
    return res;
  };
}

function chat(count, bountyId = "bounty", sameTime = false) {
  return Array.from({ length: count }, (_, i) => ({
    id: "m" + String(i + 1).padStart(3, "0"),
    bountyId,
    content: "message " + (i + 1),
    createdAt: new Date(Date.UTC(2026, 9, 1, 0, sameTime ? 0 : i)),
  }));
}

const hunter = { id: "hunter", role: "HUNTER" };
const ids = (res) => res.body.messages.map((m) => m.id);

test("chat returns the newest 30 messages oldest first and says older ones exist", async () => {
  const res = await fixture(chat(35))(hunter);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.messages.length, 30);
  assert.equal(ids(res)[0], "m006");
  assert.equal(ids(res).at(-1), "m035");
  assert.equal(res.body.hasMore, true);
});

test("a short chat says there is nothing older", async () => {
  const res = await fixture(chat(3))(hunter);
  assert.deepEqual(ids(res), ["m001", "m002", "m003"]);
  assert.equal(res.body.hasMore, false);
});

test("before= loads the messages older than the given one, oldest first", async () => {
  const get = fixture(chat(65));
  const first = await get(hunter);
  assert.equal(ids(first)[0], "m036");
  const older = await get(hunter, { before: "m036" });
  assert.equal(older.statusCode, 200);
  assert.equal(ids(older)[0], "m006");
  assert.equal(ids(older).at(-1), "m035");
  assert.equal(older.body.hasMore, true);
  const oldest = await get(hunter, { before: "m006" });
  assert.deepEqual(ids(oldest), ["m001", "m002", "m003", "m004", "m005"]);
  assert.equal(oldest.body.hasMore, false);
});

test("messages sent in the same instant are neither skipped nor repeated across pages", async () => {
  const get = fixture(chat(40, "bounty", true));
  const first = await get(hunter);
  const older = await get(hunter, { before: ids(first)[0] });
  const all = [...ids(older), ...ids(first)];
  assert.equal(all.length, 40);
  assert.equal(new Set(all).size, 40);
});

test("a cursor from another bounty or an unknown id is refused", async () => {
  const messages = [...chat(5), ...chat(5, "other-bounty").map((m) => ({ ...m, id: "x" + m.id }))];
  const get = fixture(messages);
  const foreign = await get(hunter, { before: "xm003" });
  assert.equal(foreign.statusCode, 400);
  const unknown = await get(hunter, { before: "nope" });
  assert.equal(unknown.statusCode, 400);
});

test("the cursor does not widen access: an outsider still gets 403", async () => {
  const res = await fixture(chat(5))({ id: "outsider", role: "HUNTER" }, { before: "m003" });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.messages, undefined);
});
