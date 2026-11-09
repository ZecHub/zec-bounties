// routes/payoutKeys.routes.js  (mount at /api/payout-keys)
// Passkey enrollment for payout approvers. A new key is PENDING for
// PAYOUT_KEY_DELAY_HOURS (default 72) before it can vote; every colleague approver is
// notified on enrollment and can revoke a pending key during that window.
const express = require("express");
const prisma = require("../prisma/client");
const { authenticate } = require("../middleware/auth");
const { appendAudit } = require("../utils/payoutAudit");
const {
  registrationOptions,
  verifyRegistration,
  KEY_DELAY_MS,
} = require("../utils/payoutPasskeys");
const {
  PAYOUT_THRESHOLD,
  isApprover,
  getColleagueApprovers,
  notifyApprovers,
} = require("../utils/payoutProposals");

const router = express.Router();

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const who = (u) => u?.nickname || u?.name || "An approver";
const present = (k) => ({
  id: k.id,
  label: k.label,
  createdAt: k.createdAt,
  activatesAt: k.activatesAt,
  revokedAt: k.revokedAt,
  ...(k.user && { user: k.user }),
});

// Bootstrap rule (no env flag, no restart): until the first payout round has ever been
// opened AND while fewer than PAYOUT_THRESHOLD approvers hold a key, nobody can reach
// quorum, so new keys activate immediately. After that the review delay always applies.
// It closes by itself once enough approvers have enrolled.
async function activationTime(db) {
  if ((await db.payoutProposal.count()) === 0) {
    const holders = await db.approverKey.groupBy({
      by: ["userId"],
      where: { revokedAt: null },
    });
    if (holders.length < PAYOUT_THRESHOLD)
      return { at: new Date(), bootstrap: true };
  }
  return { at: new Date(Date.now() + KEY_DELAY_MS), bootstrap: false };
}

async function requireApprover(user) {
  if (!(await isApprover(prisma, user)))
    throw httpError(403, "Only payout approvers can register passkeys");
}

// My keys, plus other approvers' still-pending keys (so you can veto a suspicious one)
router.get(
  "/",
  authenticate,
  wrap(async (req, res) => {
    await requireApprover(req.user);
    const mine = await prisma.approverKey.findMany({
      where: { userId: req.user.id, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
    const colleagues = await getColleagueApprovers(prisma, req.user);
    const pending = await prisma.approverKey.findMany({
      where: {
        userId: { in: colleagues },
        revokedAt: null,
        activatesAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, name: true, nickname: true } } },
    });
    res.json({ mine: mine.map(present), pending: pending.map(present) });
  }),
);

router.post(
  "/register/options",
  authenticate,
  wrap(async (req, res) => {
    await requireApprover(req.user);
    const existing = await prisma.approverKey.findMany({
      where: { userId: req.user.id, revokedAt: null },
    });
    const options = await registrationOptions(req.user, existing);
    await prisma.payoutChallenge.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    const row = await prisma.payoutChallenge.create({
      data: {
        userId: req.user.id,
        kind: "reg",
        challenge: options.challenge,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
    res.json({ challengeId: row.id, options });
  }),
);

router.post(
  "/register/verify",
  authenticate,
  wrap(async (req, res) => {
    await requireApprover(req.user);
    const { challengeId, response, label } = req.body;
    if (typeof challengeId !== "string" || !response)
      throw httpError(400, "challengeId and response required");

    const row = await prisma.payoutChallenge.findFirst({
      where: {
        id: challengeId,
        userId: req.user.id,
        kind: "reg",
        expiresAt: { gt: new Date() },
      },
    });
    if (!row) throw httpError(400, "Registration expired; try again");
    const used = await prisma.payoutChallenge.deleteMany({
      where: { id: row.id },
    });
    if (used.count !== 1) throw httpError(400, "Registration already used");

    const credential = await verifyRegistration(response, row.challenge);
    const { at: activatesAt, bootstrap } = await activationTime(prisma);

    const key = await prisma.$transaction(async (tx) => {
      const k = await tx.approverKey.create({
        data: {
          userId: req.user.id,
          credentialId: credential.id,
          publicKey: Buffer.from(credential.publicKey),
          counter: credential.counter ?? 0,
          transports: credential.transports ?? [],
          label:
            typeof label === "string"
              ? label.trim().slice(0, 60) || null
              : null,
          activatesAt,
        },
      });
      await appendAudit(tx, "key.enrolled", {
        actorId: req.user.id,
        data: {
          keyId: k.id,
          activatesAt: activatesAt.toISOString(),
          bootstrap,
        },
      });
      return k;
    });

    const colleagues = await getColleagueApprovers(prisma, req.user);
    await notifyApprovers(prisma, colleagues, {
      subject: "New payout approver passkey",
      text: `${who(req.user)} registered a passkey for payout approvals. It activates ${activatesAt.toISOString()}. If you don't recognise this, revoke it from the payouts panel before then.`,
    });

    res.status(201).json(present(key));
  }),
);

// Revoke: the owner any time; another approver only while the key is still pending.
router.delete(
  "/:id",
  authenticate,
  wrap(async (req, res) => {
    await requireApprover(req.user);
    const key = await prisma.approverKey.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, name: true, nickname: true, role: true } },
      },
    });
    if (!key || key.revokedAt) throw httpError(404, "Key not found");

    const own = key.userId === req.user.id;
    if (!own) {
      const colleagues = await getColleagueApprovers(prisma, req.user);
      if (!colleagues.includes(key.userId)) throw httpError(403, "Not allowed");
      if (key.activatesAt <= new Date())
        throw httpError(
          403,
          "Only pending passkeys can be revoked by another approver",
        );
    }

    await prisma.$transaction(async (tx) => {
      await tx.approverKey.update({
        where: { id: key.id },
        data: { revokedAt: new Date(), revokedById: req.user.id },
      });
      await appendAudit(tx, "key.revoked", {
        actorId: req.user.id,
        data: { keyId: key.id, ownerId: key.userId, own },
      });
    });

    const colleagues = await getColleagueApprovers(prisma, key.user);
    await notifyApprovers(
      prisma,
      colleagues.filter((id) => id !== req.user.id),
      {
        subject: "Payout approver passkey revoked",
        text: `${who(req.user)} revoked ${own ? "their own" : `${who(key.user)}'s`} payout approval passkey.`,
      },
    );

    res.json({ success: true });
  }),
);

router.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  if (err.code === "P2002")
    return res
      .status(409)
      .json({ error: "That passkey is already registered" });
  console.error("payout-keys error:", err);
  res.status(500).json({ error: "Passkey request failed (see server log)" });
});

module.exports = router;
