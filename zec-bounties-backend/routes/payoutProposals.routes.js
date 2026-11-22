// routes/payoutProposals.routes.js  (mount at /api/payout-proposals)
// ONE round pays a BATCH of bounties. Approvers vote (passkey-signed) on WHICH approver
// processes the whole batch; a round is DECIDED when one person reaches the threshold.
// Sending is done by authorize-payment, which re-verifies every signature and only lets
// the chosen person pay the batch (see utils/payoutProposals.js).
// Assumes PostgreSQL (SELECT ... FOR UPDATE, advisory locks) and CommonJS.
const express = require("express");
const crypto = require("crypto");
const { Prisma } = require("@prisma/client");
const prisma = require("../prisma/client");
const { authenticate } = require("../middleware/auth");
const { invalidateBounty } = require("../utils/bountyHelpers");
const { sendRealtimeUpdate } = require("../middleware/websocket");
const { appendAudit, verifyAuditChain } = require("../utils/payoutAudit");
const {
  RP_ID,
  itemsOf,
  totalZatOf,
  voteMessage,
  voteChallenge,
  verifyVoteAssertion,
} = require("../utils/payoutPasskeys");
const {
  PAYOUT_THRESHOLD,
  PAYOUT_DELAY_MS,
  toZat,
  addressFor,
  getEligibleApprovers,
  snapshotApprovers,
  verifiedTally,
  notifyApprovers,
} = require("../utils/payoutProposals");

const router = express.Router();
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BATCH = 50;

function httpError(status, message, details) {
  const e = new Error(message);
  e.status = status;
  e.details = details;
  return e;
}
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const who = (u) => u?.nickname || u?.name || "An approver";
const zec = (zat) => Number(zat) / 1e8;
const invalidateAll = (ids) =>
  Promise.all(ids.map((id) => invalidateBounty(id)));

async function lockProposal(tx, id) {
  const rows =
    await tx.$queryRaw`SELECT * FROM "PayoutProposal" WHERE id = ${id} FOR UPDATE`;
  if (!rows.length) throw httpError(404, "Proposal not found");
  return rows[0];
}

// Public shape of a round for an approver. Never exposes nonces, pinned keys or assertions.
async function present(db, p, userId) {
  const { approverKeys, nonce, votes, items, ...rest } = p;
  const sorted = itemsOf(p);
  const ids = Object.keys(approverKeys || {});
  return {
    ...rest,
    items: sorted,
    totalZat: Number(totalZatOf(sorted)),
    approverIds: ids,
    canVote: Boolean(approverKeys?.[userId]),
    candidates: await db.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, nickname: true, avatar: true },
    }),
    tally: await verifiedTally(db, p), // signatures re-verified, not just counted
    myVote:
      (votes || []).find((v) => v.signerId === userId)?.candidateId ?? null,
  };
}

const notifyRealtime = async (out, status) => {
  const recipients = await getEligibleApprovers(prisma, out.teamId ?? null);
  sendRealtimeUpdate(
    "payout_proposal_updated",
    {
      id: out.id,
      bountyIds: out.bountyIds,
      status,
      ...(out.tally && { tally: out.tally }),
    },
    null,
    recipients,
  );
};

const describe = (items) => {
  const lines = items
    .slice(0, 5)
    .map((i) => `${zec(i.amountZat)} ZEC to ${i.recipient}`)
    .join("; ");
  return `${items.length} bount${items.length === 1 ? "y" : "ies"}, ${zec(totalZatOf(items))} ZEC in total (${lines}${items.length > 5 ? `; and ${items.length - 5} more` : ""})`;
};

// ─── Named routes first (before /:id) ───────────────────────────────────────

// Open ONE round for a batch of bounties. Locks each payee + address, snapshots the
// approvers and their passkeys. Bounties that can't be included come back in `skipped`.
router.post(
  "/",
  authenticate,
  wrap(async (req, res) => {
    const { bountyIds } = req.body;
    if (
      !Array.isArray(bountyIds) ||
      bountyIds.length === 0 ||
      bountyIds.length > MAX_BATCH ||
      bountyIds.some((x) => typeof x !== "string")
    )
      throw httpError(400, `bountyIds must be 1 to ${MAX_BATCH} bounty ids`);
    const ids = [...new Set(bountyIds)].sort();

    const out = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Bounty" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
      const bounties = await tx.bounty.findMany({
        where: { id: { in: ids } },
        include: {
          assigneeUser: {
            select: { id: true, z_address: true, UA_address: true },
          },
        },
      });
      const byId = new Map(bounties.map((b) => [b.id, b]));

      const taken = await tx.payoutProposal.findMany({
        where: {
          bountyIds: { hasSome: ids },
          status: { in: ["OPEN", "DECIDED", "EXECUTED"] },
        },
        select: { bountyIds: true },
      });
      const takenIds = new Set(taken.flatMap((t) => t.bountyIds));

      const picked = [];
      const skipped = [];
      for (const id of ids) {
        const b = byId.get(id);
        const skip = (reason) => skipped.push({ id, title: b?.title, reason });
        if (!b) skip("Bounty not found");
        else if (
          b.status !== "DONE" ||
          !b.isApproved ||
          b.isPaid ||
          b.paymentInFlight ||
          b.exportedAt
        )
          skip("Not payable");
        else if (takenIds.has(id)) skip("Already in a payout round");
        else if (!addressFor(b.assigneeUser, b.chain))
          skip("Assignee has no payout address");
        else picked.push(b);
      }
      if (picked.length === 0)
        throw httpError(409, "None of the selected bounties can be paid", {
          skipped,
        });

      // One wallet, one chain, one approver pool per batch
      const chains = new Set(picked.map((b) => b.chain));
      const teams = new Set(picked.map((b) => b.teamId ?? null));
      if (chains.size > 1 || teams.size > 1)
        throw httpError(
          400,
          "A round must cover a single chain and a single team",
        );
      const teamId = [...teams][0];
      const chain = [...chains][0];

      const snap = await snapshotApprovers(tx, teamId);
      const approverIds = Object.keys(snap);
      if (!snap[req.user.id])
        throw httpError(
          403,
          "You need an active payout passkey to open a round",
        );
      if (approverIds.length < PAYOUT_THRESHOLD)
        throw httpError(
          400,
          `Not enough approvers have an active passkey (${approverIds.length}/${PAYOUT_THRESHOLD})`,
        );

      const items = picked.map((b) => ({
        bountyId: b.id,
        payeeId: b.assigneeUser.id,
        recipient: addressFor(b.assigneeUser, b.chain),
        amountZat: toZat(b.bountyAmount).toString(),
      }));

      const proposal = await tx.payoutProposal.create({
        data: {
          teamId,
          createdById: req.user.id,
          chain,
          threshold: PAYOUT_THRESHOLD,
          nonce: crypto.randomBytes(16).toString("hex"),
          items,
          bountyIds: items.map((i) => i.bountyId),
          approverKeys: snap,
          status: "OPEN",
          expiresAt: new Date(Date.now() + EXPIRY_MS),
        },
      });
      await appendAudit(tx, "round.opened", {
        actorId: req.user.id,
        proposalId: proposal.id,
        data: {
          chain,
          teamId,
          totalZat: totalZatOf(items),
          items,
          approvers: approverIds,
          keys: Object.values(snap)
            .flat()
            .map((k) => k.id),
        },
      });
      return { proposal, items, skipped, approverIds };
    });

    await invalidateAll(out.proposal.bountyIds);
    await notifyRealtime(
      {
        id: out.proposal.id,
        bountyIds: out.proposal.bountyIds,
        teamId: out.proposal.teamId,
      },
      "OPEN",
    );
    await notifyApprovers(
      prisma,
      out.approverIds.filter((id) => id !== req.user.id),
      {
        subject: "Payout round opened",
        text: `${who(req.user)} opened a payout round for ${describe(out.items)}. Open the payouts panel to choose who processes it.`,
      },
    );
    res
      .status(201)
      .json({
        id: out.proposal.id,
        status: out.proposal.status,
        skipped: out.skipped,
      });
  }),
);

// Rounds touching a set of bounties (approvers only): ?bountyIds=a,b,c (max 100)
router.get(
  "/",
  authenticate,
  wrap(async (req, res) => {
    const bountyIds = String(req.query.bountyIds || "")
      .split(",")
      .filter(Boolean)
      .slice(0, 100);
    if (!bountyIds.length) return res.json([]);

    const proposals = await prisma.payoutProposal.findMany({
      where: {
        bountyIds: { hasSome: bountyIds },
        status: { in: ["OPEN", "DECIDED", "EXECUTED"] },
      },
      include: { votes: true },
    });

    const eligibleByTeam = new Map();
    const out = [];
    for (const p of proposals) {
      const key = p.teamId ?? "platform";
      if (!eligibleByTeam.has(key))
        eligibleByTeam.set(key, await getEligibleApprovers(prisma, p.teamId));
      if (!eligibleByTeam.get(key).includes(req.user.id)) continue;
      out.push(await present(prisma, p, req.user.id));
    }
    res.json(out);
  }),
);

// Verifies the audit hash chain (global admin). Publish `head` somewhere off-server.
router.get(
  "/audit/verify",
  authenticate,
  wrap(async (req, res) => {
    if (req.user.role !== "ADMIN")
      throw httpError(403, "Admin access required");
    res.json(await verifyAuditChain(prisma));
  }),
);

// ─── /:id routes ────────────────────────────────────────────────────────────

router.get(
  "/:id",
  authenticate,
  wrap(async (req, res) => {
    const p = await prisma.payoutProposal.findUnique({
      where: { id: req.params.id },
      include: { votes: true },
    });
    if (!p) throw httpError(404, "Proposal not found");
    if (!(await getEligibleApprovers(prisma, p.teamId)).includes(req.user.id))
      throw httpError(403, "Not authorized");
    res.json(await present(prisma, p, req.user.id));
  }),
);

// Step 1 of voting: the server builds the exact message to be signed (the full batch).
// The client recomputes its hash, shows the details, and has the passkey sign that hash.
router.post(
  "/:id/vote/options",
  authenticate,
  wrap(async (req, res) => {
    const { candidateId } = req.body;
    if (typeof candidateId !== "string")
      throw httpError(400, "candidateId required");

    const p = await prisma.payoutProposal.findUnique({
      where: { id: req.params.id },
    });
    if (!p) throw httpError(404, "Proposal not found");
    if (p.status !== "OPEN") throw httpError(409, `Round is ${p.status}`);
    if (p.expiresAt < new Date()) throw httpError(409, "Round expired");

    const snap = p.approverKeys || {};
    if (!snap[req.user.id])
      throw httpError(403, "You had no active passkey when this round opened");
    if (!snap[candidateId])
      throw httpError(400, "Choose one of the round's approvers");
    if (!(await getEligibleApprovers(prisma, p.teamId)).includes(req.user.id))
      throw httpError(403, "Not authorized to vote on payouts");

    const voteNonce = crypto.randomBytes(16).toString("hex");
    const challenge = voteChallenge(p, candidateId, voteNonce);
    await prisma.payoutChallenge.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    const row = await prisma.payoutChallenge.create({
      data: {
        userId: req.user.id,
        kind: "vote",
        proposalId: p.id,
        candidateId,
        voteNonce,
        challenge,
        expiresAt: new Date(Date.now() + 2 * 60 * 1000),
      },
    });

    res.json({
      challengeId: row.id,
      message: voteMessage(p, candidateId, voteNonce),
      options: {
        challenge,
        rpId: RP_ID,
        timeout: 60000,
        userVerification: "required",
        allowCredentials: snap[req.user.id].map((k) => ({
          id: k.credentialId,
          type: "public-key",
          transports: k.transports,
        })),
      },
    });
  }),
);

// Step 2: verify the passkey signature, store it, and decide the round if a
// candidate now has threshold VERIFIED votes.
router.post(
  "/:id/vote",
  authenticate,
  wrap(async (req, res) => {
    const { challengeId, assertion } = req.body;
    if (typeof challengeId !== "string" || !assertion)
      throw httpError(400, "challengeId and assertion required");

    const out = await prisma.$transaction(async (tx) => {
      const p = await lockProposal(tx, req.params.id);
      if (p.status !== "OPEN") throw httpError(409, `Round is ${p.status}`);

      // Return (don't throw) so the EXPIRED update commits instead of rolling back
      if (new Date(p.expiresAt) < new Date()) {
        await tx.payoutProposal.update({
          where: { id: p.id },
          data: { status: "EXPIRED" },
        });
        return {
          expired: true,
          id: p.id,
          bountyIds: p.bountyIds,
          teamId: p.teamId,
        };
      }

      const ch = await tx.payoutChallenge.findFirst({
        where: {
          id: challengeId,
          userId: req.user.id,
          kind: "vote",
          proposalId: p.id,
          expiresAt: { gt: new Date() },
        },
      });
      if (!ch) throw httpError(400, "Vote request expired; try again");
      const used = await tx.payoutChallenge.deleteMany({
        where: { id: ch.id },
      });
      if (used.count !== 1) throw httpError(400, "Vote request already used");

      const snap = p.approverKeys || {};
      if (!snap[req.user.id])
        throw httpError(
          403,
          "You had no active passkey when this round opened",
        );
      if (!(await getEligibleApprovers(tx, p.teamId)).includes(req.user.id))
        throw httpError(403, "Not authorized to vote on payouts");

      const pinned = snap[req.user.id].find(
        (k) => k.credentialId === assertion.id,
      );
      if (!pinned)
        throw httpError(
          400,
          "That passkey is not one of your active keys for this round",
        );
      const keyRow = await tx.approverKey.findUnique({
        where: { id: pinned.id },
      });
      if (!keyRow || keyRow.revokedAt)
        throw httpError(400, "That passkey has been revoked");

      let result;
      try {
        result = await verifyVoteAssertion({
          round: p,
          candidateId: ch.candidateId,
          voteNonce: ch.voteNonce,
          assertion,
          key: pinned,
          counter: keyRow.counter,
        });
      } catch (e) {
        throw httpError(400, "Passkey signature rejected");
      }
      if (!result.ok) throw httpError(400, "Passkey signature rejected");

      await tx.approverKey.update({
        where: { id: keyRow.id },
        data: { counter: Math.max(keyRow.counter, result.newCounter) },
      });
      await tx.payoutVote.upsert({
        where: {
          proposalId_signerId: { proposalId: p.id, signerId: req.user.id },
        },
        create: {
          proposalId: p.id,
          signerId: req.user.id,
          candidateId: ch.candidateId,
          voteNonce: ch.voteNonce,
          keyId: pinned.id,
          assertion,
        },
        update: {
          candidateId: ch.candidateId,
          voteNonce: ch.voteNonce,
          keyId: pinned.id,
          assertion,
        },
      });

      const tally = await verifiedTally(tx, p);
      const winner = tally.find((t) => t.votes >= p.threshold);

      let status = "OPEN";
      let executableAt = null;
      if (winner) {
        executableAt = new Date(Date.now() + PAYOUT_DELAY_MS);
        await tx.payoutProposal.update({
          where: { id: p.id },
          data: {
            status: "DECIDED",
            executorId: winner.candidateId,
            decidedAt: new Date(),
            executableAt,
          },
        });
        status = "DECIDED";
      }

      await appendAudit(
        tx,
        status === "DECIDED" ? "round.decided" : "vote.cast",
        {
          actorId: req.user.id,
          proposalId: p.id,
          data: {
            candidateId: ch.candidateId,
            keyId: pinned.id,
            ...(winner && {
              executorId: winner.candidateId,
              executableAt: executableAt.toISOString(),
            }),
          },
        },
      );

      return {
        id: p.id,
        bountyIds: p.bountyIds,
        teamId: p.teamId,
        status,
        tally,
        candidateId: ch.candidateId,
        executorId: winner?.candidateId ?? null,
        executableAt,
        items: itemsOf(p),
        threshold: p.threshold,
        approverIds: Object.keys(snap),
      };
    });

    await invalidateAll(out.bountyIds);
    await notifyRealtime(out, out.expired ? "EXPIRED" : out.status);
    if (out.expired) throw httpError(409, "Proposal expired");

    // Tell the other approvers (names resolved after commit)
    const names = await prisma.user.findMany({
      where: { id: { in: [req.user.id, out.candidateId] } },
      select: { id: true, name: true, nickname: true },
    });
    const nameOf = (id) => who(names.find((u) => u.id === id));
    const others = out.approverIds.filter((id) => id !== req.user.id);
    if (out.status === "DECIDED") {
      await notifyApprovers(prisma, others, {
        subject: "Payout decided",
        text: `${nameOf(out.executorId)} was chosen to process the payout of ${describe(out.items)}. It unlocks ${out.executableAt.toISOString()}. If this looks wrong, cancel the round before then.`,
      });
    } else {
      const n =
        out.tally.find((t) => t.candidateId === out.candidateId)?.votes ?? 0;
      await notifyApprovers(prisma, others, {
        subject: "Payout vote cast",
        text: `${nameOf(req.user.id)} voted for ${nameOf(out.candidateId)} to process a payout of ${out.items.length} bount${out.items.length === 1 ? "y" : "ies"} (${n}/${out.threshold}).`,
      });
    }

    res.json({ status: out.status, tally: out.tally });
  }),
);

// Cancel an OPEN/DECIDED round. Any approver in the round can veto; so can the
// creator or a global admin. EXECUTED rounds can't be cancelled.
router.post(
  "/:id/cancel",
  authenticate,
  wrap(async (req, res) => {
    const out = await prisma.$transaction(async (tx) => {
      const p = await lockProposal(tx, req.params.id);
      if (!["OPEN", "DECIDED"].includes(p.status))
        throw httpError(409, `Round is ${p.status}`);
      const allowed =
        Boolean((p.approverKeys || {})[req.user.id]) ||
        p.createdById === req.user.id ||
        req.user.role === "ADMIN";
      if (!allowed) throw httpError(403, "Not allowed");
      await tx.payoutProposal.update({
        where: { id: p.id },
        data: { status: "CANCELLED", cancelledById: req.user.id },
      });
      await appendAudit(tx, "round.cancelled", {
        actorId: req.user.id,
        proposalId: p.id,
        data: { wasStatus: p.status, bountyIds: p.bountyIds },
      });
      return {
        id: p.id,
        bountyIds: p.bountyIds,
        teamId: p.teamId,
        count: p.bountyIds.length,
        approverIds: Object.keys(p.approverKeys || {}),
      };
    });
    await invalidateAll(out.bountyIds);
    await notifyRealtime(out, "CANCELLED");
    await notifyApprovers(
      prisma,
      out.approverIds.filter((id) => id !== req.user.id),
      {
        subject: "Payout round cancelled",
        text: `${who(req.user)} cancelled a payout round for ${out.count} bount${out.count === 1 ? "y" : "ies"}.`,
      },
    );
    res.json({ status: "CANCELLED" });
  }),
);

router.use((err, req, res, next) => {
  if (err.status)
    return res
      .status(err.status)
      .json({ error: err.message, ...(err.details || {}) });
  if (err.code === "P2002") return res.status(409).json({ error: "Duplicate" });
  // Always answer with JSON so the client can show something useful
  console.error("payout-proposals error:", err);
  res
    .status(500)
    .json({ error: "Payout round request failed (see server log)" });
});

module.exports = router;
