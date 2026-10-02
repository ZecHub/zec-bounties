// The actual apply, review and withdrawal handlers use disposable PostgreSQL rows.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const { test } = require("node:test");
const backend = path.resolve(__dirname, "..");
const checkout = path.resolve(backend, "..");
const configuredUrl = process.env.TEST_DATABASE_URL?.trim();
const schemaName = `application_withdrawal_${process.pid}`;
assert.match(schemaName, /^application_withdrawal_[0-9]+$/);
let dbUrl, observerUrl, observer, clients;
if (configuredUrl) {
  const url = new URL(configuredUrl);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "TEST_DATABASE_URL must target localhost");
  assert.match(url.pathname, /(?:^|[_-])test(?:[_-]|$)/, "use a database explicitly named for disposable tests");
  url.searchParams.set("schema", "public");
  observerUrl = url.toString();
  url.searchParams.set("schema", schemaName);
  dbUrl = url.toString();
}
function cli(args) {
  return execFileSync(process.execPath, [path.join(backend, "node_modules/prisma/build/index.js"),
    ...args, "--schema", path.join(backend, "prisma/schema.prisma")], {
    cwd: checkout, env: { ...process.env, DATABASE_URL: dbUrl }, encoding: "utf8", timeout: 60000,
  });
}
function deferred() {
  let resolve;
  return { promise: new Promise(r => { resolve = r; }), resolve: value => resolve(value) };
}
function waitBounded(promise, label) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout: ${label}`)), 8000);
  })]).finally(() => clearTimeout(timer));
}
function json(value) { return JSON.parse(JSON.stringify(value)); }
function afterApplicationRead(client, hook) {
  return new Proxy(client, {
    get(target, key) {
      if (key === "bountyApplication") return new Proxy(target.bountyApplication, {
        get(model, operation) {
          const value = model[operation];
          if (operation === "findUnique") return async args => {
            const row = await value.call(model, args);
            await hook(args, row);
            return row;
          };
          return typeof value === "function" ? value.bind(model) : value;
        },
      });
      const value = target[key];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
function loadRoutes(prisma) {
  const routes = new Map(), errors = [], broadcasts = [], invalidations = [], timers = new Set();
  const noOp = async () => {};
  const cache = {
    getCache: noOp, setCache: noOp,
    delCache: async key => { invalidations.push(["delete", key]); },
    deleteCacheByPattern: async key => { invalidations.push(["pattern", key]); },
    bumpVersion: async key => { invalidations.push(["version", key]); },
    getVersion: async () => 0, TTL: {},
  };
  function load(file, dependencies) {
    const module = { exports: {} }, filename = path.join(backend, file);
    vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
      module, exports: module.exports,
      require(name) { if (Object.hasOwn(dependencies, name)) return dependencies[name]; throw new Error(`Unexpected dependency ${name}`); },
      process: { env: { NODE_ENV: "test" } },
      console: { log() {}, error(...args) { errors.push(args.map(String)); } },
      setTimeout(callback, ms) { const timer = setTimeout(() => { timers.delete(timer); callback(); }, ms); timers.add(timer); return timer; },
    }, { filename });
    return module.exports;
  }
  const helpers = load("utils/bountyHelpers.js", {
    "../prisma/client": prisma, "./cache": cache, "./sendMail": noOp, "./notifyUser": noOp,
  });
  const router = Object.fromEntries(["get", "post", "put", "patch", "delete"].map(method => [method,
    (url, ...callbacks) => routes.set(`${method} ${url}`, callbacks.at(-1)),
  ]));
  load("routes/bounties.js", {
    express: { Router: () => router }, "../prisma/client": prisma,
    "../helpers/email": {}, "../middleware/auth": { authenticate: noOp, isAdmin: noOp, optionalAuthenticate: noOp, signSessionToken: noOp },
    "../middleware/websocket": { sendRealtimeUpdate: (...args) => broadcasts.push(json(args)) },
    "../utils/cache": cache, "../utils/sendMail": noOp, "../utils/notifyUser": noOp,
    "../utils/discord/discordNotify": { notifyNewBounty: noOp },
    "../utils/discord/discordAssignWebhook": { notifyAssignment: noOp },
    "../utils/constants": {}, "../helpers/validateBounty": {},
    "../utils/userIdentity": require(path.join(backend, "utils/userIdentity")),
    "../utils/userSelects": require(path.join(backend, "utils/userSelects")),
    "../utils/bountyHelpers": helpers,
  });
  for (const key of ["post /apply", "put /applications/:applicationId", "delete /applications/:applicationId"])
    assert.equal(typeof routes.get(key), "function", `actual ${key} handler must be registered`);
  return {
    errors, broadcasts, invalidations,
    close() { for (const timer of timers) clearTimeout(timer); timers.clear(); },
    async invoke(method, user, applicationId, body = {}, { allowReportedError = false } = {}) {
      const key = method === "post" ? "post /apply" : `${method} /applications/:applicationId`;
      const req = { user, params: { applicationId }, body };
      const res = { statusCode: 200, headersSent: false, status(code) { this.statusCode = code; return this; }, json(body) { this.body = json(body); this.headersSent = true; return this; } };
      await routes.get(key)(req, res);
      if (!allowReportedError) assert.deepEqual(errors, [], "actual handlers must not log fixture errors");
      return res;
    },
  };
}
async function seed(db, label) {
  const admin = await db.user.create({ data: { name: `${label} administrator`, role: "ADMIN" } });
  const applicant = await db.user.create({ data: { name: `${label} applicant`, role: "HUNTER" } });
  const other = await db.user.create({ data: { name: `${label} other applicant`, role: "HUNTER" } });
  const bounty = await db.bounty.create({ data: {
    title: `Disposable ${label}`, description: "Local application lifecycle fixture", bountyAmount: 1,
    timeToComplete: new Date("2030-01-01T00:00:00Z"), createdBy: admin.id, status: "TO_DO", isApproved: true,
  } });
  const apply = loadRoutes(db);
  try {
    const response = await apply.invoke("post", applicant, null, { bountyId: bounty.id, message: "I can complete this bounty." });
    assert.equal(response.statusCode, 201, "actual supported application route must create the fixture");
    assert.equal(response.body.status, "pending");
    assert.equal(response.body.applicantId, applicant.id);
    assert.deepEqual(apply.broadcasts.map(e => e[0]), ["application_created"]);
    return { admin, applicant, other, bounty, application: response.body };
  } finally { apply.close(); }
}
async function snapshot(db, f) {
  const [application, bounty] = await Promise.all([
    db.bountyApplication.findUnique({ where: { id: f.application.id } }),
    db.bounty.findUnique({ where: { id: f.bounty.id }, include: { assignees: true } }),
  ]);
  return json({ application, bountyStatus: bounty.status, isApproved: bounty.isApproved,
    roster: bounty.assignees.map(a => a.userId).sort() });
}
function assertReviewed(snapshot, f, status) {
  const app = snapshot.application;
  assert.ok(app, "reviewed application and its audit metadata must remain persisted");
  assert.equal(app.status, status);
  assert.equal(app.reviewedBy, f.admin.id);
  assert.ok(Number.isFinite(Date.parse(app.reviewedAt)), "actual review timestamp must remain persisted");
  assert.equal(app.applicantId, f.applicant.id);
  assert.equal(app.bountyId, f.bounty.id);
  assert.deepEqual(snapshot.roster, status === "accepted" ? [f.applicant.id] : []);
  assert.equal(snapshot.bountyStatus, status === "accepted" ? "IN_PROGRESS" : "TO_DO");
  assert.equal(snapshot.isApproved, true);
}
async function review(route, f, status) {
  const response = await route.invoke("put", f.admin, f.application.id, { status });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, status);
  assert.equal(response.body.reviewedBy, f.admin.id);
  assert.deepEqual(route.broadcasts.map(e => e[0]), status === "accepted" ? ["application_updated", "bounty_updated"] : ["application_updated"]);
  return response;
}
async function race(f, status) {
  const read = deferred(), release = deferred();
  let paused = false;
  const withdrawal = loadRoutes(afterApplicationRead(clients[0], async (args, row) => {
    if (!paused && args.where.id === f.application.id && args.select?.status) {
      paused = true;
      assert.equal(row.status, "pending", "pause only after the actual SQL returned a pending application");
      read.resolve(json(row));
      await waitBounded(release.promise, "release applicant's completed pending read");
    }
  }));
  const administrator = loadRoutes(clients[1]);
  const call = withdrawal.invoke("delete", f.applicant, f.application.id)
    .then(reply => ({ reply }), error => ({ error }));
  let observed, before, reviewResponse;
  try {
    try {
      observed = await waitBounded(read.promise, "actual applicant pending read");
      reviewResponse = await waitBounded(review(administrator, f, status), "real administrator review commit");
      before = await snapshot(clients[2], f);
      assertReviewed(before, f, status);
    } finally { release.resolve(); }
    const { reply, error } = await waitBounded(call, "withdrawal completion");
    if (error) throw error;
    const after = await snapshot(clients[2], f);
    console.log(JSON.stringify({ case: `review-${status}-after-withdrawal-read`, observed, reviewResponse: { status: reviewResponse.statusCode, body: reviewResponse.body },
      beforeRelease: before, withdrawalResponse: { status: reply.statusCode, body: reply.body }, afterRelease: after,
      reviewBroadcasts: administrator.broadcasts, withdrawalBroadcasts: withdrawal.broadcasts }));
    assert.equal(reply.statusCode, 400, "a review committed before withdrawal's delete must prevent withdrawal");
    assert.equal(reply.body.error, "Cannot withdraw a reviewed application");
    assertReviewed(after, f, status);
    assert.deepEqual(after, before, "withdrawal must retain the exact committed review and assignment");
    assert.deepEqual(withdrawal.broadcasts, [], "an application that remains reviewed must not be announced as deleted");
    assert.deepEqual(withdrawal.invalidations, [], "a rejected withdrawal must not invalidate unchanged data");
  } finally {
    release.resolve();
    await waitBounded(call, "settle withdrawal before fixture cleanup");
    withdrawal.close(); administrator.close();
  }
}
async function duplicateWithdrawal(f) {
  const reads = [deferred(), deferred()], releases = [deferred(), deferred()];
  const paused = [false, false];
  const routes = clients.slice(0, 2).map((client, index) => loadRoutes(afterApplicationRead(client, async (args, row) => {
    if (!paused[index] && args.where.id === f.application.id && args.select?.status) {
      paused[index] = true;
      assert.equal(row.status, "pending", "both requests must read the actual pending row before either deletes it");
      reads[index].resolve(json(row));
      await waitBounded(releases[index].promise, `release withdrawal ${index + 1}`);
    }
  })));
  const calls = routes.map(route => route.invoke("delete", f.applicant, f.application.id, {}, { allowReportedError: true })
    .then(reply => ({ reply }), error => ({ error })));
  try {
    const observed = await waitBounded(Promise.all(reads.map(read => read.promise)), "both actual pending reads");
    releases[0].resolve();
    const first = await waitBounded(calls[0], "first actual withdrawal completion");
    if (first.error) throw first.error;
    assert.equal(first.reply.statusCode, 200);
    assert.equal(first.reply.body.message, "Application withdrawn successfully");
    assert.deepEqual(routes[0].errors, [], "the successful first withdrawal must not report an error");
    assert.deepEqual(routes[0].broadcasts, [["application_deleted", { id: f.application.id, bountyId: f.bounty.id }, f.applicant.id]]);
    assert.ok(routes[0].invalidations.some(([kind, key]) => kind === "delete" && key === `applications:user:${f.applicant.id}`));
    const beforeSecond = await snapshot(clients[2], f);
    assert.deepEqual(beforeSecond, { application: null, bountyStatus: "TO_DO", isApproved: true, roster: [] });
    releases[1].resolve();
    const second = await waitBounded(calls[1], "second withdrawal completion after actual deletion");
    if (second.error) throw second.error;
    const afterSecond = await snapshot(clients[2], f);
    console.log(JSON.stringify({ case: "duplicate-withdrawal-after-both-pending-reads", observed,
      firstResponse: { status: first.reply.statusCode, body: first.reply.body }, beforeSecondRelease: beforeSecond,
      secondResponse: { status: second.reply.statusCode, body: second.reply.body }, afterSecondRelease: afterSecond,
      firstBroadcasts: routes[0].broadcasts, secondBroadcasts: routes[1].broadcasts,
      secondInvalidations: routes[1].invalidations, secondReportedErrors: routes[1].errors }));
    assert.equal(second.reply.statusCode, 404, "a concurrently withdrawn application must use the existing not-found response");
    assert.equal(second.reply.body.error, "Application not found");
    assert.deepEqual(afterSecond, beforeSecond, "the second withdrawal must preserve the bounty and already-deleted application state");
    assert.deepEqual(routes[1].broadcasts, [], "the second withdrawal must not announce another deletion");
    assert.deepEqual(routes[1].invalidations, [], "the second withdrawal must not invalidate unchanged data");
    assert.deepEqual(routes[1].errors, [], "normal duplicate withdrawal must not report a database error");
  } finally {
    releases.forEach(release => release.resolve());
    await waitBounded(Promise.all(calls), "settle duplicate withdrawals before fixture cleanup");
    routes.forEach(route => route.close());
  }
}
test("actual application lifecycle with isolated real PostgreSQL", { skip: !configuredUrl && "requires explicit TEST_DATABASE_URL for disposable local PostgreSQL" }, async t => {
  console.log(cli(["generate"]).trim());
  const { PrismaClient } = require(path.join(backend, "node_modules/@prisma/client"));
  observer = new PrismaClient({ datasources: { db: { url: observerUrl } } });
  await observer.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
  try {
    console.log(cli(["db", "push", "--skip-generate"]).trim());
    clients = Array.from({ length: 3 }, () => new PrismaClient({ datasources: { db: { url: dbUrl } } }));
    const db = clients[2];
    const [{ version, isolation }] = await db.$queryRawUnsafe("SELECT version() AS version, current_setting('transaction_isolation') AS isolation");
    console.log(JSON.stringify({ environment: { version, isolation, prisma: require(path.join(backend, "node_modules/@prisma/client/package.json")).version, schema: schemaName } }));
    await t.test("control: sequential pending withdrawal deletes the application only", async () => {
      const f = await seed(db, "pending-control"), route = loadRoutes(db);
      try {
        const reply = await route.invoke("delete", f.applicant, f.application.id);
        assert.equal(reply.statusCode, 200);
        assert.equal(reply.body.message, "Application withdrawn successfully");
        assert.deepEqual(await snapshot(db, f), { application: null, bountyStatus: "TO_DO", isApproved: true, roster: [] });
        assert.deepEqual(route.broadcasts, [["application_deleted", { id: f.application.id, bountyId: f.bounty.id }, f.applicant.id]]);
        assert.ok(route.invalidations.some(([kind, key]) => kind === "delete" && key === `applications:user:${f.applicant.id}`));
      } finally { route.close(); }
    });
    for (const status of ["accepted", "rejected"]) await t.test(`control: sequential ${status} review prevents withdrawal`, async () => {
      const f = await seed(db, `${status}-control`), administrator = loadRoutes(db), withdrawal = loadRoutes(db);
      try {
        await review(administrator, f, status);
        const before = await snapshot(db, f); assertReviewed(before, f, status);
        const reply = await withdrawal.invoke("delete", f.applicant, f.application.id);
        assert.equal(reply.statusCode, 400);
        assert.equal(reply.body.error, "Cannot withdraw a reviewed application");
        assert.deepEqual(await snapshot(db, f), before);
        assert.deepEqual(withdrawal.broadcasts, []);
        assert.deepEqual(withdrawal.invalidations, []);
      } finally { administrator.close(); withdrawal.close(); }
    });
    await t.test("control: a missing application is unchanged and returns not found", async () => {
      const f = await seed(db, "missing-control"), route = loadRoutes(db), before = await snapshot(db, f);
      try {
        const reply = await route.invoke("delete", f.applicant, "missing-disposable-application");
        assert.equal(reply.statusCode, 404); assert.equal(reply.body.error, "Application not found");
        assert.deepEqual(await snapshot(db, f), before);
        assert.deepEqual(route.broadcasts, []); assert.deepEqual(route.invalidations, []);
      } finally { route.close(); }
    });
    await t.test("control: another applicant cannot withdraw a pending application", async () => {
      const f = await seed(db, "other-applicant-control"), route = loadRoutes(db), before = await snapshot(db, f);
      try {
        const reply = await route.invoke("delete", f.other, f.application.id);
        assert.equal(reply.statusCode, 403); assert.equal(reply.body.error, "Access denied");
        assert.deepEqual(await snapshot(db, f), before);
        assert.deepEqual(route.broadcasts, []); assert.deepEqual(route.invalidations, []);
      } finally { route.close(); }
    });
    for (const status of ["accepted", "rejected"]) await t.test(`regression: a committed ${status} review survives an earlier withdrawal read`, async () => {
      const f = await seed(db, `${status}-race`);
      await race(f, status);
    });
    await t.test("regression: concurrent duplicate withdrawal returns not found after the first deletes", async () => {
      const f = await seed(db, "duplicate-withdrawal-race");
      await duplicateWithdrawal(f);
    });
  } finally {
    if (clients) await Promise.all(clients.map(c => c.$disconnect()));
    await observer.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await observer.$disconnect();
    console.log(JSON.stringify({ cleanup: "isolated schema dropped; shared PostgreSQL left running", schema: schemaName }));
  }
});
