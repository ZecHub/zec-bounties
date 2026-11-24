const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

function loadPayoutPasskeys() {
  const passkeysPath = require.resolve("../utils/payoutPasskeys");
  const origLoad = Module._load;
  delete require.cache[passkeysPath];

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "@simplewebauthn/server") {
      return {
        generateRegistrationOptions: async () => ({}),
        verifyRegistrationResponse: async () => ({ verified: false }),
        verifyAuthenticationResponse: async () => ({ verified: false }),
      };
    }
    return origLoad.call(this, request, parent, isMain);
  };

  try {
    return require(passkeysPath);
  } finally {
    Module._load = origLoad;
  }
}

test("parseKeyDelayMs falls back to 72h on blank, non-finite, or negative env values", () => {
  const { parseKeyDelayMs, DEFAULT_KEY_DELAY_HOURS } = loadPayoutPasskeys();
  const defaultMs = DEFAULT_KEY_DELAY_HOURS * 3600 * 1000;

  assert.equal(parseKeyDelayMs(undefined), defaultMs);
  assert.equal(parseKeyDelayMs(null), defaultMs);
  assert.equal(parseKeyDelayMs(""), defaultMs);
  assert.equal(parseKeyDelayMs("   "), defaultMs);
  assert.equal(parseKeyDelayMs("not-a-number"), defaultMs);
  assert.equal(parseKeyDelayMs("-12"), defaultMs);
  assert.equal(parseKeyDelayMs("Infinity"), defaultMs);

  // Explicit valid non-negative numeric values are honored
  assert.equal(parseKeyDelayMs("0"), 0);
  assert.equal(parseKeyDelayMs("24"), 24 * 3600 * 1000);
  assert.equal(parseKeyDelayMs(" 48 "), 48 * 3600 * 1000);
});

test("voteMessage canonicalizes batch items and rejects invalid expiresAt with status 400", () => {
  const { voteMessage, voteChallenge, totalZatOf, itemsOf } = loadPayoutPasskeys();
  const round = {
    id: "r1",
    nonce: "rn1",
    teamId: null,
    chain: "MAIN",
    expiresAt: "2026-12-01T00:00:00.000Z",
    items: [
      { bountyId: "b2", payeeId: "u2", recipient: "u1addr2", amountZat: 200n },
      { bountyId: "b1", payeeId: "u1", recipient: "u1addr1", amountZat: "100" },
    ],
  };

  assert.deepEqual(
    itemsOf(round).map((i) => i.bountyId),
    ["b1", "b2"],
  );
  assert.equal(totalZatOf(itemsOf(round)), "300");

  const parsed = JSON.parse(voteMessage(round, "exec-1", "vn-1"));
  assert.equal(parsed.totalZat, "300");
  assert.equal(parsed.expiresAt, "2026-12-01T00:00:00.000Z");
  assert.equal(typeof voteChallenge(round, "exec-1", "vn-1"), "string");

  assert.throws(
    () => voteMessage({ ...round, expiresAt: "invalid-date" }, "exec-1", "vn-1"),
    (err) => err.status === 400 && /Invalid round expiration timestamp/.test(err.message),
  );
});
