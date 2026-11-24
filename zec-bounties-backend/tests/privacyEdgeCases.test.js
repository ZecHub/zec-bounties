const test = require("node:test");
const assert = require("node:assert/strict");
const {
  redactBroadcastPayload,
  redactLeaderboardRow,
} = require("../utils/privacy");

test("redactBroadcastPayload preserves Prisma.Decimal-style .toJSON() values and still redacts .toJSON() objects", () => {
  const decimalAmount = {
    s: 1,
    e: 1,
    d: [12, 5000000],
    toJSON() {
      return "12.5";
    },
  };
  const customWithSecret = {
    toJSON() {
      return { id: "u1", name: "Ada", email: "secret@example.com", z_address: "zs1secret" };
    },
  };
  const now = new Date("2026-11-24T00:00:00.000Z");

  const out = redactBroadcastPayload({
    id: "b1",
    bountyAmount: decimalAmount,
    createdAt: now,
    actor: customWithSecret,
  });

  assert.equal(out.bountyAmount, "12.5");
  assert.equal(out.createdAt, now);
  assert.deepEqual(out.actor, { id: "u1", name: "Ada" });
});

test("redactBroadcastPayload handles circular references safely while preserving shared DAG objects", () => {
  const sharedUser = { id: "u1", name: "Ada", email: "ada@example.com" };
  const payload = {
    id: "b1",
    createdByUser: sharedUser,
    assigneeUser: sharedUser,
  };
  payload.self = payload;

  const out = redactBroadcastPayload(payload);
  assert.deepEqual(out.createdByUser, { id: "u1", name: "Ada" });
  assert.deepEqual(out.assigneeUser, { id: "u1", name: "Ada" });
  assert.equal(out.self, undefined);
  assert.doesNotThrow(() => JSON.stringify(out));
});

test("redactLeaderboardRow returns null when row is null or undefined", () => {
  assert.equal(redactLeaderboardRow(null, null), null);
  assert.equal(redactLeaderboardRow(undefined, null, { forceFull: true }), null);
});
