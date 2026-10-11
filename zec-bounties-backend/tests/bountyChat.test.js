const test = require("node:test");
const assert = require("node:assert/strict");
const {
  canAccessBountyChat,
  validateChatMessage,
} = require("../helpers/bountyChatValidation");
const { isTransitionToDone } = require("../helpers/clearBountyChat");

const bounty = {
  assignee: "legacy-assignee",
  assignees: [{ userId: "roster-assignee" }],
};

test("chat access is limited to admins and assigned users", () => {
  assert.equal(
    canAccessBountyChat(bounty, { id: "admin", role: "ADMIN" }),
    true,
  );
  assert.equal(
    canAccessBountyChat(bounty, { id: "legacy-assignee", role: "HUNTER" }),
    true,
  );
  assert.equal(
    canAccessBountyChat(bounty, { id: "roster-assignee", role: "HUNTER" }),
    true,
  );
  assert.equal(
    canAccessBountyChat(bounty, { id: "other-user", role: "HUNTER" }),
    false,
  );
});

test("chat cleanup occurs only on the first transition to DONE", () => {
  assert.equal(isTransitionToDone("TO_DO", "IN_PROGRESS"), false);
  assert.equal(isTransitionToDone("IN_PROGRESS", "IN_REVIEW"), false);
  assert.equal(isTransitionToDone("IN_PROGRESS", "DONE"), true);
  assert.equal(isTransitionToDone("DONE", "DONE"), false);
});

test("chat rejects empty and oversized text", () => {
  assert.equal(
    validateChatMessage({ content: "   " }).error,
    "Add a message or image",
  );
  assert.equal(
    validateChatMessage({ content: "x".repeat(2001) }).error,
    "Messages must be 2000 characters or fewer",
  );
  assert.deepEqual(validateChatMessage({ content: "  Hello  " }), {
    content: "Hello",
    imageData: null,
  });
});

test("chat accepts small supported image attachments and rejects unsafe or oversized ones", () => {
  const smallPng = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;
  assert.equal(
    validateChatMessage({ imageData: smallPng }).imageData,
    smallPng,
  );
  assert.match(
    validateChatMessage({ imageData: "data:image/svg+xml;base64,PHN2Zz4=" })
      .error,
    /PNG, JPEG, WebP, or GIF/,
  );

  const oversizedImage = `data:image/png;base64,${Buffer.alloc(512 * 1024 + 1).toString("base64")}`;
  assert.equal(
    validateChatMessage({ imageData: oversizedImage }).error,
    "Images must be 512 KB or smaller",
  );
});
