const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadHelpers, loadRoutes } = require("./helpers/quotaHarness");

const HUNTER = { id: "hunter-1", role: "HUNTER" };
const OTHER_HUNTER = { id: "hunter-2", role: "HUNTER" };

function database(overrides = {}) {
  const state = {
    quota: overrides.quota ?? 1,
    refunds: overrides.refunds ?? 0,
    updateCount: overrides.updateCount ?? 1,
    attempts: 0,
    updates: [],
    countQueries: [],
  };

  const bountyRow = {
    id: "bounty-1",
    createdBy: HUNTER.id,
    status: "TO_DO",
    isApproved: false,
    isPaid: false,
    paymentAuthorized: false,
    paymentInFlight: false,
    suggestionReviewStatus: null,
    dateCreated: new Date(),
    ...overrides.bounty,
  };

  const tx = {
    user: { findUnique: async () => ({ badges: [] }) },
    bounty: {
      findUnique: async () => ({
        ...bountyRow,
        ...(state.appliedUpdate?.data ?? {}),
        assignees: [],
        team: null,
        createdByUser: { name: "Hunter", role: "HUNTER" },
        assigneeUser: null,
      }),
      findMany: async () => [],
      count: async ({ where }) => {
        state.countQueries.push(where);
        if (Object.hasOwn(where, "quotaRefundedAt")) {
          return where.quotaRefundedAt === null ? state.quota : state.refunds;
        }
        if (where.status === "DONE") return 0;
        return 0;
      },
      updateMany: async ({ where, data }) => {
        state.updates.push({ where, data });
        if (state.updateCount > 0) state.appliedUpdate = { where, data };
        return { count: state.updateCount };
      },
      update: async ({ data }) => ({ ...bountyRow, ...data }),
    },
    bountyAssignee: { deleteMany: async () => ({ count: 0 }) },
    team: { findUnique: async () => null },
    teamMember: { findUnique: async () => null },
  };

  const prisma = {
    ...tx,
    user: { ...tx.user, findMany: async () => [] },
    async $transaction(callback, options) {
      state.attempts++;
      assert.equal(options?.isolationLevel, "Serializable");
      return callback(tx);
    },
  };

  return { prisma, state, bountyRow };
}

function withdrawRequest(user, body = {}) {
  return { user, params: { id: "bounty-1" }, body };
}

test("a hunter withdraws their pending suggestion and gets the weekly slot back", async () => {
  const fixture = database();
  const routes = loadRoutes(fixture.prisma);

  const res = await routes.invoke(
    "bounties",
    "post",
    "/:id/withdraw",
    withdrawRequest(HUNTER, { reason: "Posted by mistake" }),
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.quotaRefunded, true);
  assert.equal(res.body.bounty.status, "CANCELLED");
  assert.equal(res.body.bounty.suggestionReviewStatus, "WITHDRAWN");

  const update = fixture.state.updates.at(-1);
  assert.equal(update.data.status, "CANCELLED");
  assert.equal(update.data.isApproved, false);
  assert.equal(update.data.suggestionReviewStatus, "WITHDRAWN");
  assert.equal(update.data.suggestionReviewReason, "Posted by mistake");
  assert.ok(update.data.quotaRefundedAt instanceof Date);
  assert.equal(update.where.createdBy, HUNTER.id);
});

test("the second withdrawal in a week closes the suggestion without another refund", async () => {
  const fixture = database({ refunds: 1 });
  const routes = loadRoutes(fixture.prisma);

  const res = await routes.invoke(
    "bounties",
    "post",
    "/:id/withdraw",
    withdrawRequest(HUNTER),
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.quotaRefunded, false);
  assert.equal(res.body.bounty.status, "CANCELLED");
  assert.equal(fixture.state.updates.at(-1).data.quotaRefundedAt, undefined);
});

test("a suggestion created in an earlier week is withdrawn without a refund", async () => {
  const fixture = database({
    bounty: { dateCreated: new Date("2020-01-06T00:00:00.000Z") },
  });
  const routes = loadRoutes(fixture.prisma);

  const res = await routes.invoke(
    "bounties",
    "post",
    "/:id/withdraw",
    withdrawRequest(HUNTER),
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.quotaRefunded, false);
  assert.equal(fixture.state.updates.at(-1).data.quotaRefundedAt, undefined);
});

test("only the hunter who posted the suggestion can withdraw it", async () => {
  const fixture = database();
  const routes = loadRoutes(fixture.prisma);

  const res = await routes.invoke(
    "bounties",
    "post",
    "/:id/withdraw",
    withdrawRequest(OTHER_HUNTER),
  );

  assert.equal(res.statusCode, 403);
  assert.equal(fixture.state.updates.length, 0);
});

test("an approved suggestion cannot be withdrawn by its hunter", async () => {
  const fixture = database({ bounty: { isApproved: true } });
  const routes = loadRoutes(fixture.prisma);

  const res = await routes.invoke(
    "bounties",
    "post",
    "/:id/withdraw",
    withdrawRequest(HUNTER),
  );

  assert.equal(res.statusCode, 409);
  assert.equal(fixture.state.updates.length, 0);
});

test("a suggestion reviewed first cannot be withdrawn", async () => {
  const fixture = database({ updateCount: 0 });
  const routes = loadRoutes(fixture.prisma);

  const res = await routes.invoke(
    "bounties",
    "post",
    "/:id/withdraw",
    withdrawRequest(HUNTER),
  );

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, "Suggestion is no longer pending");
});

test("a withdrawn suggestion cannot be approved again", async () => {
  const fixture = database({
    bounty: { suggestionReviewStatus: "WITHDRAWN" },
  });
  const routes = loadRoutes(fixture.prisma);

  const res = await routes.invoke("bounties", "patch", "/:id/approve", {
    user: { id: "admin-1", role: "ADMIN" },
    params: { id: "bounty-1" },
    body: {},
  });

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, "Suggestion was withdrawn by the hunter");
});

test("the weekly quota only counts suggestions that were not refunded", async () => {
  const fixture = database({ quota: 2 });
  const helpers = loadHelpers(fixture.prisma);

  const quota = await helpers.getWeeklyBountyQuota(HUNTER.id);

  assert.equal(quota.used, 2);
  const quotaQuery = fixture.state.countQueries.at(-1);
  assert.equal(quotaQuery.quotaRefundedAt, null);
});
