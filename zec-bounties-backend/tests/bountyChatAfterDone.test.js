const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// A completed bounty keeps its chat: it stays readable and takes no new messages.
// Loads the real chat route with an in-memory table; no server or database.
function chatRoute(bounty, messages) {
  const routes = new Map();
  const router = Object.fromEntries(["get", "post"].map((method) => [
    method, (route, ...handlers) => routes.set(method + " " + route, handlers.at(-1)),
  ]));
  const created = [];
  const prisma = {
    bounty: { findUnique: async () => ({ ...bounty }) },
    user: { findMany: async () => [] },
    bountyChat: {
      findMany: async ({ take }) => [...messages].reverse().slice(0, take),
      create: async ({ data }) => { created.push(data); return data; },
    },
    $transaction: async (work) => work(prisma),
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
    require: (name) => modules[name],
  }, { filename: file });
  const call = async (method, user, body) => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; },
    };
    await routes.get(method + " /:bountyId/chat")({ params: { bountyId: bounty.id }, query: {}, body, user }, res);
    return res;
  };
  return { call, created };
}

const done = { id: "bounty", title: "Done bounty", status: "DONE", assignee: "hunter", assignees: [] };
const messages = [
  { id: "m1", bountyId: "bounty", content: "Please start here", createdAt: new Date(Date.UTC(2026, 9, 1)) },
  { id: "m2", bountyId: "bounty", content: "Submitted", createdAt: new Date(Date.UTC(2026, 9, 2)) },
];
const hunter = { id: "hunter", name: "Hunter", role: "HUNTER" };

test("a completed bounty's chat stays readable for its participants", async () => {
  const { call } = chatRoute(done, messages);
  const res = await call("get", hunter);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.messages.map((m) => m.id), ["m1", "m2"]);
});

test("a completed bounty's chat takes no new messages", async () => {
  const { call, created } = chatRoute(done, messages);
  const res = await call("post", hunter, { content: "one more thing" });
  assert.equal(res.statusCode, 410);
  assert.equal(created.length, 0);
});
