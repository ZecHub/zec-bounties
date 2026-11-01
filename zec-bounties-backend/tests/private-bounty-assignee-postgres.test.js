// Private-bounty visibility for assignees, exercised against disposable PostgreSQL.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const { test } = require("node:test");
const backend = path.resolve(__dirname, "..");
const checkout = path.resolve(backend, "..");
// Opt in only with an explicitly configured disposable local test database.
const configuredUrl = process.env.TEST_DATABASE_URL?.trim();
const schemaName = `private_assignee_${process.pid}`;
assert.match(schemaName, /^private_assignee_[0-9]+$/);
let dbUrl, observerUrl;
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

// Loads the actual bounty routes and helpers on a real Prisma client. Cache,
// mail, Discord and websocket delivery are local recorders.
function loadRoutes(prisma) {
  const routes = new Map();
  const errors = [], broadcasts = [], background = new Set();
  const noOp = async () => {};
  // The assignee route looks up Discord handles after responding; track those
  // reads so they finish before the schema is dropped.
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
  const websocket = { sendRealtimeUpdate: (type, payload, excludeUserId, recipients) => broadcasts.push({ type, recipients }), sendToUser: noOp };
  function load(file, dependencies) {
    const module = { exports: {} }, filename = path.join(backend, file);
    vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
      module, exports: module.exports,
      require(name) { if (Object.hasOwn(dependencies, name)) return dependencies[name]; throw new Error(`Unexpected dependency ${name}`); },
      process: { env: { NODE_ENV: "test" } }, console: { log() {}, error(...args) { errors.push(args.map(String)); } }, setTimeout,
    }, { filename });
    return module.exports;
  }
  const activity = load("utils/bountyActivity.js", {
    "../prisma/client": trackedPrisma, "../middleware/websocket": { sendToUser: noOp },
    "./userSelects": require(path.join(backend, "utils/userSelects")),
  });
  const helpers = load("utils/bountyHelpers.js", {
    "../prisma/client": trackedPrisma, "./cache": cache, "./sendMail": noOp, "./notifyUser": noOp,
    "../middleware/websocket": websocket,
  });
  const router = Object.fromEntries(["get", "post", "put", "patch", "delete"].map(method => [method,
    (url, ...callbacks) => routes.set(`${method} ${url}`, callbacks.at(-1)),
  ]));
  load("routes/bounties.js", {
    express: { Router: () => router }, "../prisma/client": trackedPrisma,
    "../helpers/email": {}, "../middleware/auth": { authenticate: noOp, isAdmin: noOp, optionalAuthenticate: noOp, signSessionToken: noOp },
    "../middleware/websocket": websocket,
    "../utils/cache": cache, "../utils/sendMail": noOp, "../utils/notifyUser": noOp,
    "../utils/suggestionSettings": { getSuggestionSettings: async () => ({ mode: "open", threshold: 0 }) },
    "../utils/discord/discordNotify": { notifyNewBounty: noOp },
    "../utils/discord/discordAssignWebhook": { notifyAssignment: noOp },
    "../utils/constants": require(path.join(backend, "utils/constants")),
    "../helpers/validateBounty": require(path.join(backend, "helpers/validateBounty")),
    "../utils/userIdentity": require(path.join(backend, "utils/userIdentity")),
    "../utils/userSelects": require(path.join(backend, "utils/userSelects")),
    "../utils/privacy": require(path.join(backend, "utils/privacy")),
    "../utils/bountySuggestionReview": require(path.join(backend, "utils/bountySuggestionReview")),
    // Passing a client skips the unawaited fan-out, which could outlive the schema.
    "../utils/bountyActivity": {
      logActivity: (client, entry) => activity.logActivity(client ?? trackedPrisma, entry),
      publishActivity: noOp,
    },
    "../utils/bountyHelpers": helpers,
  });
  async function call(route, user, { params = {}, body = {}, query = {} } = {}) {
    const handler = routes.get(route);
    assert.equal(typeof handler, "function", route);
    const res = { statusCode: 200, headersSent: false, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; this.headersSent = true; return this; } };
    await handler({ user, params, body, query }, res);
    await Promise.all([...background]);
    assert.deepEqual(errors, [], `${route} must not log errors`);
    return res;
  }
  return {
    broadcasts, helpers,
    detail: (user, id) => call("get /:id", user, { params: { id } }).then(r => r.statusCode),
    roster: (user, id) => call("get /:id/assignees", user, { params: { id } }).then(r => r.statusCode),
    async feed(user) {
      const res = await call("get /", user, { query: { limit: "50" } });
      assert.equal(res.statusCode, 200);
      return res.body.data.map(b => b.id);
    },
    assign: (user, id, userIds) => call("post /:id/assignees", user, { params: { id }, body: { userIds } }),
    edit: (user, id, body) => call("put /:id", user, { params: { id }, body }),
  };
}

let db;
let seq = 0;
async function seed(label) {
  const n = `${label}-${++seq}`;
  const user = (name, role) => db.user.create({ data: { name: `${n} ${name}`, role } });
  const admin = await user("admin", "ADMIN");
  const owner = await user("team owner", "TEAM");
  const member = await user("team member", "HUNTER");
  const outsider = await user("outside assignee", "HUNTER");
  const stranger = await user("unrelated hunter", "HUNTER");
  const team = await db.team.create({ data: {
    name: `${n} private team`, isPrivate: true, isVerified: true,
    members: { create: [{ userId: owner.id, role: "OWNER" }, { userId: member.id, role: "MEMBER" }] },
  } });
  const bounty = (data) => db.bounty.create({ data: {
    title: `${n} bounty`, description: "Disposable visibility fixture", bountyAmount: 1,
    timeToComplete: new Date("2030-01-01T00:00:00Z"), createdBy: owner.id, isApproved: true, ...data,
  } });
  return { admin, owner, member, outsider, stranger, team, bounty };
}
// The ids a private bounty's realtime events reached, per event type.
function audience(broadcasts, type) {
  const event = broadcasts.find(b => b.type === type);
  assert.ok(event, `${type} must be broadcast`);
  assert.ok(Array.isArray(event.recipients), `${type} on a private bounty must be scoped`);
  return event.recipients;
}

test("private team bounty visibility for assignees with isolated real PostgreSQL", { skip: !configuredUrl && "requires explicit TEST_DATABASE_URL for disposable local PostgreSQL" }, async t => {
  cli(["generate"]);
  const { PrismaClient } = require(path.join(backend, "node_modules/@prisma/client"));
  const observer = new PrismaClient({ datasources: { db: { url: observerUrl } } });
  await observer.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
  try {
    cli(["db", "push", "--skip-generate"]);
    db = new PrismaClient({ datasources: { db: { url: dbUrl } } });

    await t.test("an outside hunter assigned to a private team bounty can see it", async () => {
      const f = await seed("roster");
      const b = await f.bounty({ teamId: f.team.id, isPrivate: true });
      const routes = loadRoutes(db);
      assert.equal((await routes.assign(f.admin, b.id, [f.outsider.id])).statusCode, 200);

      for (const type of ["bounty_assignees_updated", "bounty_updated"]) {
        const recipients = audience(routes.broadcasts, type);
        assert.ok(recipients.includes(f.outsider.id), `${type} must reach the assignee`);
        assert.ok(!recipients.includes(f.stranger.id), `${type} must not reach an unrelated user`);
      }
      assert.equal(await routes.detail(f.outsider, b.id), 200);
      assert.equal(await routes.roster(f.outsider, b.id), 200);
      assert.ok((await routes.feed(f.outsider)).includes(b.id));
    });

    await t.test("an unrelated user still cannot see it", async () => {
      const f = await seed("unrelated");
      const b = await f.bounty({ teamId: f.team.id, isPrivate: true, assignees: { create: { userId: f.outsider.id } } });
      const routes = loadRoutes(db);
      assert.equal(await routes.detail(f.stranger, b.id), 404);
      assert.equal(await routes.roster(f.stranger, b.id), 404);
      assert.ok(!(await routes.feed(f.stranger)).includes(b.id));
      assert.equal(await routes.detail(undefined, b.id), 404);
      assert.ok(!(await routes.feed(undefined)).includes(b.id));
      assert.ok(!(await routes.helpers.getBroadcastRecipients(b)).includes(f.stranger.id));
    });

    await t.test("existing audiences are unchanged", async () => {
      const f = await seed("control");
      const b = await f.bounty({ teamId: f.team.id, isPrivate: true, assignees: { create: { userId: f.outsider.id } } });
      const routes = loadRoutes(db);
      for (const viewer of [f.admin, f.owner, f.member]) {
        assert.equal(await routes.detail(viewer, b.id), 200);
        assert.ok((await routes.feed(viewer)).includes(b.id));
      }
      const recipients = await routes.helpers.getBroadcastRecipients(b);
      for (const viewer of [f.admin, f.owner, f.member]) assert.ok(recipients.includes(viewer.id));
      assert.equal(await routes.helpers.getBroadcastRecipients({ ...b, isPrivate: false }), null);
    });

    await t.test("the legacy assignee column alone grants visibility", async () => {
      const f = await seed("legacy");
      const b = await f.bounty({ teamId: f.team.id, isPrivate: true, assignee: f.outsider.id });
      const routes = loadRoutes(db);
      assert.equal(await routes.detail(f.outsider, b.id), 200);
      assert.equal(await routes.roster(f.outsider, b.id), 200);
      assert.ok((await routes.feed(f.outsider)).includes(b.id));
      // Called with only the fields broadcastBountyEvent selects.
      const { id, isPrivate, createdBy, teamId } = b;
      assert.ok((await routes.helpers.getBroadcastRecipients({ id, isPrivate, createdBy, teamId })).includes(f.outsider.id));
      assert.equal(await routes.detail(f.stranger, b.id), 404);
    });

    await t.test("PUT /:id moving an assigned bounty into a private team keeps its assignee", async () => {
      const f = await seed("move");
      const b = await f.bounty({ createdBy: f.admin.id, assignees: { create: { userId: f.outsider.id } } });
      const routes = loadRoutes(db);
      const res = await routes.edit(f.admin, b.id, { teamId: f.team.id });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.isPrivate, true);

      const recipients = audience(routes.broadcasts, "bounty_updated");
      assert.ok(recipients.includes(f.outsider.id), "the move must reach the assignee");
      assert.ok(!recipients.includes(f.stranger.id), "the move must not reach an unrelated user");
      assert.equal(await routes.detail(f.outsider, b.id), 200);
      assert.equal(await routes.roster(f.outsider, b.id), 200);
      assert.ok((await routes.feed(f.outsider)).includes(b.id));
      assert.equal(await routes.detail(f.stranger, b.id), 404);
      assert.ok(!(await routes.feed(f.stranger)).includes(b.id));
    });

    await t.test("removing the assignee removes their access", async () => {
      const f = await seed("removed");
      const b = await f.bounty({ teamId: f.team.id, isPrivate: true, assignees: { create: { userId: f.outsider.id } } });
      const routes = loadRoutes(db);
      assert.equal((await routes.assign(f.admin, b.id, [f.member.id])).statusCode, 200);
      assert.ok(!audience(routes.broadcasts, "bounty_updated").includes(f.outsider.id));
      assert.equal(await routes.detail(f.outsider, b.id), 404);
      assert.equal(await routes.roster(f.outsider, b.id), 404);
      assert.ok(!(await routes.feed(f.outsider)).includes(b.id));
    });
  } finally {
    if (db) await db.$disconnect();
    await observer.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await observer.$disconnect();
  }
});
