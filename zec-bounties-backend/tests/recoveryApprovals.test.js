const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function loadRecoveryApprovals(verifyFn) {
  const passkeysPath = require.resolve("../utils/payoutPasskeys");
  const recoveryPath = require.resolve("../utils/recoveryApprovals");
  const prevPasskeys = require.cache[passkeysPath];
  const prevRecovery = require.cache[recoveryPath];

  require.cache[passkeysPath] = {
    id: passkeysPath,
    filename: passkeysPath,
    loaded: true,
    exports: {
      RP_ID: "example.test",
      b64u: (buf) => Buffer.from(buf).toString("base64url"),
      verifyAssertionForChallenge: verifyFn,
    },
  };
  delete require.cache[recoveryPath];

  const mod = require(recoveryPath);

  const restore = () => {
    if (prevPasskeys) require.cache[passkeysPath] = prevPasskeys;
    else delete require.cache[passkeysPath];
    if (prevRecovery) require.cache[recoveryPath] = prevRecovery;
    else delete require.cache[recoveryPath];
  };

  return { mod, restore };
}

test("requiredSignatures clamps negative counts to 0 and caps at RECOVERY_THRESHOLD", () => {
  const { mod, restore } = loadRecoveryApprovals(async () => ({ ok: true }));
  try {
    assert.equal(mod.requiredSignatures(-2), 0);
    assert.equal(mod.requiredSignatures(0), 0);
    assert.equal(mod.requiredSignatures(2), 2);
    assert.equal(mod.requiredSignatures(5), 3);
  } finally {
    restore();
  }
});

test("countValidSignatures enforces activatesAt <= now, skips empty key lookup, and deduplicates per user", async () => {
  let lastKeyWhere = null;
  let keyQueryCalls = 0;

  const { mod, restore } = loadRecoveryApprovals(async () => ({ ok: true }));
  try {
    const approval = {
      id: "apr-1",
      teamId: "team-1",
      requesterId: "u0",
      threshold: 2,
      approverIds: ["u1", "u2", "u3"],
      createdAt: new Date("2026-11-01T00:00:00.000Z"),
    };

    const emptyDb = {
      recoveryApprovalSignature: { findMany: async () => [] },
      teamMember: { findMany: async () => [{ userId: "u1" }] },
      approverKey: {
        findMany: async () => {
          keyQueryCalls++;
          return [];
        },
      },
    };
    assert.equal(await mod.countValidSignatures(emptyDb, approval), 0);
    assert.equal(keyQueryCalls, 0);

    const activePast = new Date(Date.now() - 60_000);
    const pendingFuture = new Date(Date.now() + 3600_000);
    const storedKeys = [
      { id: "k1", userId: "u1", credentialId: "c1", publicKey: Buffer.from("pk1"), transports: [], revokedAt: null, activatesAt: activePast },
      { id: "k2", userId: "u2", credentialId: "c2", publicKey: Buffer.from("pk2"), transports: [], revokedAt: null, activatesAt: pendingFuture },
    ];

    const db = {
      recoveryApprovalSignature: {
        findMany: async () => [
          { approvalId: "apr-1", userId: "u1", keyId: "k1", voteNonce: "n1", assertion: { id: "c1" } },
          { approvalId: "apr-1", userId: "u1", keyId: "k1", voteNonce: "n2", assertion: { id: "c1" } },
          { approvalId: "apr-1", userId: "u2", keyId: "k2", voteNonce: "n3", assertion: { id: "c2" } },
        ],
      },
      teamMember: {
        findMany: async () => [{ userId: "u1" }, { userId: "u2" }],
      },
      approverKey: {
        findMany: async ({ where }) => {
          lastKeyWhere = where;
          return storedKeys.filter(
            (k) =>
              where.id.in.includes(k.id) &&
              k.revokedAt === where.revokedAt &&
              k.activatesAt <= where.activatesAt.lte,
          );
        },
      },
    };

    const valid = await mod.countValidSignatures(db, approval);
    assert.equal(valid, 1);
    assert.ok(lastKeyWhere.activatesAt && lastKeyWhere.activatesAt.lte instanceof Date);
  } finally {
    restore();
  }
});
