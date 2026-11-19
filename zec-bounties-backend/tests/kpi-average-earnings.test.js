const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Run the registered handler; only Express registration and the database are
// replaced. A bounty can be marked DONE with no assignee, so the database
// returns those rows too.
async function averageEarnings(rows, query = {}) {
  const routes = new Map();
  const router = {
    get(route, ...handlers) { routes.set(route, handlers.at(-1)); },
    patch() {},
  };
  const db = { bounty: { findMany: async () => rows } };
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
  await routes.get("/average-earnings-over-time")(
    { query, user: { role: "ADMIN" } },
    { json(value) { body = JSON.parse(JSON.stringify(value)); }, status() { return this; } },
  );
  return body;
}

const done = (assignee, bountyAmount, month) => ({
  assignee, bountyAmount, completedAt: `${month}-15T12:00:00Z`,
});

test("unassigned completed work is not an earner or earnings", async () => {
  const body = await averageEarnings([
    done("alice", 0.2, "2026-09"),
    done("bob", 0.4, "2026-09"),
    done(null, 1.0, "2026-09"),
  ]);
  assert.deepEqual(body, [
    { month: "2026-09", average: 0.3, median: 0.3, totalPaid: 0.6, uniqueEarners: 2 },
  ]);
});

test("a month with only unassigned work adds nothing to the earnings series", async () => {
  const body = await averageEarnings([
    done("alice", 0.1, "2026-08"),
    done(null, 0.5, "2026-09"),
    done("alice", 0.3, "2026-10"),
  ]);
  assert.deepEqual(body, [
    { month: "2026-08", average: 0.1, median: 0.1, totalPaid: 0.1, uniqueEarners: 1 },
    { month: "2026-10", average: 0.3, median: 0.3, totalPaid: 0.3, uniqueEarners: 1 },
  ]);
});

test("one earner with several bounties in a month is averaged once", async () => {
  const body = await averageEarnings([
    done("alice", 0.1, "2026-09"),
    done("alice", 0.3, "2026-09"),
    done("bob", 0.2, "2026-09"),
  ]);
  assert.deepEqual(body, [
    { month: "2026-09", average: 0.3, median: 0.2, totalPaid: 0.6, uniqueEarners: 2 },
  ]);
});

test("only unassigned work leaves the chart empty", async () => {
  assert.deepEqual(await averageEarnings([done(null, 1, "2026-09")]), []);
  assert.deepEqual(await averageEarnings([]), []);
});
