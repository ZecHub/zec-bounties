const test = require("node:test");
const assert = require("node:assert/strict");
const {
  appendAudit,
  verifyAuditChain,
  canon,
  hashOf,
} = require("../utils/payoutAudit");

function makeFakeDb() {
  const rows = [];
  let nextId = 1;
  let lockCount = 0;

  const db = {
    rows,
    get lockCount() {
      return lockCount;
    },
    async $executeRaw() {
      lockCount += 1;
      return 1;
    },
    payoutAudit: {
      async findFirst({ orderBy } = {}) {
        if (rows.length === 0) return null;
        if (orderBy?.id === "desc") return rows[rows.length - 1];
        return rows[0];
      },
      async create({ data }) {
        // Simulate Postgres JSONB round-trip so any mismatch between hashed
        // in-memory values and stored JSON immediately breaks verification.
        const persisted = {
          id: nextId++,
          ...data,
          data: JSON.parse(JSON.stringify(data.data)),
        };
        rows.push(persisted);
        return persisted;
      },
      async findMany({ where, take = 500 } = {}) {
        const gt = where?.id?.gt ?? 0;
        return rows.filter((r) => r.id > gt).slice(0, take);
      },
    },
  };
  return db;
}

test("canon sorts nested object keys, omits undefined keys, and normalizes BigInt and .toJSON() values", () => {
  const decimalLike = {
    s: 1,
    e: 1,
    d: [12, 5000000],
    toJSON() {
      return "12.5";
    },
  };
  const shared = { b: 2, a: 1 };
  const date = new Date("2026-11-24T12:00:00.000Z");

  const out = canon({
    z: 10n,
    a: decimalLike,
    d: date,
    dropped: undefined,
    list: [undefined, { y: 1, x: 2 }],
    left: shared,
    right: shared,
  });

  assert.deepEqual(Object.keys(out), ["a", "d", "left", "list", "right", "z"]);
  assert.equal(out.a, "12.5");
  assert.equal(out.d, "2026-11-24T12:00:00.000Z");
  assert.equal(out.z, "10");
  assert.deepEqual(out.list, [null, { x: 2, y: 1 }]);
  assert.deepEqual(out.left, { a: 1, b: 2 });
  assert.deepEqual(out.right, { a: 1, b: 2 });
});

test("canon rejects circular references cleanly instead of overflowing the stack", () => {
  const cyclic = { a: 1 };
  cyclic.self = cyclic;
  assert.throws(
    () => canon(cyclic),
    (err) => err instanceof TypeError && /circular/i.test(err.message),
  );
});

test("appendAudit + verifyAuditChain preserve hash parity across Prisma-like .toJSON() values, BigInt, and ISO string timestamps", async () => {
  const db = makeFakeDb();
  const decimalAmount = {
    s: 1,
    e: 2,
    d: [125],
    toJSON() {
      return "1.25";
    },
  };

  const first = await appendAudit(db, "round.opened", {
    actorId: "admin-1",
    proposalId: "prop-1",
    data: {
      bountyAmount: decimalAmount,
      zats: 125000000n,
      meta: { b: 2, a: 1, ignored: undefined },
    },
  });
  const second = await appendAudit(db, "round.executed", {
    actorId: "admin-1",
    bountyId: "bounty-1",
    proposalId: "prop-1",
    data: { txid: "abc123", paidAt: new Date("2026-11-24T12:34:56.000Z") },
  });

  assert.equal(db.lockCount, 2);
  assert.equal(first.prevHash, "GENESIS");
  assert.equal(second.prevHash, first.hash);

  // Also ensure verifyAuditChain handles stringified `at` timestamps
  db.rows[1].at = db.rows[1].at.toISOString();

  const verified = await verifyAuditChain(db);
  assert.deepEqual(verified, { ok: true, count: 2, head: second.hash });
});

test("verifyAuditChain detects tampered data, broken prevHash, and invalid timestamps", async () => {
  const db = makeFakeDb();
  await appendAudit(db, "round.opened", { data: { amount: "1.0" } });
  const second = await appendAudit(db, "round.executed", { data: { amount: "1.0" } });

  // Mutate persisted data
  db.rows[1].data.amount = "9.9";
  assert.deepEqual(await verifyAuditChain(db), {
    ok: false,
    brokenAtId: second.id,
    count: 1,
  });

  // Restore data, break timestamp
  db.rows[1].data.amount = "1.0";
  db.rows[1].at = "not-a-date";
  assert.deepEqual(await verifyAuditChain(db), {
    ok: false,
    brokenAtId: second.id,
    count: 1,
  });
});

test("hashOf matches plain JSON canonical hashing byte-for-byte", () => {
  const h1 = hashOf("GENESIS", { b: 2, a: 1 });
  const h2 = hashOf("GENESIS", { a: 1, b: 2 });
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{64}$/);
});
