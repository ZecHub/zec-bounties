const test = require("node:test");
const assert = require("node:assert/strict");

const { canAccessTeamBoard } = require("../helpers/teamBoardAccess");

// A private team's bounty board is members-only; a self-service favourite must
// not substitute for membership.

test("public team: anyone may access", () => {
  assert.equal(canAccessTeamBoard({ isPrivate: false }), true);
  assert.equal(canAccessTeamBoard({ isPrivate: false, isMember: false }), true);
  assert.equal(canAccessTeamBoard({}), true);
});

test("private team: non-member (even a favouriter) is denied", () => {
  // A favouriter is NOT a member — isMember stays false regardless of favourite.
  assert.equal(
    canAccessTeamBoard({ isPrivate: true, isAdmin: false, isMember: false }),
    false,
  );
});

test("private team: member is allowed", () => {
  assert.equal(canAccessTeamBoard({ isPrivate: true, isMember: true }), true);
});

test("private team: global admin is allowed", () => {
  assert.equal(canAccessTeamBoard({ isPrivate: true, isAdmin: true }), true);
});
