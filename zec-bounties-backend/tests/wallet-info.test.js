const test = require("node:test");
const assert = require("node:assert/strict");
const { createWalletInfoHarness } = require("./helpers/walletInfoHarness");

test("wallet info returns server metadata without issuing a rescan", async () => {
  const h = createWalletInfoHarness();
  const res = await h.request();
  assert.deepEqual(h.effects.commands, ["info\n"]);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.chain_name, "main");
  assert.equal(res.body.block_height, 100);
  assert.deepEqual(h.effects.initializations, []);
  assert.deepEqual(h.effects.processParams, [h.wallet]);
  assert.equal(h.callbacks[0], h.authenticate);
  assert.equal(h.callbacks[1], h.isAdmin);
});

test("wallet info uses the initialized default wallet without rescanning it", async () => {
  const createdWallet = { walletId: "created-fixture", accountName: "Main" };
  const h = createWalletInfoHarness({ defaults: [null, createdWallet] });
  const res = await h.request();
  assert.deepEqual(h.effects.initializations, [["fixture-admin", "Main"]]);
  assert.deepEqual(h.effects.walletLookups, ["fixture-admin", "fixture-admin"]);
  assert.deepEqual(h.effects.processParams, [createdWallet]);
  assert.deepEqual(h.effects.commands, ["info\n"]);
  assert.equal(res.statusCode, 200);
});

test("wallet info returns 404 without a CLI command when no wallet becomes available", async () => {
  const h = createWalletInfoHarness({ defaults: [null, null] });
  const res = await h.request();
  assert.equal(res.statusCode, 404);
  assert.deepEqual(h.effects.commands, []);
  assert.equal(res.body.message, "No Zcash wallet available");
});

test("an information error is returned without falling back to a rescan", async () => {
  const h = createWalletInfoHarness({ failInfo: true });
  const res = await h.request();
  assert.deepEqual(h.effects.commands, ["info\n"]);
  assert.equal(res.statusCode, 500);
  assert.match(res.body.error, /fixture server unavailable/);
});
