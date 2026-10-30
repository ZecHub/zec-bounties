const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Stands in for every dependency a test does not care about: any property,
// call or `new` returns the stub again, and `await` resolves to it.
const anything = new Proxy(function () {}, {
  get: (_, key) => (key === "then" ? undefined : anything),
  apply: () => anything,
  construct: () => anything,
});

// A public team, saved by its owner. Records every write (the bounty rows it
// touched, and whether it ran inside the transaction) and every realtime
// event the save sends, cloned out of the vm realm so deepStrictEqual
// compares plain objects.
function loadTeamRoutes(bounties) {
  const team = { id: "team-1", name: "Team", isPrivate: false };
  const effects = { writes: [], events: [] };
  const matches = (bounty, { teamId, isPrivate }) =>
    bounty.teamId === teamId && (!isPrivate || bounty.isPrivate !== isPrivate.not);
  const client = (inTransaction) => ({
    team: {
      findUnique: async () => ({ ...team }),
      update: async ({ data }) => {
        effects.writes.push({ model: "team", inTransaction, data: structuredClone(data) });
        return { ...Object.assign(team, data), members: [] };
      },
    },
    teamMember: {
      findUnique: async () => ({ teamId: "team-1", userId: "owner", role: "OWNER" }),
    },
    bounty: {
      findMany: async ({ where }) => bounties.filter((b) => matches(b, where)),
      updateMany: async ({ where, data }) => {
        const rows = bounties.filter((b) => matches(b, where));
        rows.forEach((b) => Object.assign(b, data));
        effects.writes.push({
          model: "bounty",
          inTransaction,
          ids: rows.map((b) => b.id),
          data: structuredClone(data),
        });
        return { count: rows.length };
      },
    },
  });
  const tx = client(true);
  const db = { ...client(false), $transaction: async (fn) => fn(tx) };
  const routes = {};
  const router = new Proxy(
    {},
    { get: (_, method) => (url, ...handlers) => { routes[`${method} ${url}`] = handlers; } },
  );
  const dependencies = {
    express: { Router: () => router },
    "@prisma/client": { PrismaClient: function () { return db; } },
    "../middleware/websocket": {
      sendRealtimeUpdate: (type, payload) =>
        effects.events.push({ type, payload: structuredClone(payload) }),
    },
    "../utils/bountyHelpers": {
      broadcastTeamEvent: async (type) => effects.events.push({ type }),
    },
  };
  const filename = path.join(__dirname, "../routes/teams.js");
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(filename, "utf8"),
    {
      module,
      exports: module.exports,
      require: (name) => (Object.hasOwn(dependencies, name) ? dependencies[name] : anything),
      console: { log() {}, error() {} },
      process: { env: {} },
    },
    { filename },
  );
  return {
    effects,
    async save(body) {
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
      await routes["patch /:teamId"].at(-1)(
        { user: { id: "owner", role: "TEAM" }, params: { teamId: "team-1" }, body },
        res,
      );
      return res;
    },
  };
}

const eventTypes = (effects) => effects.events.map((e) => e.type);

test("saving team settings without a privacy change leaves its bounties and every board alone", async () => {
  const teams = loadTeamRoutes([
    { id: "b1", teamId: "team-1", isPrivate: false },
    { id: "b2", teamId: "team-1", isPrivate: false },
  ]);
  // What the team page's Save button sent for a rename.
  const res = await teams.save({ name: "Renamed", description: "", isPrivate: false });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.name, "Renamed");
  const bountyRows = teams.effects.writes.flatMap((w) => w.ids ?? []);
  assert.deepEqual(bountyRows, []);
  assert.deepEqual(eventTypes(teams.effects), ["team_updated"]);
});

test("making a team private rewrites only the bounties that differ, in the team update's transaction", async () => {
  const teams = loadTeamRoutes([
    { id: "b1", teamId: "team-1", isPrivate: false },
    { id: "b2", teamId: "team-1", isPrivate: true },
  ]);
  const res = await teams.save({ isPrivate: true });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(teams.effects.writes, [
    { model: "team", inTransaction: true, data: { isPrivate: true } },
    { model: "bounty", inTransaction: true, ids: ["b1"], data: { isPrivate: true } },
  ]);
  assert.deepEqual(eventTypes(teams.effects), ["team_bounties_privacy_changed", "team_updated"]);
  assert.deepEqual(teams.effects.events[0].payload, {
    teamId: "team-1",
    isPrivate: true,
    bountyIds: ["b1"],
  });
});
