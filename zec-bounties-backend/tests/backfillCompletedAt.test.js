const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  toValidDate,
  resolveCompletedAt,
  main,
} = require("../scripts/backfillCompletedAt");

describe("backfillCompletedAt helpers", () => {
  it("validates date inputs and rejects blank, boolean, null, or invalid values", () => {
    assert.equal(toValidDate(null), null);
    assert.equal(toValidDate(undefined), null);
    assert.equal(toValidDate(true), null);
    assert.equal(toValidDate(false), null);
    assert.equal(toValidDate(""), null);
    assert.equal(toValidDate("   "), null);
    assert.equal(toValidDate("not-a-date"), null);
    assert.equal(toValidDate(new Date("invalid")), null);

    const parsed = toValidDate("2026-06-15T12:00:00.000Z");
    assert.ok(parsed instanceof Date);
    assert.equal(parsed.toISOString(), "2026-06-15T12:00:00.000Z");
  });

  it("prefers valid paidAt over approved workSubmissions", () => {
    const res = resolveCompletedAt({
      id: "b1",
      paidAt: "2026-05-10T00:00:00.000Z",
      workSubmissions: [
        { status: "approved", reviewedAt: "2026-05-12T00:00:00.000Z" },
      ],
    });
    assert.equal(res.source, "paidAt");
    assert.equal(res.estimate.toISOString(), "2026-05-10T00:00:00.000Z");
  });

  it("picks the latest valid approved reviewedAt and ignores invalid or non-approved rows", () => {
    const res = resolveCompletedAt({
      id: "b2",
      paidAt: "invalid-date",
      workSubmissions: [
        null,
        { status: "approved", reviewedAt: "not-a-date" },
        { status: "approved", reviewedAt: "2026-04-01T10:00:00.000Z" },
        { status: "rejected", reviewedAt: "2026-09-01T10:00:00.000Z" },
        { status: "approved", reviewedAt: "2026-05-02T15:30:00.000Z" },
        { status: "approved", reviewedAt: null },
      ],
    });
    assert.equal(res.source, "reviewedAt");
    assert.equal(res.estimate.toISOString(), "2026-05-02T15:30:00.000Z");
  });

  it("returns null estimate gracefully when bounty or workSubmissions is missing", () => {
    assert.deepEqual(resolveCompletedAt(null), { estimate: null, source: null });
    assert.deepEqual(resolveCompletedAt({ id: "b3", paidAt: null }), {
      estimate: null,
      source: null,
    });
    assert.deepEqual(
      resolveCompletedAt({
        id: "b4",
        paidAt: null,
        workSubmissions: [{ status: "pending", reviewedAt: "2026-05-01T00:00:00.000Z" }],
      }),
      { estimate: null, source: null },
    );
  });

  it("updates resolvable bounties and leaves unresolved ones untouched via injected prisma", async () => {
    const updates = [];
    let disconnected = false;
    const fakePrisma = {
      bounty: {
        findMany: async () => [
          {
            id: "b-paid",
            paidAt: new Date("2026-03-01T00:00:00.000Z"),
            workSubmissions: [],
          },
          {
            id: "b-rev",
            paidAt: null,
            workSubmissions: [
              { status: "approved", reviewedAt: "2026-03-05T00:00:00.000Z" },
            ],
          },
          {
            id: "b-none",
            paidAt: null,
            workSubmissions: null,
          },
        ],
        update: async (args) => {
          updates.push(args);
        },
      },
      $disconnect: async () => {
        disconnected = true;
      },
    };

    const summary = await main(fakePrisma);
    assert.deepEqual(summary, {
      fromPaidAt: 1,
      fromReviewedAt: 1,
      unresolved: 1,
    });
    assert.equal(updates.length, 2);
    assert.equal(updates[0].where.id, "b-paid");
    assert.equal(updates[1].where.id, "b-rev");
    assert.equal(disconnected, false);
  });
});
