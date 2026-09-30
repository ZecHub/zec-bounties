// Actual roster-replacement route exercised against disposable PostgreSQL data.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const { test } = require("node:test");
const { setTimeout: pause } = require("node:timers/promises");
const backend = path.resolve(__dirname, "..");
const checkout = path.resolve(backend, "..");
// Opt in only with an explicitly configured disposable local test database.
// No runtime.json, .env, workspace-specific path or production configuration.
const configuredUrl = process.env.TEST_DATABASE_URL?.trim();
const schemaName = `assignee_replacement_${process.pid}`;
assert.match(schemaName, /^assignee_replacement_[0-9]+$/);
let dbUrl, observerUrl, observer;
if (configuredUrl) {
  const testUrl = new URL(configuredUrl);
  assert.ok(["127.0.0.1", "localhost"].includes(testUrl.hostname), "TEST_DATABASE_URL must target localhost");
  assert.match(testUrl.pathname, /(?:^|[_-])test(?:[_-]|$)/, "use a database explicitly named for disposable tests");
  testUrl.searchParams.set("schema", "public");
  observerUrl = testUrl.toString();
  testUrl.searchParams.set("schema", schemaName);
  dbUrl = testUrl.toString();
}
const prismaCli = path.join(backend, "node_modules/prisma/build/index.js");
const schemaPath = path.join(backend, "prisma/schema.prisma");
function cli(args) {
  return execFileSync(process.execPath, [prismaCli, ...args, "--schema", schemaPath], {
    cwd: checkout, env: { ...process.env, DATABASE_URL: dbUrl }, encoding: "utf8", timeout: 60000,
  });
}
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
function waitBounded(promise, label) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout: ${label}`)), 8000);
  })]).finally(() => clearTimeout(timer));
}
function wrapClient(client, hooks = {}) {
  return new Proxy(client, {
    get(target, key) {
      if (key === "$transaction") return (callback, options) => target.$transaction(async tx => {
        const [{ pid, isolation }] = await tx.$queryRawUnsafe("SELECT pg_backend_pid() AS pid, current_setting('transaction_isolation') AS isolation");
        hooks.started?.({ pid, isolation });
        const proxy = new Proxy(tx, {
          get(inner, prop) {
            if (prop === "bountyAssignee") return new Proxy(inner.bountyAssignee, {
              get(model, operation) {
                if (operation === "deleteMany") return async args => {
                  hooks.beforeDelete?.();
                  const result = await model.deleteMany(args);
                  await hooks.afterDelete?.(result);
                  return result;
                };
                const value = model[operation];
                return typeof value === "function" ? value.bind(model) : value;
              },
            });
            const value = inner[prop];
            return typeof value === "function" ? value.bind(inner) : value;
          },
        });
        return callback(proxy);
      }, { timeout: 15000, ...options });
      const value = target[key];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
function loadRoute(prisma) {
  const routes = new Map();
  const errors = [], broadcasts = [], background = new Set();
  const noOp = async () => {};
  const trackedPrisma = new Proxy(prisma, {
    get(target, key) {
      if (key === "user") return new Proxy(target.user, {
        get(model, operation) {
          const value = model[operation];
          if (operation === "findMany") return args => {
            const pending = Promise.resolve(value.call(model, args));
            background.add(pending);
            pending.finally(() => background.delete(pending));
            return pending;
          };
          return typeof value === "function" ? value.bind(model) : value;
        },
      });
      const value = target[key];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const cache = { getCache: noOp, setCache: noOp, delCache: noOp, deleteCacheByPattern: noOp, bumpVersion: noOp, getVersion: async () => 0, TTL: {} };
  function load(file, dependencies) {
    const module = { exports: {} }, filename = path.join(backend, file);
    vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
      module, exports: module.exports,
      require(name) { if (Object.hasOwn(dependencies, name)) return dependencies[name]; throw new Error(`Unexpected dependency ${name}`); },
      process: { env: { NODE_ENV: "test" } }, console: { log() {}, error(...args) { errors.push(args.map(String)); } }, setTimeout,
    }, { filename });
    return module.exports;
  }
  const helpers = load("utils/bountyHelpers.js", {
    "../prisma/client": trackedPrisma, "./cache": cache, "./sendMail": noOp, "./notifyUser": noOp,
  });
  const router = Object.fromEntries(["get", "post", "put", "patch", "delete"].map(method => [method,
    (url, ...callbacks) => routes.set(`${method} ${url}`, callbacks.at(-1)),
  ]));
  load("routes/bounties.js", {
    express: { Router: () => router }, "../prisma/client": trackedPrisma,
    "../helpers/email": {}, "../middleware/auth": { authenticate: noOp, isAdmin: noOp, optionalAuthenticate: noOp, signSessionToken: noOp },
    "../middleware/websocket": { sendRealtimeUpdate: (...args) => broadcasts.push(args) },
    "../utils/cache": cache, "../utils/sendMail": noOp, "../utils/notifyUser": noOp,
    "../utils/discord/discordNotify": { notifyNewBounty: noOp },
    "../utils/discord/discordAssignWebhook": { notifyAssignment: noOp },
    "../utils/constants": {}, "../helpers/validateBounty": {},
    "../utils/userIdentity": require(path.join(backend, "utils/userIdentity")),
    "../utils/userSelects": require(path.join(backend, "utils/userSelects")),
    "../utils/bountyHelpers": helpers,
  });
  const handler = routes.get("post /:id/assignees");
  assert.equal(typeof handler, "function");
  return {
    errors, broadcasts,
    async invoke(user, bountyId, userIds, { expectedError = false } = {}) {
      const req = { user, params: { id: bountyId }, body: { userIds, notifyUsers: false } };
      const res = { statusCode: 200, headersSent: false, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; this.headersSent = true; return this; } };
      await handler(req, res);
      await Promise.all([...background]);
      if (expectedError) {
        assert.equal(errors.length, 1, "the actual route must report the failed transaction");
      } else {
        assert.deepEqual(errors, [], "actual handler must not log fixture errors");
      }
      return res;
    },
  };
}
let PrismaClient, clients, setup;
async function seed(db, label) {
  const adminA = await db.user.create({ data: { name: `${label} administrator A`, role: "ADMIN" } });
  const adminB = await db.user.create({ data: { name: `${label} administrator B`, role: "ADMIN" } });
  const old = await db.user.create({ data: { name: `${label} old assigned contributor`, role: "HUNTER" } });
  const next = await db.user.create({ data: { name: `${label} next contributor`, role: "HUNTER" } });
  const other = await db.user.create({ data: { name: `${label} other contributor`, role: "HUNTER" } });
  const bounty = await db.bounty.create({ data: {
    title: `Disposable ${label}`, description: "Local lifecycle fixture only", bountyAmount: 1,
    timeToComplete: new Date("2030-01-01T00:00:00Z"), createdBy: adminA.id,
    status: "IN_REVIEW", isApproved: true, assignees: { create: { userId: old.id } },
    workSubmissions: { create: { submittedBy: old.id, description: "Existing work awaiting review", status: "pending" } },
  } });
  return { adminA, adminB, old, next, other, bounty };
}
async function snapshot(db, f) {
  const row = await db.bounty.findUnique({ where: { id: f.bounty.id }, include: { assignees: true, workSubmissions: true } });
  assert.equal(row.workSubmissions.length, 1);
  assert.equal(row.workSubmissions[0].submittedBy, f.old.id);
  assert.equal(row.workSubmissions[0].status, "pending");
  return { status: row.status, roster: row.assignees.map(a => a.userId).sort(), legacyAssignee: row.assignee, pending: 1 };
}
async function race(f, firstIds, secondIds, { initiallyEmpty = false } = {}) {
  const firstDeleted = deferred(), releaseFirst = deferred(), secondStarted = deferred();
  const pids = {}, isolations = {}, trace = [];
  let secondDeleted = false;
  const first = loadRoute(wrapClient(clients[0], {
    started({ pid, isolation }) { pids.first = pid; isolations.first = isolation; },
    async afterDelete(result) { trace.push({ op: "first delete finished", count: result.count }); firstDeleted.resolve(); await waitBounded(releaseFirst.promise, "first transaction release"); },
  }));
  const second = loadRoute(wrapClient(clients[1], {
    started({ pid, isolation }) { pids.second = pid; isolations.second = isolation; trace.push({ op: "second transaction started" }); secondStarted.resolve(); },
    beforeDelete() { trace.push({ op: "second delete started" }); },
    afterDelete(result) { secondDeleted = true; trace.push({ op: "second delete finished", count: result.count }); },
  }));
  const firstCall = first.invoke(f.adminA, f.bounty.id, firstIds);
  let secondCall;
  try {
    await waitBounded(firstDeleted.promise, "first real delete");
    secondCall = second.invoke(f.adminB, f.bounty.id, secondIds);
    await waitBounded(secondStarted.promise, "second transaction start");
    const deadline = Date.now() + 7000;
    let blocked = false;
    while (Date.now() < deadline) {
      const result = await observer.$queryRawUnsafe("SELECT pg_blocking_pids($1::integer) AS blockers", pids.second);
      if (result[0].blockers.includes(pids.first)) { blocked = true; break; }
      if (initiallyEmpty && secondDeleted) break;
      await pause(10);
    }
    assert.ok(blocked || (initiallyEmpty && secondDeleted), "the second actual transaction must wait on the first or complete its DELETE against an initially empty roster");
    trace.push({ op: blocked ? "PostgreSQL confirmed transaction wait" : "second actual DELETE completed before first release", pids });
  } finally { releaseFirst.resolve(); }
  const replies = await Promise.all([firstCall, secondCall]);
  assert.deepEqual(replies.map(r => r.statusCode), [200, 200]);
  return { replies: replies.map(r => ({ status: r.statusCode, roster: r.body.assignees.map(a => a.userId).sort() })), trace, isolations, final: await snapshot(clients[2], f) };
}
test("actual roster replacement route with isolated real PostgreSQL", { skip: !configuredUrl && "requires explicit TEST_DATABASE_URL for disposable local PostgreSQL" }, async t => {
  console.log(cli(["generate"]).trim());
  ({ PrismaClient } = require(path.join(backend, "node_modules/@prisma/client")));
  observer = new PrismaClient({ datasources: { db: { url: observerUrl } } });
  await observer.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
  try {
    console.log(cli(["db", "push", "--skip-generate"]).trim());
    clients = Array.from({ length: 3 }, () => new PrismaClient({ datasources: { db: { url: dbUrl } } }));
    setup = clients[2];
    const [{ version }] = await setup.$queryRawUnsafe("SELECT version() AS version");
    console.log(JSON.stringify({ environment: { version, prisma: require(path.join(backend, "node_modules/@prisma/client/package.json")).version, schema: schemaName } }));
    await t.test("control: clear then replace reactivates with exact desired roster", async () => {
      const f = await seed(setup, "sequential-clear-first"), route = loadRoute(setup);
      assert.equal((await route.invoke(f.adminA, f.bounty.id, [])).statusCode, 200);
      assert.equal((await route.invoke(f.adminB, f.bounty.id, [f.next.id])).statusCode, 200);
      assert.deepEqual(await snapshot(setup, f), { status: "IN_PROGRESS", roster: [f.next.id], legacyAssignee: null, pending: 1 });
    });
    await t.test("control: replace then clear cancels and empties roster", async () => {
      const f = await seed(setup, "sequential-replace-first"), route = loadRoute(setup);
      assert.equal((await route.invoke(f.adminA, f.bounty.id, [f.next.id])).statusCode, 200);
      assert.equal((await route.invoke(f.adminB, f.bounty.id, [])).statusCode, 200);
      assert.deepEqual(await snapshot(setup, f), { status: "CANCELLED", roster: [], legacyAssignee: null, pending: 1 });
    });
    await t.test("control: team OWNER authorization uses real membership row", async () => {
      const f = await seed(setup, "team-owner"), owner = await setup.user.create({ data: { name: "Disposable team owner", role: "TEAM" } });
      const team = await setup.team.create({ data: { name: `Disposable owner team ${process.pid}`, members: { create: { userId: owner.id, role: "OWNER" } } } });
      await setup.bounty.update({ where: { id: f.bounty.id }, data: { teamId: team.id } });
      assert.equal((await loadRoute(setup).invoke(owner, f.bounty.id, [f.next.id])).statusCode, 200);
      assert.deepEqual((await snapshot(setup, f)).roster, [f.next.id]);
    });
    await t.test("control: plain creator cannot administer roster", async () => {
      const f = await seed(setup, "non-admin");
      await setup.bounty.update({ where: { id: f.bounty.id }, data: { createdBy: f.old.id } });
      assert.equal((await loadRoute(setup).invoke(f.old, f.bounty.id, [])).statusCode, 403);
      assert.deepEqual(await snapshot(setup, f), { status: "IN_REVIEW", roster: [f.old.id], legacyAssignee: null, pending: 1 });
    });
    await t.test("control: a failed replacement rolls back its deletion", async () => {
      const f = await seed(setup, "rollback"), route = loadRoute(setup);
      const reply = await route.invoke(f.adminA, f.bounty.id, ["missing-test-user"], { expectedError: true });
      assert.equal(reply.statusCode, 500);
      assert.deepEqual(await snapshot(setup, f), { status: "IN_REVIEW", roster: [f.old.id], legacyAssignee: null, pending: 1 });
      assert.equal(route.broadcasts.length, 0, "a rolled-back roster must not be broadcast");
    });
    await t.test("regression: clearing roster races a replacement", async () => {
      const f = await seed(setup, "race-clear-first");
      const evidence = await race(f, [], [f.next.id]); console.log(JSON.stringify({ case: "clear-first", ...evidence }));
      const serial = [{ status: "CANCELLED", roster: [], legacyAssignee: null, pending: 1 }, { status: "IN_PROGRESS", roster: [f.next.id], legacyAssignee: null, pending: 1 }];
      assert.ok(serial.some(s => JSON.stringify(s) === JSON.stringify(evidence.final)), "final cancellation/roster must match a legitimate serial order");
    });
    await t.test("regression: reverse race replacement then clearing roster", async () => {
      const f = await seed(setup, "race-replace-first");
      const evidence = await race(f, [f.next.id], []); console.log(JSON.stringify({ case: "replace-first", ...evidence }));
      assert.deepEqual(evidence.final, { status: "CANCELLED", roster: [], legacyAssignee: null, pending: 1 }, "last clearing transaction must remove the newly committed roster");
    });
    await t.test("regression: two disjoint complete replacements cannot persist their union", async () => {
      const f = await seed(setup, "race-two-replacements");
      const evidence = await race(f, [f.next.id], [f.other.id]); console.log(JSON.stringify({ case: "two-replacements", ...evidence }));
      assert.ok(evidence.final.roster.length === 1 && [f.next.id, f.other.id].includes(evidence.final.roster[0]), "one complete requested roster must win; their union was never requested");
    });
    await t.test("regression: replacements of an initially empty roster remain complete", async () => {
      const f = await seed(setup, "race-empty-roster");
      await setup.bountyAssignee.deleteMany({ where: { bountyId: f.bounty.id } });
      await setup.bounty.update({ where: { id: f.bounty.id }, data: { status: "TO_DO" } });
      const evidence = await race(f, [f.next.id], [f.other.id], { initiallyEmpty: true });
      console.log(JSON.stringify({ case: "empty-roster", ...evidence }));
      assert.deepEqual(evidence.final, { status: "IN_PROGRESS", roster: [f.other.id], legacyAssignee: null, pending: 1 }, "the second replacement must replace every assignee even without a pre-existing child row");
    });
  } finally {
    if (clients) await Promise.all(clients.map(c => c.$disconnect()));
    await observer.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await observer.$disconnect();
    console.log(JSON.stringify({ cleanup: "isolated schema dropped; shared PostgreSQL left running", schema: schemaName }));
  }
});
