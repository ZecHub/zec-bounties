const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createPayoutKeysHarness({ colleagues = [], keys = [] } = {}) {
  const calls = { findMany: [], findFirst: [], notify: [] };

  const prisma = {
    approverKey: {
      findMany: async (arg) => {
        calls.findMany.push(arg);
        return [];
      },
      findUnique: async ({ where }) =>
        keys.find((k) => k.id === where.id) ?? null,
      update: async ({ where, data }) => {
        const key = keys.find((k) => k.id === where.id);
        return Object.assign(key, data);
      },
    },
    payoutChallenge: {
      findFirst: async (arg) => {
        calls.findFirst.push(arg);
        return null;
      },
      deleteMany: async () => ({ count: 0 }),
    },
    user: { findMany: async () => [] },
    $transaction: async (fn) => fn(prisma),
  };

  const routes = {};
  let errorHandler;
  const router = {
    get(p, ...h) {
      routes[`get ${p}`] = h;
    },
    post(p, ...h) {
      routes[`post ${p}`] = h;
    },
    delete(p, ...h) {
      routes[`delete ${p}`] = h;
    },
    use(fn) {
      errorHandler = fn;
    },
  };

  const dependencies = {
    express: { Router: () => router },
    "../prisma/client": prisma,
    "../middleware/auth": { authenticate() {} },
    "../utils/payoutAudit": { appendAudit: async () => {} },
    "../utils/payoutPasskeys": {
      registrationOptions: async () => ({ challenge: "c1" }),
      verifyRegistration: async () => {
        throw new Error("should not reach verifyRegistration");
      },
      KEY_DELAY_MS: 72 * 3600 * 1000,
    },
    "../utils/payoutProposals": {
      PAYOUT_THRESHOLD: 2,
      isApprover: async () => true,
      getColleagueApprovers: async () => colleagues,
      notifyApprovers: async (_db, ids, msg) => calls.notify.push({ ids, msg }),
    },
  };

  const filename = path.join(__dirname, "../routes/payoutKeys.routes.js");
  const mod = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(filename, "utf8"),
    {
      module: mod,
      exports: mod.exports,
      require(name) {
        if (Object.hasOwn(dependencies, name)) return dependencies[name];
        throw new Error(`Unexpected dependency: ${name}`);
      },
      console: { log() {}, error() {} },
      Buffer,
    },
    { filename },
  );

  async function invoke(key, { body, params = {}, user = { id: "admin1", role: "ADMIN", name: "Admin" } } = {}) {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
    const handler = routes[key].at(-1);
    await new Promise((resolve) => {
      handler({ user, body, params }, res, (err) => {
        if (err && errorHandler) {
          errorHandler(err, { user, body, params }, res, () => {});
        }
        resolve();
      });
      // Resolve on next microtask if handler responded directly without next(err)
      setImmediate(resolve);
    });
    return res;
  }

  return { calls, invoke };
}

test("POST /register/verify rejects missing/non-object body, blank challengeId, and non-object response", async () => {
  const h = createPayoutKeysHarness();

  for (const badBody of [
    undefined,
    null,
    [],
    "bad",
    { challengeId: "", response: { id: "cred" } },
    { challengeId: "   ", response: { id: "cred" } },
    { challengeId: "ch-1", response: true },
    { challengeId: "ch-1", response: 123 },
    { challengeId: "ch-1", response: ["not-an-object"] },
  ]) {
    const res = await h.invoke("post /register/verify", { body: badBody });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, "challengeId and response required");
  }

  assert.equal(h.calls.findFirst.length, 0);
});

test("POST /register/verify trims challengeId before querying payoutChallenge", async () => {
  const h = createPayoutKeysHarness();
  const res = await h.invoke("post /register/verify", {
    body: { challengeId: "  ch-42  ", response: { id: "cred-1" } },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, "Registration expired; try again");
  assert.equal(h.calls.findFirst.length, 1);
  assert.equal(h.calls.findFirst[0].where.id, "ch-42");
});

test("GET / short-circuits pending key lookup when approver has no vetoable colleagues", async () => {
  const h = createPayoutKeysHarness({ colleagues: [] });
  const res = await h.invoke("get /");
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(res.body)), {
    mine: [],
    pending: [],
  });
  // Only the `mine` query runs; no `{ in: [] }` pending query is issued
  assert.equal(h.calls.findMany.length, 1);
});

test("DELETE /:id rejects blank key id and skips notifyApprovers when no other colleagues exist", async () => {
  const keys = [
    {
      id: "k1",
      userId: "admin1",
      activatesAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user: { id: "admin1", name: "Admin", role: "ADMIN" },
    },
  ];
  const h = createPayoutKeysHarness({ colleagues: ["admin1"], keys });

  const blank = await h.invoke("delete /:id", { params: { id: "   " } });
  assert.equal(blank.statusCode, 400);
  assert.equal(blank.body.error, "Key id required");

  const ok = await h.invoke("delete /:id", { params: { id: " k1 " } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.success, true);
  assert.ok(Number.isFinite(new Date(keys[0].revokedAt).getTime()));
  assert.equal(h.calls.notify.length, 0);
});
