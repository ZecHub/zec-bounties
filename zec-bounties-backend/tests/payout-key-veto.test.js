// Who may veto (revoke) another approver's still-pending payout passkey.
// Anyone can create a team and become its OWNER, which makes them a payout approver.
// That must let them vet their own team's approvers, not the global admins whose
// keys approve platform payouts.
const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const stub = (relative, exports) => {
  const file = require.resolve(path.join("..", relative));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};

// ─── In-memory stand-ins for the route's collaborators ─────────────────────

let users;
let members;
let keys;

const matches = (row, where = {}) =>
  Object.entries(where).every(([key, cond]) => {
    if (cond && typeof cond === "object") {
      if ("in" in cond) return cond.in.includes(row[key]);
      if ("gt" in cond) return row[key] > cond.gt;
    }
    return row[key] === cond;
  });

const userById = (id) => users.find((u) => u.id === id);

const prisma = {
  user: {
    findMany: async ({ where }) =>
      users.filter((u) => matches(u, where)).map((u) => ({ ...u })),
  },
  teamMember: {
    findFirst: async ({ where }) =>
      members.find((m) => matches(m, where)) || null,
    findMany: async ({ where }) => members.filter((m) => matches(m, where)),
  },
  approverKey: {
    findMany: async ({ where, include }) =>
      keys
        .filter((k) => matches(k, where))
        .map((k) => ({ ...k, ...(include?.user && { user: userById(k.userId) }) })),
    findUnique: async ({ where, include }) => {
      const k = keys.find((x) => x.id === where.id);
      return k ? { ...k, ...(include?.user && { user: userById(k.userId) }) } : null;
    },
    update: async ({ where, data }) =>
      Object.assign(keys.find((k) => k.id === where.id), data),
  },
  $transaction: async (fn) => fn(prisma),
};

stub("prisma/client.js", prisma);
stub("middleware/auth.js", {
  authenticate: (req, res, next) => {
    req.user = userById(req.headers["x-user"]);
    next();
  },
});
stub("utils/payoutAudit.js", { appendAudit: async () => {} });
stub("utils/bountyHelpers.js", {
  sendMailIfEnabled: async () => {},
  sendPushToOptedIn: async () => {},
});

const express = require("express");
const router = require("../routes/payoutKeys.routes");

// ─── Harness ───────────────────────────────────────────────────────────────

let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/payout-keys", router);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  console.error = () => {};
});

after(() => server.close());

beforeEach(() => {
  const soon = new Date(Date.now() + 72 * 3600 * 1000);
  users = [
    { id: "admin1", role: "ADMIN", name: "Admin One" },
    { id: "admin2", role: "ADMIN", name: "Admin Two" },
    { id: "owner1", role: "USER", name: "Team owner" },
    { id: "tadmin1", role: "USER", name: "Team admin" },
    { id: "mallory", role: "USER", name: "Fresh account" },
  ];
  members = [
    { teamId: "t1", userId: "owner1", role: "OWNER" },
    { teamId: "t1", userId: "tadmin1", role: "ADMIN" },
    // a team made a minute ago with POST /api/teams, which any user can call
    { teamId: "t-new", userId: "mallory", role: "OWNER" },
  ];
  keys = [
    { id: "k-admin2", userId: "admin2", activatesAt: soon, revokedAt: null, createdAt: new Date() },
    { id: "k-tadmin1", userId: "tadmin1", activatesAt: soon, revokedAt: null, createdAt: new Date() },
  ];
});

const call = async (method, url, user) => {
  const res = await fetch(`${baseUrl}/api/payout-keys${url}`, {
    method,
    headers: { "x-user": user },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const revoked = (id) => keys.find((k) => k.id === id).revokedAt !== null;

describe("vetoing a pending payout passkey", () => {
  it("a new team's owner can't revoke a global admin's pending key", async () => {
    const res = await call("DELETE", "/k-admin2", "mallory");
    assert.equal(res.status, 403);
    assert.equal(revoked("k-admin2"), false);
  });

  it("a new team's owner isn't offered global admins' pending keys", async () => {
    const res = await call("GET", "/", "mallory");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.pending.map((k) => k.id), []);
  });

  it("a global admin can still revoke another admin's pending key", async () => {
    const res = await call("DELETE", "/k-admin2", "admin1");
    assert.equal(res.status, 200);
    assert.equal(revoked("k-admin2"), true);
  });

  it("a team owner can still revoke their own team admin's pending key", async () => {
    const listed = await call("GET", "/", "owner1");
    assert.deepEqual(listed.body.pending.map((k) => k.id), ["k-tadmin1"]);
    const res = await call("DELETE", "/k-tadmin1", "owner1");
    assert.equal(res.status, 200);
    assert.equal(revoked("k-tadmin1"), true);
  });
});
