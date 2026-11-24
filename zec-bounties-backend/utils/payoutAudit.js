// utils/payoutAudit.js
// Append-only, hash-chained audit log for payout events. Each entry commits to the
// previous one, so editing or deleting history breaks the chain. Publish the head
// hash somewhere outside the server (email it, pin it) to make tampering detectable.
const crypto = require("crypto");

const LOCK_KEY = 7203001; // advisory lock serialising appends

const canon = (v, seen = new WeakSet()) => {
  if (typeof v === "bigint") return v.toString();
  if (v === null || typeof v !== "object") return v;
  if (seen.has(v)) {
    throw new TypeError("Audit data contains circular reference");
  }
  if (typeof v.toJSON === "function") {
    seen.add(v);
    try {
      return canon(v.toJSON(), seen);
    } finally {
      seen.delete(v);
    }
  }
  seen.add(v);
  try {
    if (Array.isArray(v)) {
      return v.map((item) => (item === undefined ? null : canon(item, seen)));
    }
    const out = {};
    for (const k of Object.keys(v).sort()) {
      if (v[k] !== undefined) {
        out[k] = canon(v[k], seen);
      }
    }
    return out;
  } finally {
    seen.delete(v);
  }
};

const hashOf = (prevHash, entry) =>
  crypto
    .createHash("sha256")
    .update(prevHash + JSON.stringify(canon(entry)))
    .digest("hex");

// Call inside a transaction, as the LAST write, so the advisory lock is held briefly.
// `data` is canonicalised to JSON-safe form (including BigInt and `.toJSON()` values
// such as Prisma.Decimal) so what is persisted matches what was hashed.
async function appendAudit(
  tx,
  event,
  { actorId = null, bountyId = null, proposalId = null, data = {} } = {},
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_KEY})`;
  const last = await tx.payoutAudit.findFirst({ orderBy: { id: "desc" } });
  const prevHash = last?.hash ?? "GENESIS";
  const at = new Date();
  const safeData = canon(data ?? {});
  const hash = hashOf(prevHash, {
    at: at.toISOString(),
    event,
    actorId,
    bountyId,
    proposalId,
    data: safeData,
  });
  return tx.payoutAudit.create({
    data: {
      at,
      event,
      actorId,
      bountyId,
      proposalId,
      data: safeData,
      prevHash,
      hash,
    },
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
      const atDate = e.at instanceof Date ? e.at : new Date(e.at);
      if (Number.isNaN(atDate.getTime())) {
        return { ok: false, brokenAtId: e.id, count };
      }
      const expected = hashOf(prev, {
        at: atDate.toISOString(),
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
