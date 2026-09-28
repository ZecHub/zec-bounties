const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createPaymentCacheHarness } = require("./helpers/paymentCacheHarness");

test("mark-paid refreshes every cached viewer's bounty detail", async () => {
  const h = createPaymentCacheHarness();
  const viewers = [{ id: "admin", role: "ADMIN" }, { id: "hunter", role: "HUNTER" }];
  for (const viewer of viewers) {
    const before = await h.request("bounties", "get", "/:id", {}, viewer);
    assert.equal(before.statusCode, 200);
    assert.equal(before.body.isPaid, false);
  }
  const paid = await h.request("transactions", "put", "/:id/mark-paid", { isPaid: true });
  assert.equal(paid.statusCode, 200);
  assert.equal(h.bounty.isPaid, true);
  for (const viewer of viewers) {
    const after = await h.request("bounties", "get", "/:id", {}, viewer);
    assert.equal(after.body.isPaid, true);
  }
});

test("mark-paid refreshes the unpaid total", async () => {
  const h = createPaymentCacheHarness();
  const before = await h.request("bounties", "get", "/stats/totals");
  assert.equal(before.statusCode, 200);
  assert.equal(before.body.unpaidDoneCount, 1);
  assert.equal((await h.request("transactions", "put", "/:id/mark-paid")).statusCode, 200);
  const after = await h.request("bounties", "get", "/stats/totals");
  assert.equal(after.body.unpaidDoneCount, 0);
});

for (const method of ["post", "put"]) {
  test(`${method} payment authorization refreshes cached details and the shared team-list version`, async () => {
    const h = createPaymentCacheHarness();
    const before = await h.request("bounties", "get", "/:id");
    assert.equal(before.body.paymentAuthorized, false);
    // Team lists snapshot this same namespace before reading the database.
    const version = await h.cache.getVersion("bounties");
    const result = await h.request("transactions", method, "/:id/authorize-payment", { paymentAuthorized: true });
    assert.equal(result.statusCode, 200);
    const after = await h.request("bounties", "get", "/:id");
    assert.equal(after.body.paymentAuthorized, true);
    assert.ok(await h.cache.getVersion("bounties") > version);
  });
}

test("a pre-payment list read cannot repopulate the current cache after settlement", async () => {
  const h = createPaymentCacheHarness();
  const gate = h.pauseNextListRead();
  const oldRead = h.request("bounties", "get", "/");
  await gate.reached;
  try {
    assert.equal((await h.request("transactions", "put", "/:id/mark-paid")).statusCode, 200);
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
  h.db.bounty.update = async () => { throw new Error("Database unavailable"); };
  assert.equal((await h.request("transactions", "put", "/:id/mark-paid")).statusCode, 500);
  assert.equal(await h.cache.getVersion("bounties"), version);
  assert.equal((await h.request("bounties", "get", "/:id")).body.isPaid, false);
});
