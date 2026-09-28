const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load(relativePath, dependencies) {
  const filename = path.join(__dirname, "../..", relativePath);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    exports: module.exports,
    require(name) {
      const key = name.replace(/\.js$/, "");
      if (Object.hasOwn(dependencies, key)) return dependencies[key];
      throw new Error(`Unexpected dependency: ${name}`);
    },
    process: { env: { NODE_ENV: "production" } },
    console: { log() {}, error() {} },
    setTimeout,
  }, { filename });
  return module.exports;
}

// Real cache code and route handlers over isolated in-memory collaborators.
// Cache values use Redis's serialized representation; TTL expiry is not
// simulated because the regressions exercise reads immediately after writes.
function createPaymentCacheHarness() {
  const values = new Map();
  const redisClient = {
    get: async key => values.get(key) ?? null,
    setEx: async (key, _ttl, value) => values.set(key, value),
    del: async (...keys) => keys.forEach(key => values.delete(key)),
    incr: async key => {
      const next = Number(values.get(key) ?? 0) + 1;
      values.set(key, String(next));
      return next;
    },
    async *scanIterator({ MATCH }) {
      yield [...values.keys()].filter(key => key.startsWith(MATCH.replace(/\*$/, "")));
    },
  };
  const cache = load("utils/cache.js", { "../config/redis": { redisClient } });
  const bounty = {
    id: "b1", title: "Completed work", description: "Fixture", bountyAmount: 1,
    createdBy: "owner", assignee: "hunter", chain: "MAIN", teamId: "team1",
    status: "DONE", isApproved: true, isPrivate: false, isPaid: false,
    paymentAuthorized: false, paymentScheduled: null, exportedAt: null,
    assigneeUser: { id: "hunter", name: "Hunter", z_address: "zsfixture" },
    createdByUser: { id: "owner", name: "Owner", role: "ADMIN" },
    assignees: [],
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  let listReadGate = null;
  const db = {
    bounty: {
      findUnique: async () => clone(bounty),
      findMany: async () => {
        const snapshot = [clone(bounty)];
        if (listReadGate) {
          const gate = listReadGate;
          listReadGate = null;
          gate.started();
          await gate.wait;
        }
        return snapshot;
      },
      update: async ({ data }) => { Object.assign(bounty, data); return clone(bounty); },
      count: async ({ where = {} }) => Object.entries(where).every(([key, value]) =>
        value && typeof value === "object" ? true : bounty[key] === value) ? 1 : 0,
      aggregate: async () => ({ _sum: { bountyAmount: 1 }, _count: { id: 1 } }),
      groupBy: async () => [{ status: bounty.status, _count: { id: 1 } }],
    },
  };
  const noOp = async () => {};
  const forbidden = async () => { throw new Error("Unexpected outbound operation"); };
  const helpers = load("utils/bountyHelpers.js", {
    "../prisma/client": db, "./cache": cache,
    "./sendMail": forbidden, "./notifyUser": forbidden,
  });
  const dependencies = {
    "../prisma/client": db,
    "../middleware/auth": { authenticate: noOp, isAdmin: noOp, optionalAuthenticate: noOp },
    "../middleware/websocket": { sendRealtimeUpdate() {}, sendToUser() {} },
    "../utils/cache": cache,
    "../utils/bountyHelpers": helpers,
    "../utils/userSelects": require("../../utils/userSelects"),
    "../utils/userIdentity": require("../../utils/userIdentity"),
    "../helpers/email": {}, "../helpers/validateBounty": {},
    "../utils/sendMail": forbidden, "../utils/notifyUser": forbidden,
    "../utils/discord/discordNotify": {}, "../utils/discord/discordAssignWebhook": {},
    "../utils/constants": {}, "../helpers/db-query": {},
    "../zcash/init": {}, "../helpers/zcash/zcashHelper": {},
    "../helpers/zcash/resolvePayingWallet": {},
    axios: { post: forbidden }, crypto: require("node:crypto"), path,
  };
  for (const name of ["", "QuickSend", "Transactions", "CheckBalance", "Addresses", "ParseAddress", "Sync", "Rescan", "RecoveryInfo", "Quit", "Balance", "Info"]) {
    dependencies[`../utils/zingo/zingoLib${name}`] = forbidden;
  }
  const routes = new Map();
  for (const file of ["bounties", "transactions"]) {
    const router = Object.fromEntries(["get", "post", "put", "patch", "delete"].map(method => [method,
      (url, ...callbacks) => routes.set(`${file}:${method}:${url}`, callbacks.at(-1)),
    ]));
    load(`routes/${file}.js`, { ...dependencies, express: { Router: () => router } });
  }
  return {
    db, bounty, cache, values,
    pauseNextListRead() {
      let started, resume;
      const reached = new Promise(resolve => { started = resolve; });
      const wait = new Promise(resolve => { resume = resolve; });
      listReadGate = { started, wait };
      return { reached, resume };
    },
    async request(file, method, url, body = {}, user = { id: "admin", role: "ADMIN" }) {
      const req = { user, params: { id: bounty.id }, query: {}, body };
      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
      };
      await routes.get(`${file}:${method}:${url}`)(req, res);
      return res;
    },
  };
}

module.exports = { createPaymentCacheHarness };
