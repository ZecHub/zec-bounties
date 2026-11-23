// Regression tests for GET /api/bounties/export-all:
// 1. Full ISO timestamps in `to` must parse to a valid Date (not Invalid Date -> 500),
//    while date-only YYYY-MM-DD strings still expand to end-of-day UTC.
// 2. Filtering by `assignee` must match both the scalar `bounty.assignee` column
//    and the multi-assignee `bounty.assignees` join table.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const anything = new Proxy(function () {}, {
  get: (_, key) => (key === "then" ? undefined : anything),
  apply: () => anything,
  construct: () => anything,
});

function matchesWhere(row, where = {}) {
  for (const [key, cond] of Object.entries(where)) {
    if (key === "OR") {
      if (!cond.some((branch) => matchesWhere(row, branch))) return false;
      continue;
    }
    if (key === "assignees" && cond?.some?.userId !== undefined) {
      const list = row.assignees || [];
      if (!list.some((a) => a.userId === cond.some.userId)) return false;
      continue;
    }
    if (cond && typeof cond === "object" && ("gte" in cond || "lte" in cond)) {
      const val = row[key] ? new Date(row[key]).getTime() : NaN;
      if (Number.isNaN(val)) return false;
      if ("gte" in cond) {
        if (!(cond.gte instanceof Date) || Number.isNaN(cond.gte.getTime())) {
          throw new Error(`Invalid gte date: ${cond.gte}`);
        }
        if (val < cond.gte.getTime()) return false;
      }
      if ("lte" in cond) {
        if (!(cond.lte instanceof Date) || Number.isNaN(cond.lte.getTime())) {
          throw new Error(`Invalid lte date: ${cond.lte}`);
        }
        if (val > cond.lte.getTime()) return false;
      }
      continue;
    }
    if (row[key] !== cond) return false;
  }
  return true;
}

function loadExportAll(rows = []) {
  const queries = [];
  const db = {
    bounty: {
      findMany: async (args) => {
        queries.push(args);
        return rows.filter((row) => matchesWhere(row, args.where));
      },
    },
  };
  const routes = {};
  const dependencies = {
    express: {
      Router: () =>
        new Proxy(
          {},
          {
            get:
              (_, method) =>
              (url, ...handlers) => {
                routes[`${method} ${url}`] = handlers;
              },
          },
        ),
    },
    "../prisma/client": db,
    "../utils/userSelects": require("../utils/userSelects"),
  };
  const filename = path.join(__dirname, "../routes/bounties.js");
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(filename, "utf8"),
    {
      module,
      exports: module.exports,
      require: (name) =>
        Object.hasOwn(dependencies, name) ? dependencies[name] : anything,
      console: { log() {}, error() {} },
      process: { env: {} },
      Date,
    },
    { filename },
  );

  return {
    queries,
    async call(query = {}) {
      const res = {
        statusCode: 200,
        body: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.body = payload;
          return this;
        },
      };
      await routes["get /export-all"].at(-1)(
        { query, user: { id: "admin-1", role: "ADMIN" } },
        res,
      );
      return res;
    },
  };
}

const sampleRows = [
  {
    id: "b-primary",
    status: "DONE",
    chain: "MAIN",
    assignee: "user-1",
    assignees: [{ userId: "user-1" }],
    dateCreated: "2026-11-10T10:00:00.000Z",
    paidAt: "2026-11-15T12:00:00.000Z",
  },
  {
    id: "b-multi",
    status: "IN_PROGRESS",
    chain: "MAIN",
    assignee: "user-1",
    assignees: [{ userId: "user-1" }, { userId: "user-2" }],
    dateCreated: "2026-11-23T12:00:00.000Z",
    paidAt: null,
  },
  {
    id: "b-late",
    status: "TO_DO",
    chain: "MAIN",
    assignee: "user-3",
    assignees: [{ userId: "user-3" }],
    dateCreated: "2026-11-23T18:00:00.000Z",
    paidAt: null,
  },
];

test("export-all accepts full ISO timestamps for `to` without producing Invalid Date", async () => {
  const h = loadExportAll(sampleRows);
  const res = await h.call({
    from: "2026-11-23T00:00:00.000Z",
    to: "2026-11-23T12:30:00.000Z",
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(
    res.body.data.map((b) => b.id),
    ["b-multi"],
  );
  assert.equal(res.body.total, 1);
  assert.equal(
    h.queries[0].where.dateCreated.lte.toISOString(),
    "2026-11-23T12:30:00.000Z",
  );
});

test("export-all accepts ISO timestamps with timezone offsets for `to`", async () => {
  const h = loadExportAll(sampleRows);
  const res = await h.call({ to: "2026-11-23T14:30:00+02:00" });
  assert.equal(res.statusCode, 200);
  assert.equal(
    h.queries[0].where.dateCreated.lte.toISOString(),
    "2026-11-23T12:30:00.000Z",
  );
  assert.deepEqual(
    res.body.data.map((b) => b.id),
    ["b-primary", "b-multi"],
  );
});

test("export-all keeps date-only YYYY-MM-DD `to` values inclusive through 23:59:59.999Z", async () => {
  const h = loadExportAll(sampleRows);
  const res = await h.call({ from: "2026-11-23", to: "2026-11-23" });
  assert.equal(res.statusCode, 200);
  assert.equal(
    h.queries[0].where.dateCreated.gte.toISOString(),
    "2026-11-23T00:00:00.000Z",
  );
  assert.equal(
    h.queries[0].where.dateCreated.lte.toISOString(),
    "2026-11-23T23:59:59.999Z",
  );
  assert.deepEqual(
    res.body.data.map((b) => b.id),
    ["b-multi", "b-late"],
  );
});

test("export-all rejects invalid or repeated date query params with 400", async () => {
  for (const query of [
    { to: "not-a-date" },
    { from: "not-a-date" },
    { to: ["2026-11-01", "2026-11-23"] },
    { from: ["2026-11-01", "2026-11-23"] },
  ]) {
    const h = loadExportAll(sampleRows);
    const res = await h.call(query);
    assert.equal(res.statusCode, 400);
    assert.equal(h.queries.length, 0);
  }
});

test("export-all assignee filter matches both scalar assignee and multi-assignee join rows", async () => {
  const h = loadExportAll(sampleRows);
  const res = await h.call({ assignee: "user-2" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(h.queries[0].where.OR)), [
    { assignee: "user-2" },
    { assignees: { some: { userId: "user-2" } } },
  ]);
  assert.deepEqual(
    res.body.data.map((b) => b.id),
    ["b-multi"],
  );
  assert.equal(res.body.total, 1);
});

test("export-all combines assignee filter with status, chain, and date range", async () => {
  const h = loadExportAll(sampleRows);
  const res = await h.call({
    assignee: "user-1",
    status: "DONE",
    chain: "MAIN",
    dateField: "paidAt",
    from: "2026-11-01T00:00:00.000Z",
    to: "2026-11-20T00:00:00.000Z",
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(
    res.body.data.map((b) => b.id),
    ["b-primary"],
  );
});
