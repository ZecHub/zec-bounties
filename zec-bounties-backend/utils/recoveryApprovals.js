const crypto = require("crypto");
const {
  RP_ID,
  b64u,
  verifyAssertionForChallenge,
} = require("./payoutPasskeys");
const { appendAudit } = require("./payoutAudit");

const RECOVERY_THRESHOLD = 3;
const OPEN_TTL_MS = 30 * 60 * 1000;
const APPROVED_TTL_MS = 10 * 60 * 1000; // window to reveal once approved

const requiredSignatures = (eligibleCount) =>
  Math.min(RECOVERY_THRESHOLD, eligibleCount);

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

async function getEligibleApproverIds(db, teamId) {
  const members = await db.teamMember.findMany({
    where: { teamId, role: { in: ["OWNER", "ADMIN"] } },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

async function expireStaleRecoveryApprovals(db, teamId) {
  await db.recoveryApproval.updateMany({
    where: {
      teamId,
      status: { in: ["OPEN", "APPROVED"] },
      expiresAt: { lt: new Date() },
    },
    data: { status: "EXPIRED" },
  });
}

// ── Passkeys (reuses ApproverKey / PayoutChallenge) ─────────────────────────

const activeKeys = (db, userId) =>
  db.approverKey.findMany({
    where: { userId, revokedAt: null, activatesAt: { lte: new Date() } },
  });

const pin = (k) => ({
  id: k.id,
  credentialId: k.credentialId,
  publicKey: Buffer.from(k.publicKey).toString("base64url"),
  transports: k.transports,
});

async function hasPasskey(db, userId) {
  return (
    (await db.approverKey.count({
      where: { userId, revokedAt: null, activatesAt: { lte: new Date() } },
    })) > 0
  );
}

// Only immutable fields go in the message (expiresAt changes on approval).
function recoveryMessage(a, voteNonce) {
  return JSON.stringify({
    v: 1,
    domain: "zec-bounties/team-recovery",
    approval: a.id,
    team: a.teamId,
    requester: a.requesterId,
    threshold: a.threshold,
    approvers: [...a.approverIds].sort(),
    createdAt: new Date(a.createdAt).toISOString(),
    voteNonce,
  });
}

const recoveryChallenge = (a, voteNonce) =>
  b64u(
    crypto.createHash("sha256").update(recoveryMessage(a, voteNonce)).digest(),
  );

async function issueRecoveryChallenge(db, userId, approval) {
  const keys = await activeKeys(db, userId);
  if (!keys.length) throw httpError(403, "You have no active payout passkey");

  const voteNonce = crypto.randomBytes(16).toString("hex");
  const challenge = recoveryChallenge(approval, voteNonce);
  await db.payoutChallenge.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  const row = await db.payoutChallenge.create({
    data: {
      userId,
      kind: "recovery",
      proposalId: approval.id, // no FK; just the round id
      voteNonce,
      challenge,
      expiresAt: new Date(Date.now() + 2 * 60 * 1000),
    },
  });

  return {
    challengeId: row.id,
    message: recoveryMessage(approval, voteNonce),
    options: {
      challenge,
      rpId: RP_ID,
      timeout: 60000,
      userVerification: "required",
      allowCredentials: keys.map((k) => ({
        id: k.credentialId,
        type: "public-key",
        transports: k.transports,
      })),
    },
  };
}

// Consumes the challenge, verifies the assertion, bumps the key counter and
// stores the signature. Throws {status} errors.
async function recordRecoverySignature(
  prisma,
  approval,
  userId,
  challengeId,
  assertion,
) {
  if (typeof challengeId !== "string" || !assertion)
    throw httpError(400, "challengeId and assertion required");

  return prisma.$transaction(async (tx) => {
    const ch = await tx.payoutChallenge.findFirst({
      where: {
        id: challengeId,
        userId,
        kind: "recovery",
        proposalId: approval.id,
        expiresAt: { gt: new Date() },
      },
    });
    if (!ch) throw httpError(400, "Signing request expired; try again");
    const used = await tx.payoutChallenge.deleteMany({ where: { id: ch.id } });
    if (used.count !== 1) throw httpError(400, "Signing request already used");

    const keyRow = await tx.approverKey.findFirst({
      where: {
        userId,
        credentialId: assertion.id,
        revokedAt: null,
        activatesAt: { lte: new Date() },
      },
    });
    if (!keyRow)
      throw httpError(400, "That passkey is not one of your active keys");

    let result;
    try {
      result = await verifyAssertionForChallenge({
        challenge: recoveryChallenge(approval, ch.voteNonce),
        assertion,
        key: pin(keyRow),
        counter: keyRow.counter,
      });
    } catch {
      throw httpError(400, "Passkey signature rejected");
    }
    if (!result.ok) throw httpError(400, "Passkey signature rejected");

    await tx.approverKey.update({
      where: { id: keyRow.id },
      data: { counter: Math.max(keyRow.counter, result.newCounter) },
    });
    await tx.recoveryApprovalSignature.create({
      data: {
        approvalId: approval.id,
        userId,
        keyId: keyRow.id,
        voteNonce: ch.voteNonce,
        assertion,
      },
    });
    await appendAudit(tx, "recovery.vote", {
      actorId: userId,
      proposalId: approval.id,
      data: {
        teamId: approval.teamId,
        revealerId: approval.requesterId,
        keyId: keyRow.id,
      },
    });
  });
}

// Re-verifies every stored signature. A row without a valid signature counts for
// nothing, and signers must still be OWNER/ADMIN with a non-revoked key.
async function countValidSignatures(db, approval) {
  const [sigs, eligibleNow] = await Promise.all([
    db.recoveryApprovalSignature.findMany({
      where: { approvalId: approval.id },
    }),
    getEligibleApproverIds(db, approval.teamId),
  ]);
  const eligible = new Set(eligibleNow);
  const keys = await db.approverKey.findMany({
    where: { id: { in: sigs.map((s) => s.keyId) }, revokedAt: null },
  });
  const keyById = new Map(keys.map((k) => [k.id, k]));

  let valid = 0;
  for (const s of sigs) {
    if (!approval.approverIds.includes(s.userId) || !eligible.has(s.userId))
      continue;
    const k = keyById.get(s.keyId);
    if (!k || k.userId !== s.userId) continue;
    try {
      const r = await verifyAssertionForChallenge({
        challenge: recoveryChallenge(approval, s.voteNonce),
        assertion: s.assertion,
        key: pin(k),
      });
      if (r.ok) valid++;
    } catch {
      /* invalid signature, not counted */
    }
  }
  return valid;
}

async function serializeRecoveryApproval(db, approval) {
  const [signatures, users] = await Promise.all([
    db.recoveryApprovalSignature.findMany({
      where: { approvalId: approval.id },
      select: { userId: true },
    }),
    db.user.findMany({
      where: { id: { in: approval.approverIds } },
      select: { id: true, name: true, nickname: true, avatar: true },
    }),
  ]);
  return {
    id: approval.id,
    teamId: approval.teamId,
    requesterId: approval.requesterId,
    status: approval.status,
    threshold: approval.threshold,
    expiresAt: approval.expiresAt,
    approvers: users,
    signedIds: signatures.map((s) => s.userId),
  };
}

module.exports = {
  requiredSignatures,
  getEligibleApproverIds,
  expireStaleRecoveryApprovals,
  hasPasskey,
  issueRecoveryChallenge,
  recordRecoverySignature,
  countValidSignatures,
  serializeRecoveryApproval,
  APPROVED_TTL_MS,
  OPEN_TTL_MS,
};
