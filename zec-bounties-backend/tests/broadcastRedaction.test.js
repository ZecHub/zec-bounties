const test = require("node:test");
const assert = require("node:assert/strict");
const {
  redactBroadcastPayload,
  BROADCAST_PRIVATE_FIELDS,
} = require("../utils/privacy");

// Shape of the approve PUT broadcast: FULL select on assignee and assignees,
// WITH_ROLE on the creator. This is what used to leave the server raw.
function approvePayload() {
  return {
    id: "b1",
    title: "Fix the wiki",
    isApproved: true,
    createdByUser: {
      id: "creator",
      name: "Creator",
      nickname: "c",
      email: "creator@example.com",
      role: "HUNTER",
      avatar: null,
    },
    assigneeUser: {
      id: "payee",
      name: "Payee",
      nickname: "p",
      email: "payee@example.com",
      avatar: null,
      z_address: "zs1secret",
      UA_address: "u1secret",
    },
    assignees: [
      {
        userId: "payee",
        user: {
          id: "payee",
          name: "Payee",
          email: "payee@example.com",
          z_address: "zs1secret",
          UA_address: "u1secret",
        },
      },
    ],
  };
}

function assertStripped(value) {
  const json = JSON.stringify(value);
  for (const key of BROADCAST_PRIVATE_FIELDS) {
    assert.ok(!json.includes(`"${key}"`), `leaked "${key}": ${json}`);
  }
}

test("approve-shaped payload loses email and payout addresses at every depth", () => {
  const out = redactBroadcastPayload(approvePayload());
  assertStripped(out);
  assert.equal(out.assigneeUser.name, "Payee");
  assert.equal(out.assignees[0].user.name, "Payee");
  assert.equal(out.createdByUser.role, "HUNTER");
  assert.equal(out.isApproved, true);
});

test("does not mutate the source object used for the HTTP response", () => {
  const src = approvePayload();
  redactBroadcastPayload(src);
  assert.equal(src.assigneeUser.UA_address, "u1secret");
  assert.equal(src.assigneeUser.email, "payee@example.com");
  assert.equal(src.createdByUser.email, "creator@example.com");
});

test("strips a team-create payload that selected FULL user fields", () => {
  const created = {
    id: "b2",
    createdByUser: { id: "a", name: "A", email: "a@example.com", role: "TEAM" },
    assigneeUser: {
      id: "b",
      name: "B",
      email: "b@example.com",
      z_address: "zs1x",
      UA_address: "u1x",
    },
  };
  const out = redactBroadcastPayload(created);
  assertStripped(out);
  assert.equal(out.createdByUser.name, "A");
  assert.equal(out.assigneeUser.name, "B");
});

test("activity actor row loses email when published beyond the actor", () => {
  const row = {
    id: "act1",
    type: "STATUS_CHANGED",
    actor: {
      id: "admin",
      name: "Admin",
      nickname: "a",
      email: "admin@example.com",
      avatar: null,
    },
  };
  const out = redactBroadcastPayload(row);
  assertStripped(out);
  assert.equal(out.actor.name, "Admin");
});

test("null and arrays survive", () => {
  assert.equal(redactBroadcastPayload(null), null);
  const out = redactBroadcastPayload([
    { email: "x@example.com", name: "X" },
    { UA_address: "u1", id: "y" },
  ]);
  assertStripped(out);
  assert.equal(out[0].name, "X");
  assert.equal(out[1].id, "y");
});
