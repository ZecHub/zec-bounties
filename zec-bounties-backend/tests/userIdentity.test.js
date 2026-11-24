const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  userIdentityWhere,
  bountyInvolvesUserWhere,
} = require("../utils/userIdentity");

describe("userIdentityWhere", () => {
  it("rejects non-string query values instead of stringifying arrays or objects", () => {
    assert.equal(userIdentityWhere(null), null);
    assert.equal(userIdentityWhere(undefined), null);
    assert.equal(userIdentityWhere(12345), null);
    assert.equal(userIdentityWhere(["alice", "bob"]), null);
    assert.equal(userIdentityWhere({ contains: "alice" }), null);
  });

  it("strips LIKE wildcards before trimming and checking minimum length", () => {
    assert.equal(userIdentityWhere("a"), null);
    assert.equal(userIdentityWhere("%  %"), null);
    assert.equal(userIdentityWhere("__a__"), null);
    assert.equal(userIdentityWhere("   "), null);

    const where = userIdentityWhere("  % alice_dev %  ");
    assert.deepEqual(where, {
      OR: [
        { nickname: { contains: "alicedev", mode: "insensitive" } },
        { name: { contains: "alicedev", mode: "insensitive" } },
        { discordUsername: { contains: "alicedev", mode: "insensitive" } },
        { discordGlobalName: { contains: "alicedev", mode: "insensitive" } },
      ],
    });
  });

  it("caps normalized terms to 40 characters without letting leading wildcards truncate the term", () => {
    const raw = "%".repeat(50) + "alice" + "x".repeat(60);
    const where = userIdentityWhere(raw);
    const term = where.OR[0].nickname.contains;
    assert.equal(term.length, 40);
    assert.ok(term.startsWith("alice"));
  });
});

describe("bountyInvolvesUserWhere", () => {
  it("returns null for empty, array, or non-object user filters", () => {
    assert.equal(bountyInvolvesUserWhere(null), null);
    assert.equal(bountyInvolvesUserWhere(undefined), null);
    assert.equal(bountyInvolvesUserWhere({}), null);
    assert.equal(bountyInvolvesUserWhere([]), null);
    assert.equal(bountyInvolvesUserWhere("alice"), null);
  });

  it("wraps a valid userWhere across creator, primary assignee, assignees, and applicants", () => {
    const uw = userIdentityWhere("alice");
    const wrapped = bountyInvolvesUserWhere(uw);
    assert.deepEqual(wrapped, {
      OR: [
        { createdByUser: uw },
        { assigneeUser: uw },
        { assignees: { some: { user: uw } } },
        { applications: { some: { applicantUser: uw } } },
      ],
    });
  });
});
