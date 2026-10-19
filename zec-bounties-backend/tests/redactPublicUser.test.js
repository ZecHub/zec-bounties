const test = require("node:test");
const assert = require("node:assert/strict");
const { redactPublicUser } = require("../utils/privacy");

const fullUser = {
  id: "u1",
  name: "Test User 1",
  nickname: "user1",
  avatar: "https://example.com/a.png",
  email: "user1@example.com",
  z_address: "zs1test...",
  UA_address: "u1testua...",
  profileVisibility: {},
};

test("forceFull (admin) returns z_address and UA_address", () => {
  const out = redactPublicUser(fullUser, { forceFull: true });
  assert.equal(out.id, "u1");
  assert.equal(out.name, "Test User 1");
  assert.equal(out.z_address, "zs1test...");
  assert.equal(out.UA_address, "u1testua...");
  // email still omitted (unchanged from prior behavior)
  assert.equal(out.email, undefined);
});

test("non-admin path never returns address fields", () => {
  const out = redactPublicUser(fullUser, { forceFull: false });
  assert.equal(out.id, "u1");
  assert.equal(out.z_address, undefined);
  assert.equal(out.UA_address, undefined);
  assert.equal(out.email, undefined);
});

test("non-admin respects display-name visibility", () => {
  const hidden = {
    ...fullUser,
    profileVisibility: { showDisplayName: false, showAvatar: false },
  };
  const out = redactPublicUser(hidden, { forceFull: false });
  assert.equal(out.name, "Anonymous contributor");
  assert.equal(out.avatar, null);
  assert.equal(out.UA_address, undefined);
});

test("null user returns null", () => {
  assert.equal(redactPublicUser(null, { forceFull: true }), null);
  assert.equal(redactPublicUser(undefined), null);
});