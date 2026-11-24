const { test } = require("node:test");
const assert = require("node:assert/strict");

const { receiversForUser, EMPTY } = require("../helpers/addressReceivers");

test("receiversForUser returns EMPTY for missing or whitespace-only addresses", async () => {
  assert.deepEqual(await receiversForUser(null), EMPTY);
  assert.deepEqual(await receiversForUser({}), EMPTY);
  assert.deepEqual(
    await receiversForUser({ UA_address: "   ", z_address: " \t\n " }),
    EMPTY,
  );
});

test("receiversForUser trims addresses and falls back from blank UA_address to z_address", async () => {
  const res = await receiversForUser({
    UA_address: "   ",
    z_address: "  zs1z7rejlpsa98s2rrrfkwmaxu53e4ue0ulcrw0h4x5g8jl04tak0d3  ",
  });
  assert.deepEqual(res, { ironwood: false, sapling: true, transparent: false });
});

test("receiversForUser classifies mainnet/testnet UAs and transparent addresses accurately in fallback", async () => {
  const mainnetUa = await receiversForUser({
    UA_address: "  u1qqqqqqqqqqqqqqqqqqpk8rkp5a  ",
  });
  assert.deepEqual(mainnetUa, {
    ironwood: true,
    sapling: true,
    transparent: false,
  });

  const testnetUa = await receiversForUser({
    UA_address: "UTEST1qqqqqqqqqqqqqqqqqq",
  });
  assert.deepEqual(testnetUa, {
    ironwood: true,
    sapling: true,
    transparent: false,
  });

  const transparent = await receiversForUser({
    z_address: "t1Rv4exT7bqhZqi2j7xz8bUHDMxwosrjADU",
  });
  assert.deepEqual(transparent, {
    ironwood: false,
    sapling: false,
    transparent: true,
  });

  const p2sh = await receiversForUser({
    z_address: "t3Vz22vK5z2LcKEdg16Yv4FFneEL1zg9ojd",
  });
  assert.deepEqual(p2sh, {
    ironwood: false,
    sapling: false,
    transparent: true,
  });
});
