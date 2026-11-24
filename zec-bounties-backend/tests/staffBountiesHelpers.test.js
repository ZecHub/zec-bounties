const test = require("node:test");
const assert = require("node:assert/strict");
const {
  STAFF_PAGE_LIMIT,
  pageStaffRows,
  resolveStaffUser,
  buildStaffView,
} = require("../utils/staffBounties");

test("pageStaffRows honors custom limit clamped to [1, STAFF_PAGE_LIMIT] and falls back on invalid limit", () => {
  const rows = Array.from({ length: 15 }, (_, i) => ({ id: `r${i}` }));

  const first = pageStaffRows(rows, 0, 5);
  assert.equal(first.rows.length, 5);
  assert.equal(first.limit, 5);
  assert.equal(first.nextOffset, 5);
  assert.equal(first.total, 15);

  const clampedMax = pageStaffRows(rows, 0, STAFF_PAGE_LIMIT + 50);
  assert.equal(clampedMax.limit, STAFF_PAGE_LIMIT);
  assert.equal(clampedMax.rows.length, 15);
  assert.equal(clampedMax.nextOffset, null);

  const invalidLimit = pageStaffRows(rows, 0, 0);
  assert.equal(invalidLimit.limit, STAFF_PAGE_LIMIT);

  const nanLimit = pageStaffRows(rows, -5, Number.NaN);
  assert.equal(nanLimit.limit, STAFF_PAGE_LIMIT);
  assert.equal(nanLimit.rows.length, 15);
});

test("resolveStaffUser short-circuits blank/non-string keys and trims whitespace", async () => {
  let queries = 0;
  const prisma = {
    user: {
      findUnique: async ({ where }) => {
        queries++;
        return where.id === "u-1" ? { id: "u-1", name: "Ada", nickname: "ada" } : null;
      },
      findMany: async () => {
        queries++;
        return [];
      },
    },
  };

  assert.equal((await resolveStaffUser(prisma, "")).status, 404);
  assert.equal((await resolveStaffUser(prisma, "   ")).status, 404);
  assert.equal((await resolveStaffUser(prisma, null)).status, 404);
  assert.equal(queries, 0);

  const found = await resolveStaffUser(prisma, "  u-1  ");
  assert.equal(found.user.id, "u-1");
  assert.equal(queries, 1);
});

test("buildStaffView ignores non-finite and negative bountyAmount in earnings totals", () => {
  const base = {
    title: "task",
    status: "DONE",
    chain: "MAIN",
    isPrivate: false,
    isPaid: true,
    isApproved: true,
    dateCreated: "2026-10-01T00:00:00.000Z",
    completedAt: "2026-10-02T00:00:00.000Z",
    paidAt: "2026-10-03T00:00:00.000Z",
    exportedAt: null,
    team: null,
  };
  const assigned = [
    { ...base, id: "ok", bountyAmount: 1.25 },
    { ...base, id: "inf", bountyAmount: Number.POSITIVE_INFINITY },
    { ...base, id: "neg", bountyAmount: -5 },
    { ...base, id: "nan", bountyAmount: "abc" },
  ];
  const view = buildStaffView(
    { id: "u1", name: "Ada", nickname: "ada", createdAt: "2026-01-01T00:00:00.000Z" },
    "MAIN",
    [],
    assigned,
    [],
    [],
    { openOffset: 0, historyOffset: 0 },
  );
  assert.equal(view.zecCompleted, 1.25);
  assert.equal(view.zecEarned, 1.25);
});
