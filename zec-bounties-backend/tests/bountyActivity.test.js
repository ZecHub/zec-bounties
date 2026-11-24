const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadBountyActivity({ prisma, sendToUser }) {
  const filename = path.join(__dirname, "../utils/bountyActivity.js");
  const mod = { exports: {} };
  const deps = {
    "../prisma/client": prisma,
    "../middleware/websocket": { sendToUser },
    "./userSelects": require("../utils/userSelects"),
  };
  vm.runInNewContext(
    fs.readFileSync(filename, "utf8"),
    {
      module: mod,
      exports: mod.exports,
      require(name) {
        if (Object.hasOwn(deps, name)) return deps[name];
        throw new Error(`Unexpected dependency: ${name}`);
      },
      console: { log() {}, error() {} },
    },
    { filename },
  );
  return mod.exports;
}

test("collectActivityAudience deduplicates recipients and drops null/blank IDs", () => {
  const { collectActivityAudience } = loadBountyActivity({
    prisma: {},
    sendToUser: () => {},
  });

  const audience = collectActivityAudience(
    { createdBy: null },
    [{ id: "admin-1" }, { id: "" }, { id: "   " }, null],
    [{ userId: "admin-1" }, { userId: "team-owner" }, { userId: undefined }],
  );
  assert.deepEqual([...audience], ["admin-1", "team-owner"]);

  const withCreator = collectActivityAudience(
    { createdBy: "creator-1" },
    [{ id: "creator-1" }, { id: "admin-2" }],
    [],
  );
  assert.deepEqual([...withCreator], ["creator-1", "admin-2"]);
});

test("publishActivity returns early without querying Prisma when row or bountyId is missing", async () => {
  let queries = 0;
  const { publishActivity } = loadBountyActivity({
    prisma: {
      bounty: {
        findUnique: async () => {
          queries += 1;
          return null;
        },
      },
    },
    sendToUser: () => {
      throw new Error("should not send");
    },
  });

  await publishActivity(null);
  await publishActivity({});
  await publishActivity({ bountyId: "" });
  assert.equal(queries, 0);
});

test("publishActivity isolates per-recipient sendToUser errors and delivers to remaining audience", async () => {
  const delivered = [];
  const { publishActivity } = loadBountyActivity({
    prisma: {
      bounty: {
        findUnique: async () => ({ createdBy: "creator-1", teamId: "team-1" }),
      },
      user: {
        findMany: async () => [{ id: "admin-1" }, { id: "admin-2" }],
      },
      teamMember: {
        findMany: async () => [{ userId: "creator-1" }, { userId: "team-admin-1" }],
      },
    },
    sendToUser: (userId, event, row) => {
      if (userId === "admin-1") throw new Error("socket closed");
      delivered.push({ userId, event, bountyId: row.bountyId });
    },
  });

  await publishActivity({ id: "act-1", bountyId: "b-1", type: "UPDATED" });
  assert.deepEqual(
    delivered.map((d) => d.userId).sort(),
    ["admin-2", "creator-1", "team-admin-1"],
  );
  assert.ok(delivered.every((d) => d.event === "bounty_activity" && d.bountyId === "b-1"));
});

test("logActivity publishes immediately outside transactions and defers inside transactions", async () => {
  const sent = [];
  const prisma = {
    bountyActivity: {
      create: async ({ data }) => ({ id: "act-auto", ...data }),
    },
    bounty: {
      findUnique: async () => ({ createdBy: "creator-1", teamId: null }),
    },
    user: {
      findMany: async () => [{ id: "admin-1" }],
    },
    teamMember: {
      findMany: async () => [],
    },
  };
  const { logActivity } = loadBountyActivity({
    prisma,
    sendToUser: (userId, event, row) => sent.push({ userId, event, id: row.id }),
  });

  // Inside transaction: must not publish before commit
  const txClient = {
    bountyActivity: {
      create: async ({ data }) => ({ id: "act-tx", ...data }),
    },
  };
  const txRow = await logActivity(txClient, {
    bountyId: "b-1",
    actorId: "u-1",
    type: "CREATED",
  });
  assert.equal(txRow.id, "act-tx");
  assert.equal(sent.length, 0);

  // Outside transaction: publishes immediately
  const autoRow = await logActivity(null, {
    bountyId: "b-1",
    actorId: null,
    type: "APPROVED",
    meta: { note: "ok" },
  });
  assert.equal(autoRow.id, "act-auto");
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(
    sent.map((s) => s.userId).sort(),
    ["admin-1", "creator-1"],
  );
});
