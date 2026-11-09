// utils/payoutAudit.js
// Append-only, hash-chained audit log for payout events. Each entry commits to the
// previous one, so editing or deleting history breaks the chain. Publish the head
// hash somewhere outside the server (email it, pin it) to make tampering detectable.
const crypto = require("crypto");

const LOCK_KEY = 7203001; // advisory lock serialising appends

const canon = (v) =>
  Array.isArray(v)
    ? v.map(canon)
    : v && typeof v === "object" && !(v instanceof Date)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canon(v[k])]),
        )
      : v;

const hashOf = (prevHash, entry) =>
  crypto
    .createHash("sha256")
    .update(prevHash + JSON.stringify(canon(entry)))
    .digest("hex");

// Call inside a transaction, as the LAST write, so the advisory lock is held briefly.
// `data` must be JSON-safe (stringify BigInt).
async function appendAudit(
  tx,
  event,
  { actorId = null, bountyId = null, proposalId = null, data = {} } = {},
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_KEY})`;
  const last = await tx.payoutAudit.findFirst({ orderBy: { id: "desc" } });
  const prevHash = last?.hash ?? "GENESIS";
  const at = new Date();
  const hash = hashOf(prevHash, {
    at: at.toISOString(),
    event,
    actorId,
    bountyId,
    proposalId,
    data,
  });
  return tx.payoutAudit.create({
    data: { at, event, actorId, bountyId, proposalId, data, prevHash, hash },
  });
}

async function verifyAuditChain(db) {
  let prev = "GENESIS";
  let count = 0;
  let cursor = 0;
  for (;;) {
    const rows = await db.payoutAudit.findMany({
      where: { id: { gt: cursor } },
      orderBy: { id: "asc" },
      take: 500,
    });
    if (rows.length === 0) break;
    for (const e of rows) {
      const expected = hashOf(prev, {
        at: e.at.toISOString(),
        event: e.event,
        actorId: e.actorId,
        bountyId: e.bountyId,
        proposalId: e.proposalId,
        data: e.data,
      });
      if (e.prevHash !== prev || e.hash !== expected)
        return { ok: false, brokenAtId: e.id, count };
      prev = e.hash;
      count += 1;
      cursor = e.id;
    }
  }
  return { ok: true, count, head: prev };
}

module.exports = { appendAudit, verifyAuditChain, canon, hashOf };
