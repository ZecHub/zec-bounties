const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { resolveStaffUser } = require("../../zec-bounties-backend/utils/staffBounties");

// Run the real profileHref helper, and resolve the link it builds with the
// same lookup the public profile route uses (id, then nickname, never name).
function loadProfileHref() {
  const filename = path.resolve(__dirname, "../lib/profileHref.ts");
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, []);
  const module = { exports: {} };
  vm.runInNewContext(result.outputText, {
    module, exports: module.exports, encodeURIComponent,
  }, { filename });
  return module.exports.profileHref;
}

const profileHref = loadProfileHref();

// alice took the GitHub login first, so the second "alice" signed up as
// "alice.1234" (routes/auth.js) and kept "alice" as the display name.
const users = [
  { id: "cuid-alice", name: "Alice Smith", nickname: "alice" },
  { id: "cuid-alice2", name: "alice", nickname: "alice.1234" },
  { id: "cuid-bob", name: "Bob", nickname: null },
  { id: "cuid-carol", name: "carol_dev", nickname: "carol-d" },
  { id: "cuid-dan", name: "Dan Brown", nickname: null },
];

const db = {
  user: {
    async findUnique({ where }) {
      const [field, value] = Object.entries(where)[0];
      return users.find((u) => u[field] === value) ?? null;
    },
    async findMany({ where }) {
      return users.filter((u) => u.name === where.name);
    },
  },
};

async function openProfile(href) {
  assert.match(href, /^\/users\/[^/]+$/);
  const key = decodeURIComponent(href.slice("/users/".length)).trim();
  return resolveStaffUser(db, key, undefined, { matchName: false });
}

test("every profile link opens that user's own public profile", async () => {
  for (const user of users) {
    const href = profileHref(user);
    const resolved = await openProfile(href);
    assert.equal(resolved.user?.id, user.id, `${href} for ${user.id}`);
  }
});

test("a nickname with a dot is used as is, not swapped for the display name", () => {
  assert.equal(profileHref(users[1]), "/users/alice.1234");
});

test("without a nickname the link uses the id, not the display name", () => {
  assert.equal(profileHref(users[2]), "/users/cuid-bob");
});

test("plain nicknames keep their readable link", () => {
  assert.equal(profileHref(users[0]), "/users/alice");
  assert.equal(profileHref(users[3]), "/users/carol-d");
});

test("a blank nickname falls back to the id", () => {
  assert.equal(profileHref({ id: "cuid-eve", name: "eve", nickname: "  " }), "/users/cuid-eve");
});
