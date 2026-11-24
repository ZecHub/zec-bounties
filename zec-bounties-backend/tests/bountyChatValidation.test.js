const test = require("node:test");
const assert = require("node:assert/strict");
const {
  canAccessBountyChat,
  validateChatMessage,
} = require("../helpers/bountyChatValidation");

test("canAccessBountyChat denies non-admin users with missing or blank id on unassigned bounties", () => {
  const unassigned = { assignee: null, assignees: [] };
  const undefinedAssignee = { assignees: [{ userId: undefined }] };

  assert.equal(canAccessBountyChat(unassigned, { id: null, role: "HUNTER" }), false);
  assert.equal(canAccessBountyChat(unassigned, { id: undefined, role: "HUNTER" }), false);
  assert.equal(canAccessBountyChat(unassigned, { id: "", role: "HUNTER" }), false);
  assert.equal(canAccessBountyChat(undefinedAssignee, { role: "HUNTER" }), false);
  assert.equal(canAccessBountyChat(unassigned, { id: null, role: "ADMIN" }), true);
});

test("validateChatMessage handles null input and reports malformed base64 distinctly from size limits", () => {
  assert.equal(validateChatMessage(null).error, "Add a message or image");
  assert.equal(validateChatMessage(undefined).error, "Add a message or image");

  // Non-canonical / malformed base64 should not be reported as > 512 KB
  assert.equal(
    validateChatMessage({ imageData: "data:image/png;base64,A" }).error,
    "Invalid image attachment",
  );
  assert.equal(
    validateChatMessage({ imageData: "data:image/png;base64,abc" }).error,
    "Invalid image attachment",
  );

  // Oversized payload is rejected with the size limit message
  const oversized = `data:image/png;base64,${"A".repeat(700000)}`;
  assert.equal(
    validateChatMessage({ imageData: oversized }).error,
    "Images must be 512 KB or smaller",
  );
});
