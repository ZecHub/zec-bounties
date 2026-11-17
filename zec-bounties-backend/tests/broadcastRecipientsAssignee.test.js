const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Any property/call/new/await on this returns itself — stands in for the
// dependencies getBroadcastRecipients does not touch.
const anything = new Proxy(function () {}, {
  get: (_, key) => (key === "then" ? undefined : anything),
  apply: () => anything,
  construct: () => anything,
});

// Load bountyHelpers.js with a stubbed prisma client. No team members or
// favorites exist, so the only recipients beyond the creator/admins are the
// assignees the fix adds.
function loadHelpers() {
  const db = {
    user: { findMany: async () => [{ id: "admin" }] },
    teamMember: { findMany: async () => [] },
    teamFavorite: { findMany: async () => [] },
  };
  const dependencies = {
    "../prisma/client": db,
    "./cache": withNoop(),
    "./sendMail": anything,
    "./notifyUser": anything,
    "../middleware/websocket": withNoop(),
  };
  const filename = path.join(__dirname, "../utils/bountyHelpers.js");
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(filename, "utf8"),
    {
      module,
      exports: module.exports,
      require: (name) =>
        Object.hasOwn(dependencies, name) ? dependencies[name] : anything,
      console: { log() {}, error() {} },
      process: { env: {} },
    },
    { filename },
  );
  return module.exports;
}

function withNoop() {
  return new Proxy(
    {},
    { get: () => async () => {} },
  );
}

test("a private bounty's legacy assignee is in the broadcast audience", async () => {
  const { getBroadcastRecipients } = loadHelpers();
  const recipients = await getBroadcastRecipients({
    isPrivate: true,
    createdBy: "creator",
    teamId: null,
    assignee: "hunter",
    assignees: [],
  });
  assert.ok(recipients.includes("hunter"), recipients);
  assert.ok(recipients.includes("creator"), recipients);
});

test("every bountyAssignee roster member is in the broadcast audience", async () => {
  const { getBroadcastRecipients } = loadHelpers();
  const recipients = await getBroadcastRecipients({
    isPrivate: true,
    createdBy: "creator",
    teamId: "team-1",
    assignee: null,
    assignees: [{ userId: "hunter-a" }, { userId: "hunter-b" }],
  });
  assert.ok(recipients.includes("hunter-a"), recipients);
  assert.ok(recipients.includes("hunter-b"), recipients);
});

test("the synthetic team-event call without assignees still works", async () => {
  const { getBroadcastRecipients } = loadHelpers();
  // routes/teams.js calls getBroadcastRecipients({ isPrivate: true, teamId })
  // with no bounty row — the assignee guards must not throw.
  const recipients = await getBroadcastRecipients({
    isPrivate: true,
    teamId: "team-1",
  });
  assert.ok(Array.isArray(recipients), String(recipients));
});

test("a public bounty still broadcasts to everyone (null)", async () => {
  const { getBroadcastRecipients } = loadHelpers();
  const recipients = await getBroadcastRecipients({ isPrivate: false });
  assert.equal(recipients, null);
});
