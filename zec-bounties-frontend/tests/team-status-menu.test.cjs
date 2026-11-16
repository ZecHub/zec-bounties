const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// The team page's bounty actions menu is shown to team OWNER/ADMIN members and
// calls the bounty context's updateBountyStatus. The backend's PATCH /:id/status
// authorises those members (canAdministerBounty), so the client must send the
// request for them too. These tests run the real function bodies from the
// context, the team page and the backend route with fetch replaced.
const root = path.resolve(__dirname, "..", "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const contextSource = read("zec-bounties-frontend/lib/bounty-context.tsx");
const teamPageSource = read("zec-bounties-frontend/app/teams/[teamId]/page.tsx");
const routeSource = read("zec-bounties-backend/routes/bounties.js");

// Cut `const name = async (...) => { ... };` or `async function name(...) { ... }`
// out of a source file by matching braces from its opening body brace.
function extract(source, name) {
  const arrow = source.indexOf(`const ${name} = async`);
  const start = arrow >= 0 ? arrow : source.indexOf(`async function ${name}(`);
  assert.ok(start >= 0, `cannot find ${name}`);
  const open = arrow >= 0 ? source.indexOf("=> {", start) + 3 : source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1) + ";";
  }
  throw new Error(`unbalanced braces in ${name}`);
}

const toJs = (source) =>
  ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;

function mountTeamPage({ currentUser, teamBounties }) {
  const calls = [];
  const scope = {
    currentUser,
    teamBounties,
    backendUrl: "http://backend",
    getAuthHeaders: () => ({}),
    applyBountyUpdate: () => {},
    fetchBountyById: async () => null,
    fetch: async (url, init = {}) => {
      calls.push(`${init.method || "GET"} ${url.replace("http://backend", "")}`);
      return { ok: true, json: async () => ({}) };
    },
    toast: { error: (title) => calls.push(`toast ${title}`) },
    setWinnerBounty: (bounty) => calls.push(`winner picker ${bounty ? bounty.id : "closed"}`),
    console: { error: () => {}, log: () => {} },
  };
  const body =
    ["updateBountyStatus", "updateBounty"].map((name) => toJs(extract(contextSource, name))).join("") +
    ["handleStatusChange", "handleWinnerConfirm"].map((name) => toJs(extract(teamPageSource, name))).join("") +
    "return { handleStatusChange, handleWinnerConfirm };";
  const handlers = new Function(...Object.keys(scope), body)(...Object.values(scope));
  return { ...handlers, calls };
}

const teamOwner = { id: "owner", role: "TEAM" };
const globalAdmin = { id: "admin", role: "ADMIN" };
const oneAssignee = { id: "b1", assignees: [{ userId: "h1" }], createdByUser: { role: "TEAM" } };
const twoAssignees = { id: "b2", assignees: [{ userId: "h1" }, { userId: "h2" }], createdByUser: { role: "TEAM" } };

test("the status route lets a team OWNER change status", async () => {
  const canAdministerBounty = new Function(
    "prisma",
    extract(routeSource, "canAdministerBounty") + "return canAdministerBounty;",
  )(null);
  const db = { teamMember: { findUnique: async () => ({ role: "OWNER" }) } };
  assert.equal(await canAdministerBounty({ teamId: "t1" }, teamOwner, db), true);
});

test("a global admin's status change is sent", async () => {
  const page = mountTeamPage({ currentUser: globalAdmin, teamBounties: [oneAssignee] });
  await page.handleStatusChange("b1", "IN_PROGRESS");
  assert.deepEqual(page.calls, ["PATCH /api/bounties/b1/status"]);
});

for (const status of ["IN_PROGRESS", "DONE", "CANCELLED"]) {
  test(`a team owner's ${status} is sent to the status route`, async () => {
    const page = mountTeamPage({ currentUser: teamOwner, teamBounties: [oneAssignee] });
    await page.handleStatusChange("b1", status);
    assert.deepEqual(page.calls, ["PATCH /api/bounties/b1/status"]);
  });
}

test("a team owner picking a winner marks the bounty done before trimming the assignees", async () => {
  const page = mountTeamPage({ currentUser: teamOwner, teamBounties: [twoAssignees] });
  await page.handleStatusChange("b2", "DONE");
  await page.handleWinnerConfirm("b2", "h2");
  const status = page.calls.indexOf("PATCH /api/bounties/b2/status");
  const roster = page.calls.indexOf("POST /api/bounties/b2/assignees");
  assert.ok(status >= 0, `status never sent: ${JSON.stringify(page.calls)}`);
  assert.ok(roster < 0 || status < roster, `assignees trimmed first: ${JSON.stringify(page.calls)}`);
});

test("signed-out visitors send nothing", async () => {
  const page = mountTeamPage({ currentUser: null, teamBounties: [oneAssignee] });
  await page.handleStatusChange("b1", "IN_PROGRESS");
  assert.deepEqual(page.calls, []);
});
