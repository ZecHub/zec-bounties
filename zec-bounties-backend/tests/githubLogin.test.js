const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  verifiedPrimaryEmail,
  isOtherGithubAccount,
} = require("../helpers/githubLogin");

describe("verifiedPrimaryEmail", () => {
  it("returns the primary email when GitHub verified it", () => {
    const emails = [
      { email: "old@example.com", primary: false, verified: true },
      { email: "me@example.com", primary: true, verified: true },
    ];
    assert.equal(verifiedPrimaryEmail(emails), "me@example.com");
  });

  it("refuses an unverified primary email", () => {
    const emails = [
      { email: "admin@example.com", primary: true, verified: false },
      { email: "me@example.com", primary: false, verified: true },
    ];
    assert.equal(verifiedPrimaryEmail(emails), null);
  });

  it("returns null when GitHub sends no email list", () => {
    assert.equal(verifiedPrimaryEmail(undefined), null);
    assert.equal(verifiedPrimaryEmail({ message: "Bad credentials" }), null);
  });
});

describe("isOtherGithubAccount", () => {
  it("blocks a different GitHub id on a linked account", () => {
    assert.equal(isOtherGithubAccount({ githubId: "1" }, "2"), true);
  });

  it("allows the linked GitHub id", () => {
    assert.equal(isOtherGithubAccount({ githubId: "1" }, "1"), false);
  });

  it("allows an account with no GitHub link yet, or no account", () => {
    assert.equal(isOtherGithubAccount({ githubId: null }, "2"), false);
    assert.equal(isOtherGithubAccount(null, "2"), false);
  });
});
