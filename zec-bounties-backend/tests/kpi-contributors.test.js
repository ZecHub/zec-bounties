const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Run the registered handler; only Express registration and the database are
// replaced. Nullable assignees are valid in the Prisma Bounty model.
async function contributors(rows, chain = "MAIN") {
  const routes = new Map();
  const router = {
    get(route, ...handlers) { routes.set(route, handlers.at(-1)); },
    patch() {},
  };
  let query;
  const db = { bounty: { findMany: async (args) => { query = args; return rows; } } };
  const dependencies = {
    express: { Router: () => router },
    "@prisma/client": { PrismaClient: function () { return db; } },
    "../middleware/auth": { authenticate() {}, isAdmin() {} },
    "../utils/cache": { delCache() {} },
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
  await routes.get("/contributors-over-time")(
    { query: { chain }, user: { role: "ADMIN" } },
    { json(value) { body = JSON.parse(JSON.stringify(value)); } },
  );
  return { body, query };
}
const bounty = (assignee, month) => ({ assignee, completedAt: `${month}-15T12:00:00Z` });

test("unassigned completed work does not invent a contributor", async () => {
  const { body } = await contributors([bounty("alice", "2026-09"), bounty(null, "2026-09")]);
  assert.deepEqual(body, [{ month: "2026-09", cumulativeContributors: 1 }]);
});

test("months containing only unassigned work retain the actual cumulative count", async () => {
  const { body } = await contributors([
    bounty(null, "2026-08"), bounty("alice", "2026-09"),
    bounty(null, "2026-10"), bounty("alice", "2026-10"), bounty("bob", "2026-11"),
  ]);
  assert.deepEqual(body, [
    { month: "2026-08", cumulativeContributors: 0 },
    { month: "2026-09", cumulativeContributors: 1 },
    { month: "2026-10", cumulativeContributors: 1 },
    { month: "2026-11", cumulativeContributors: 2 },
  ]);
});

test("repeat completions count each person once, including across months", async () => {
  const { body } = await contributors([
    bounty("alice", "2026-09"), bounty("alice", "2026-09"),
    bounty("alice", "2026-10"), bounty("bob", "2026-10"),
  ]);
  assert.deepEqual(body, [
    { month: "2026-09", cumulativeContributors: 1 },
    { month: "2026-10", cumulativeContributors: 2 },
  ]);
});

test("empty data stays empty and chain selection is retained", async () => {
  for (const [chain, expected] of [["MAIN", "MAIN"], ["TEST", "TEST"], ["ALL", undefined]]) {
    const { body, query } = await contributors([], chain);
    assert.deepEqual(body, []);
    assert.equal(query.where.chain, expected);
    assert.equal(query.where.status, "DONE");
    assert.equal(query.where.completedAt.not, null);
  }
});
