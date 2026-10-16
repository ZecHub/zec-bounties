const test = require("node:test");
const assert = require("node:assert/strict");
const { bountyUserSelects } = require("../utils/userSelects");

const PRIVATE_FIELDS = ["email", "z_address", "UA_address"];

function privateFieldsIn(selects) {
  return Object.values(selects).flatMap((select) =>
    PRIVATE_FIELDS.filter((field) => select[field]),
  );
}

test("anonymous viewers get public user fields only", () => {
  const selects = bountyUserSelects({ isAuthed: false, isAdmin: false });
  assert.deepEqual(privateFieldsIn(selects), []);
  assert.equal(selects.createdByUser.role, undefined);
});

test("signed-in non-admins get no email or payout address", () => {
  const selects = bountyUserSelects({ isAuthed: true, isAdmin: false });
  assert.deepEqual(privateFieldsIn(selects), []);
  assert.equal(selects.createdByUser.role, true);
});

test("admins keep email and payout addresses", () => {
  const selects = bountyUserSelects({ isAuthed: true, isAdmin: true });
  assert.equal(selects.user.email, true);
  assert.equal(selects.user.z_address, true);
  assert.equal(selects.user.UA_address, true);
  assert.equal(selects.createdByUser.email, true);
  assert.equal(selects.createdByUser.role, true);
});
