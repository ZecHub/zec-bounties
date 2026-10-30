const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { once } = require("node:events");
const jwt = require("jsonwebtoken");
const WebSocket = require("ws");

// Boot the real server.js on a free port so the JWT check on the upgrade is
// exercised as deployed. Mail, push and Redis are stubbed before loading.
for (const [mod, exports] of [
  ["../utils/sendMail", async () => {}],
  ["../utils/notifyUser", async () => {}],
  ["../config/redis", { connectRedis: async () => {}, redisClient: {} }],
]) {
  const file = require.resolve(path.join(__dirname, mod));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}
process.env.PORT = "0";
process.env.DEADLINE_REMINDERS_ENABLED = "false";
process.env.JWT_SECRET ||= "websocket-handshake-test";

const prisma = require("../prisma/client");
const { sendToUser } = require("../middleware/websocket");

let server;
const createServer = http.createServer;
http.createServer = (...args) => (server = createServer(...args));
require("../server");
http.createServer = createServer;

prisma.user.findUnique = async ({ where }) =>
  where.id === "alice" ? { id: "alice", name: "Alice" } : null;

const sockets = [];
test.before(async () => {
  if (!server.listening) await once(server, "listening");
});
test.after(() => {
  sockets.forEach((ws) => ws.terminate());
  server.close();
});

// Resolves with the socket once the server has welcomed it, or with the
// handshake error if the upgrade was refused.
function openTab(token) {
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/${query}`);
  sockets.push(ws);
  return new Promise((resolve) => {
    ws.once("error", resolve);
    ws.once("message", () => resolve(ws));
  });
}

// The next message of this type on a tab, or undefined if none arrives.
function nextOfType(ws, type) {
  return new Promise((resolve) => {
    setTimeout(resolve, 1000);
    ws.on("message", (data) => {
      const message = JSON.parse(data);
      if (message.type === type) resolve(message);
    });
  });
}

const tokenFor = (id, options = { expiresIn: "1h" }) =>
  jwt.sign({ id }, process.env.JWT_SECRET, options);

test("sockets without a valid, unexpired token are still refused", { timeout: 5000 }, async () => {
  for (const token of [
    null,
    tokenFor("alice", { expiresIn: -60 }),
    jwt.sign({ id: "alice" }, "some other secret"),
    tokenFor("nobody"),
  ]) {
    const result = await openTab(token);
    assert.match(String(result.message), /401/);
  }
});

test("a signed-in user's tabs all stay live until a sixth closes the oldest", { timeout: 5000 }, async () => {
  const tabs = [];
  for (let i = 0; i < 5; i++) tabs.push(await openTab(tokenFor("alice")));

  const delivered = tabs.map((ws) => nextOfType(ws, "notification_new"));
  sendToUser("alice", "notification_new", { bountyId: "b1" });
  for (const message of await Promise.all(delivered)) {
    assert.equal(message?.payload.bountyId, "b1", "every open tab gets the event");
  }

  const closed = once(tabs[0], "close");
  tabs.push(await openTab(tokenFor("alice")));
  const [code, reason] = await closed;
  assert.equal(code, 4001);
  assert.equal(String(reason), "Too many open connections");
  assert.ok(tabs.slice(1).every((ws) => ws.readyState === WebSocket.OPEN));
});

test("a socket is closed when its sign-in token expires", { timeout: 5000 }, async () => {
  const ws = await openTab(tokenFor("alice", { expiresIn: 2 }));
  const [code, reason] = await once(ws, "close");
  assert.equal(code, 4002);
  assert.equal(String(reason), "Session expired");
});
