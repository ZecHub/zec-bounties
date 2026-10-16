const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createPaymentCacheHarness } = require("./helpers/paymentCacheHarness");

test("payment authorization refreshes every cached viewer's bounty detail", async () => {
  const h = createPaymentCacheHarness();
  const viewers = [{ id: "admin", role: "ADMIN" }, { id: "hunter", role: "HUNTER" }];
  for (const viewer of viewers) {
    const before = await h.request("bounties", "get", "/:id", {}, viewer);
    assert.equal(before.statusCode, 200);
    assert.equal(before.body.isPaid, false);
  }
  const paid = await h.request("transactions", "post", "/authorize-payment", { bountyIds: ["b1"] });
  assert.equal(paid.statusCode, 200);
  assert.equal(h.bounty.isPaid, true);
  for (const viewer of viewers) {
    const after = await h.request("bounties", "get", "/:id", {}, viewer);
    assert.equal(after.body.isPaid, true);
  }
});

test("payment authorization refreshes the unpaid total", async () => {
  const h = createPaymentCacheHarness();
  const before = await h.request("bounties", "get", "/stats/totals");
  assert.equal(before.statusCode, 200);
  assert.equal(before.body.unpaidDoneCount, 1);
  assert.equal((await h.request("transactions", "post", "/authorize-payment", { bountyIds: ["b1"] })).statusCode, 200);
  const after = await h.request("bounties", "get", "/stats/totals");
  assert.equal(after.body.unpaidDoneCount, 0);
});

test("payment authorization refreshes cached details and the shared team-list version", async () => {
  const h = createPaymentCacheHarness();
  const before = await h.request("bounties", "get", "/:id");
  assert.equal(before.body.paymentAuthorized, false);
  // Team lists snapshot this same namespace before reading the database.
  const version = await h.cache.getVersion("bounties");
  const result = await h.request("transactions", "post", "/authorize-payment", { bountyIds: ["b1"] });
  assert.equal(result.statusCode, 200);
  const after = await h.request("bounties", "get", "/:id");
  assert.equal(after.body.paymentAuthorized, true);
  assert.ok(await h.cache.getVersion("bounties") > version);
});

test("a rejected payment refreshes the cache after releasing its claim", async () => {
  const h = createPaymentCacheHarness({ sendError: "Insufficient funds" });
  await h.request("bounties", "get", "/:id");
  const version = await h.cache.getVersion("bounties");
  const result = await h.request("transactions", "post", "/authorize-payment", { bountyIds: ["b1"] });
  assert.equal(result.statusCode, 422);
  assert.equal(h.bounty.paymentInFlight, false);
  assert.ok(await h.cache.getVersion("bounties") > version);
  const after = await h.request("bounties", "get", "/:id");
  assert.equal(after.body.isPaid, false);
  assert.equal(after.body.paymentInFlight, false);
});

test("a pre-payment list read cannot repopulate the current cache after settlement", async () => {
  const h = createPaymentCacheHarness();
  const gate = h.pauseNextListRead();
  const oldRead = h.request("bounties", "get", "/");
  await gate.reached;
  try {
    assert.equal((await h.request("transactions", "post", "/authorize-payment", { bountyIds: ["b1"] })).statusCode, 200);
  } finally {
    gate.resume();
  }
  assert.equal((await oldRead).body.data[0].isPaid, false);
  const fresh = await h.request("bounties", "get", "/");
  assert.equal(fresh.statusCode, 200);
  assert.equal(fresh.body.data[0].isPaid, true);
});

test("a failed database mutation does not invalidate a valid snapshot", async () => {
  const h = createPaymentCacheHarness();
  await h.request("bounties", "get", "/:id");
  const version = await h.cache.getVersion("bounties");
  h.db.bounty.updateMany = async () => { throw new Error("Database unavailable"); };
  assert.equal((await h.request("transactions", "post", "/authorize-payment", { bountyIds: ["b1"] })).statusCode, 500);
  assert.equal(await h.cache.getVersion("bounties"), version);
  assert.equal((await h.request("bounties", "get", "/:id")).body.isPaid, false);
});
