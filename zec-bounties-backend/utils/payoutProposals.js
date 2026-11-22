// utils/payoutProposals.js
// Executor-vote payouts with signed votes, for BATCHES of bounties. Approvers vote
// (passkey-signed) on WHICH approver processes a batch. The batch's payees and
// addresses are locked when the round opens. authorize-payment is the execute step and
// re-verifies every signature before it lets the chosen executor pay the whole batch.
const { itemsOf, verifyVoteAssertion } = require("./payoutPasskeys");
const { appendAudit } = require("./payoutAudit");
const { sendMailIfEnabled, sendPushToOptedIn } = require("./bountyHelpers");

// Matching votes needed before a round is DECIDED.
const PAYOUT_THRESHOLD = Number(process.env.PAYOUT_THRESHOLD || 3);
// After DECIDED the executor can't send until this passes; any approver can cancel meanwhile.
const PAYOUT_DELAY_MS =
  Number(process.env.PAYOUT_DELAY_MINUTES ?? 30) * 60 * 1000;

const toZat = (amount) => BigInt(Math.round(Number(amount) * 1e8));

const addressFor = (user, chain) =>
  chain === "MAIN" ? user?.UA_address : user?.z_address;

// The locked item for one bounty inside a round.
const itemFor = (round, bountyId) =>
  itemsOf(round).find((i) => i.bountyId === bountyId);

// userIds with payout control. Platform rounds: global admins.
// Team rounds: global admins + team OWNER/ADMIN members (same rule as requireTeamAdmin).
async function getEligibleApprovers(db, teamId) {
  const admins = await db.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  const ids = new Set(admins.map((a) => a.id));
  if (teamId) {
    const members = await db.teamMember.findMany({
      where: { teamId, role: { in: ["OWNER", "ADMIN"] } },
      select: { userId: true },
    });
    members.forEach((m) => ids.add(m.userId));
  }
  return [...ids];
}

async function isApprover(db, user) {
  if (user.role === "ADMIN") return true;
  const m = await db.teamMember.findFirst({
    where: { userId: user.id, role: { in: ["OWNER", "ADMIN"] } },
    select: { teamId: true },
  });
  return Boolean(m);
}

// Everyone whose payouts this user's approver status touches (for notices and key vetoes).
async function getColleagueApprovers(db, user) {
  const set = new Set(
    (
      await db.user.findMany({ where: { role: "ADMIN" }, select: { id: true } })
    ).map((a) => a.id),
  );
  const teamIds =
    user.role === "ADMIN"
      ? undefined // a global admin votes on every team's rounds
      : (
          await db.teamMember.findMany({
            where: { userId: user.id, role: { in: ["OWNER", "ADMIN"] } },
            select: { teamId: true },
          })
        ).map((m) => m.teamId);
  const members = await db.teamMember.findMany({
    where: {
      role: { in: ["OWNER", "ADMIN"] },
      ...(teamIds && { teamId: { in: teamIds } }),
    },
    select: { userId: true },
  });
  members.forEach((m) => set.add(m.userId));
  set.delete(user.id);
  return [...set];
}

// Approvers who hold an ACTIVE passkey right now, with their key material pinned.
// Stored on the round at creation: only these people can vote or be chosen.
async function snapshotApprovers(db, teamId) {
  const eligible = await getEligibleApprovers(db, teamId);
  const keys = await db.approverKey.findMany({
    where: {
      userId: { in: eligible },
      revokedAt: null,
      activatesAt: { lte: new Date() },
    },
  });
  const snap = {};
  for (const k of keys) {
    (snap[k.userId] ||= []).push({
      id: k.id,
      credentialId: k.credentialId,
      publicKey: Buffer.from(k.publicKey).toString("base64url"),
      transports: k.transports,
    });
  }
  return snap;
}

// Counts votes per candidate by RE-VERIFYING every stored signature against the keys
// pinned on the round. A row in the database is worth nothing without a valid signature.
async function verifiedTally(db, round) {
  const snap = round.approverKeys || {};
  const votes = await db.payoutVote.findMany({
    where: { proposalId: round.id },
  });
  const eligibleNow = new Set(await getEligibleApprovers(db, round.teamId));
  const keyIds = Object.values(snap)
    .flat()
    .map((k) => k.id);
  const revoked = new Set(
    (
      await db.approverKey.findMany({
        where: { id: { in: keyIds }, revokedAt: { not: null } },
        select: { id: true },
      })
    ).map((k) => k.id),
  );

  const counts = new Map();
  for (const v of votes) {
    if (!snap[v.signerId] || !snap[v.candidateId]) continue; // both must be snapshot approvers
    if (!eligibleNow.has(v.signerId)) continue; // lost payout rights since voting
    const key = snap[v.signerId].find((k) => k.id === v.keyId);
    if (!key || revoked.has(key.id)) continue;
    try {
      const r = await verifyVoteAssertion({
        round,
        candidateId: v.candidateId,
        voteNonce: v.voteNonce,
        assertion: v.assertion,
        key,
      });
      if (!r.ok) continue;
    } catch {
      continue;
    }
    counts.set(v.candidateId, (counts.get(v.candidateId) || 0) + 1);
  }
  return [...counts].map(([candidateId, n]) => ({ candidateId, votes: n }));
}

// Pre-flight for authorize-payment. `bounties` must be full bounty rows including
// assigneeUser with z_address and UA_address. `userId` is the person pressing the button.
// A DECIDED round is paid AS A WHOLE: if any bounty of its batch is missing from
// `bounties`, none of them is usable.
// Returns Map(bountyId -> DECIDED round this user may execute) and
// Map(bountyId -> reason) for bounties this user can't pay.
async function loadDecidedProposals(db, bounties, userId) {
  const byId = new Map(bounties.map((b) => [b.id, b]));
  const proposals = await db.payoutProposal.findMany({
    where: { bountyIds: { hasSome: [...byId.keys()] }, status: "DECIDED" },
  });
  const usable = new Map();
  const rejected = new Map();
  const reject = (p, reason) => {
    for (const id of p.bountyIds) if (byId.has(id)) rejected.set(id, reason);
  };

  for (const p of proposals) {
    if (p.executorId !== userId) {
      reject(p, "This payout was assigned to another admin");
      continue;
    }
    if (p.executableAt && p.executableAt.getTime() > Date.now()) {
      reject(p, `Payout unlocks at ${p.executableAt.toISOString()}`);
      continue;
    }

    const items = itemsOf(p);
    if (items.some((i) => !byId.has(i.bountyId))) {
      reject(
        p,
        "This payout is a batch; select and pay all of its bounties together",
      );
      continue;
    }

    const eligibleNow = await getEligibleApprovers(db, p.teamId);
    const tally = await verifiedTally(db, p);
    const signed =
      tally.find((t) => t.candidateId === p.executorId)?.votes ?? 0;

    const itemsMatch = items.every((i) => {
      const b = byId.get(i.bountyId);
      return (
        b.assigneeUser?.id === i.payeeId &&
        addressFor(b.assigneeUser, b.chain) === i.recipient &&
        toZat(b.bountyAmount) === BigInt(i.amountZat) &&
        b.chain === p.chain &&
        (b.teamId ?? null) === (p.teamId ?? null)
      );
    });

    const matches =
      items.length > 0 &&
      eligibleNow.includes(p.executorId) &&
      Boolean((p.approverKeys || {})[p.executorId]) &&
      itemsMatch &&
      signed >= p.threshold;

    if (matches) for (const i of items) usable.set(i.bountyId, p);
    else
      reject(
        p,
        "Approved payout no longer matches its bounties or approvers; open a new round",
      );
  }
  return { usable, rejected };
}

// Call INSIDE the claim transaction, right after the paymentInFlight compare-and-swap.
// `proposals` may contain the same round several times (one per bounty); it is deduped.
// DECIDED -> EXECUTED (only for the chosen executor) is its own compare-and-swap,
// so a round can fund exactly one send, by exactly one person.
async function consumeProposals(tx, proposals, conflict, userId) {
  const unique = [...new Map(proposals.map((p) => [p.id, p])).values()];
  const { count } = await tx.payoutProposal.updateMany({
    where: {
      id: { in: unique.map((p) => p.id) },
      status: "DECIDED",
      executorId: userId,
    },
    data: { status: "EXECUTED", executedAt: new Date() },
  });
  if (count !== unique.length) throw conflict;
  for (const p of unique) {
    await appendAudit(tx, "round.executed", {
      actorId: userId,
      proposalId: p.id,
      data: {
        executorId: p.executorId,
        chain: p.chain,
        bountyIds: p.bountyIds,
        items: itemsOf(p),
      },
    });
  }
}

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

// Security notices go to every listed approver regardless of their notification
// preferences. Never throws.
async function notifyApprovers(db, userIds, { subject, text, url = "/" }) {
  try {
    if (!userIds.length) return;
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, pushNotifications: true },
    });
    await Promise.all([
      sendPushToOptedIn(
        users.filter((u) => u.pushNotifications).map((u) => u.id),
        {
          title: subject,
          body: text,
          url,
        },
      ),
      ...users
        .filter((u) => u.email)
        .map((u) =>
          sendMailIfEnabled({
            to: u.email,
            subject,
            text,
            html: `<p>${esc(text)}</p>`,
          }),
        ),
    ]);
  } catch (err) {
    console.error("payout notification failed:", err);
  }
}

module.exports = {
  PAYOUT_THRESHOLD,
  PAYOUT_DELAY_MS,
  toZat,
  addressFor,
  itemFor,
  getEligibleApprovers,
  isApprover,
  getColleagueApprovers,
  snapshotApprovers,
  verifiedTally,
  loadDecidedProposals,
  consumeProposals,
  notifyApprovers,
};
