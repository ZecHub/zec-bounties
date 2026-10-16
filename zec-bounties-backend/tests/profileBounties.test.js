const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assignedDoneWhere,
  recentCompletedWhere,
  recentCreatedWhere,
} = require("../utils/profileBounties");

// Applies a where clause the way the database would, for the fields used here.
function matches(where, bounty) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") {
      return value.some((branch) => {
        if ("assignee" in branch) return bounty.assignee === branch.assignee;
        return bounty.assigneeIds.includes(branch.assignees.some.userId);
      });
    }
    return bounty[key] === value;
  });
}

const base = {
  chain: "MAIN",
  status: "DONE",
  createdBy: "u1",
  assignee: "u1",
  assigneeIds: ["u1"],
};
const publicBounty = { ...base, id: "pub", isPrivate: false };
const privateBounty = { ...base, id: "priv", isPrivate: true };
const rows = [publicBounty, privateBounty];

test("public viewers do not get private bounties in recentCreated", () => {
  const where = recentCreatedWhere("u1", "MAIN", false);
  assert.deepEqual(
    rows.filter((b) => matches(where, b)).map((b) => b.id),
    ["pub"],
  );
});

test("public viewers do not get private bounties in recentCompleted", () => {
  const where = recentCompletedWhere("u1", "MAIN", false);
  assert.deepEqual(
    rows.filter((b) => matches(where, b)).map((b) => b.id),
    ["pub"],
  );
});

test("owner and admin views keep private bounties in both lists", () => {
  for (const where of [
    recentCreatedWhere("u1", "MAIN", true),
    recentCompletedWhere("u1", "MAIN", true),
  ]) {
    assert.equal("isPrivate" in where, false);
    assert.deepEqual(
      rows.filter((b) => matches(where, b)).map((b) => b.id),
      ["pub", "priv"],
    );
  }
});

test("the lists stay scoped to the user and the chain", () => {
  assert.deepEqual(recentCreatedWhere("u1", "TEST", false), {
    createdBy: "u1",
    chain: "TEST",
    isPrivate: false,
  });
  assert.deepEqual(recentCompletedWhere("u1", "MAIN", false), {
    ...assignedDoneWhere("u1", "MAIN"),
    isPrivate: false,
  });
  const other = { ...publicBounty, createdBy: "u2", assignee: "u2", assigneeIds: ["u2"] };
  assert.equal(matches(recentCreatedWhere("u1", "MAIN", false), other), false);
  assert.equal(matches(recentCompletedWhere("u1", "MAIN", false), other), false);
});

test("counts are unchanged: assignedDoneWhere has no privacy term", () => {
  assert.deepEqual(assignedDoneWhere("u1", "MAIN"), {
    status: "DONE",
    chain: "MAIN",
    OR: [{ assignee: "u1" }, { assignees: { some: { userId: "u1" } } }],
  });
});
