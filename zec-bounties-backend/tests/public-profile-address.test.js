const test = require("node:test");
const assert = require("node:assert/strict");

const { rawAddressFields } = require("../helpers/publicProfileAddress");

const user = {
  id: "u1",
  UA_address: "u1qqqqqqqqqqqqqqqqqqpk8rkp5a",
  z_address: "zs1z7rejlpsa98s2rrrfkwmaxu53e4ue0ulcrw0h4x5g8jl04tak0d3",
};

// GET /users/:idOrNickname/public is unauthenticated and may advertise the KIND
// of address (showAddressType), but the raw address string must only reach the
// owner or an admin.

test("non-owner, non-admin viewer gets no raw address", () => {
  assert.deepEqual(rawAddressFields(user, { isOwner: false, isAdmin: false }), {});
  assert.deepEqual(rawAddressFields(user, {}), {});
});

test("owner receives the raw address", () => {
  assert.deepEqual(rawAddressFields(user, { isOwner: true }), {
    UA_address: user.UA_address,
  });
});

test("admin receives the raw address", () => {
  assert.deepEqual(rawAddressFields(user, { isAdmin: true }), {
    UA_address: user.UA_address,
  });
});

test("prefers the unified address, falls back to z_address", () => {
  const zOnly = { id: "u2", UA_address: null, z_address: user.z_address };
  assert.deepEqual(rawAddressFields(zOnly, { isOwner: true }), {
    z_address: user.z_address,
  });
});

test("no address fields on the user yields an empty object even for the owner", () => {
  assert.deepEqual(
    rawAddressFields({ id: "u3", UA_address: null, z_address: null }, { isOwner: true }),
    {},
  );
});
