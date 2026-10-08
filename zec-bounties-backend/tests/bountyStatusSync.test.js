const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function privateFieldPaths(value, path = "$", found = []) {
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const childPath = path + "." + key;
      if (["email", "z_address", "UA_address"].includes(key)) found.push(childPath);
      privateFieldPaths(child, childPath, found);
    }
  }
  return found;
}

// Load the actual route module with an in-memory database and cache. No server,
// Redis, wallet, notifications, or production credentials are used.
function fixture(status = "IN_PROGRESS", submissionStatus = "pending") {
  const trace = [];
  const routes = new Map();
  const router = Object.fromEntries(["get", "post", "put", "patch", "delete"].map(method => [
    method, (path, ...handlers) => routes.set(method + " " + path, handlers.at(-1)),
  ]));
  const row = { id: "bounty", status, isApproved: true, createdBy: "creator", assignee: "hunter", teamId: null };
  const assignees = [{ userId: "hunter" }];
  const submission = { id: "submission", bountyId: row.id, submittedBy: "hunter", status: submissionStatus,
    description: "Fixture work", submittedAt: new Date() };
  // Seed private fields and honor the route's actual Prisma user selections.
  // Otherwise a privacy assertion on the old id-only mocks would always pass.
  const selectUser = (id, select) => {
    const user = { id, name: id, nickname: id, avatar: null, role: "HUNTER",
      email: id + "@example.invalid", z_address: "fixture-shielded", UA_address: "fixture-unified" };
    return Object.fromEntries(Object.entries(user).filter(([key]) => !select || select[key]));
  };
  const submissionWithRelations = (include = {}) => ({
    ...submission,
    ...(include.submitterUser && { submitterUser: selectUser(submission.submittedBy, include.submitterUser.select) }),
    ...(include.reviewerUser && { reviewerUser: submission.reviewedBy
      ? selectUser(submission.reviewedBy, include.reviewerUser.select) : null }),
  });
  const bountyWithRelations = (include = {}) => ({
    ...row,
    ...(include.createdByUser && { createdByUser: selectUser(row.createdBy, include.createdByUser.select) }),
    ...(include.assigneeUser && { assigneeUser: row.assignee
      ? selectUser(row.assignee, include.assigneeUser.select) : null }),
    ...(include.assignees && { assignees: assignees.map(a => ({
      ...a, user: selectUser(a.userId, include.assignees.include?.user?.select),
    })) }),
    ...(include.workSubmissions && { workSubmissions: [submissionWithRelations(include.workSubmissions.include)] }),
  });
  let version = 1;
  const cachedVersion = version;
  const cached = { ...row };
  const prisma = {
    bounty: {
      findUnique: async () => ({ ...row, assignees: [...assignees], workSubmissions: [] }),
      update: async ({ data, include }) => {
        Object.assign(row, data);
        return bountyWithRelations(include);
      },
    },
    bountyAssignee: {
      findUnique: async () => ({ userId: "hunter" }),
      deleteMany: async () => { assignees.length = 0; },
    },
    workSubmission: {
      create: async ({ data, include }) => {
        Object.assign(submission, data);
        return submissionWithRelations(include);
      },
      findUnique: async () => ({ ...submission, bounty: { ...row } }),
      findFirst: async () => null,
      update: async ({ data, include }) => {
        Object.assign(submission, data);
        return submissionWithRelations(include);
      },
    },
    $transaction: async work => typeof work === "function" ? work(prisma) : Promise.all(work),
  };
  const noop = () => {};
  const modules = {
    express: { Router: () => router },
    "../prisma/client": prisma,
    "../helpers/email": {},
    "../middleware/auth": { authenticate: noop, isAdmin: noop, optionalAuthenticate: noop },
    "../middleware/websocket": { sendRealtimeUpdate: (type, payload) => trace.push({ type, payload }) },
    "../utils/cache": {
      delCache: async key => trace.push({ invalidated: key }),
      deleteCacheByPattern: async key => trace.push({ invalidated: key }),
      TTL: {},
    },
    "../utils/sendMail": noop,
    "../utils/notifyUser": noop,
    "../utils/discord/discordNotify": {},
    "../utils/discord/discordAssignWebhook": {},
    "../utils/constants": {},
    "../helpers/validateBounty": {},
    "../utils/userSelects": require("../utils/userSelects"),
    "../utils/userIdentity": {},
    "../utils/bountyHelpers": {
      requireOnboarded: () => true,
      invalidateBounty: async id => {
        version++;
        trace.push({ invalidated: "bounty:" + id });
      },
    },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("../routes/bounties"), "utf8"), {
    require(name) {
      if (!(name in modules)) throw new Error("Unexpected dependency: " + name);
      return modules[name];
    },
    module: { exports: {} }, process: { env: { NODE_ENV: "test" } }, console,
    // The retry only clears submission caches again; don't create timers.
    setTimeout: noop,
  });
  return {
    trace, row,
    readBounty: () => version === cachedVersion ? cached : { ...row },
    async request(method, path, body, role = "ADMIN") {
      let response;
      let statusCode = 200;
      const res = { status(code) { statusCode = code; return this; }, json(value) { response = value; } };
      await routes.get(method + " " + path)({ params: { id: "bounty", submissionId: "submission" },
        user: { id: role === "ADMIN" ? "admin" : "hunter", role }, body }, res);
      assert.equal(statusCode, 200, JSON.stringify(response));
      return response;
    },
  };
}

for (const scenario of [
  { name: "change status directly", method: "patch", path: "/:id/status", initial: "TO_DO", input: { status: "IN_PROGRESS" }, expected: "IN_PROGRESS" },
  { name: "submit work", method: "post", path: "/:id/submit", initial: "IN_PROGRESS", input: { description: "Finished" }, role: "HUNTER", expected: "IN_REVIEW" },
  { name: "approve work", method: "patch", path: "/submissions/:submissionId/review", initial: "IN_REVIEW", input: { status: "approved" }, expected: "DONE" },
  { name: "request revision", method: "patch", path: "/submissions/:submissionId/review", initial: "IN_REVIEW", input: { status: "needs_revision" }, expected: "IN_PROGRESS" },
  { name: "reject work", method: "patch", path: "/submissions/:submissionId/review", initial: "IN_REVIEW", input: { status: "rejected" }, expected: "IN_PROGRESS" },
  { name: "resubmit revision", method: "patch", path: "/submissions/:submissionId", initial: "IN_PROGRESS", submissionStatus: "needs_revision", input: { description: "Revision completed" }, role: "HUNTER", expected: "IN_REVIEW" },
]) {
  test(scenario.name + " returns authoritative bounty data and invalidates before broadcasting", async () => {
    const api = fixture(scenario.initial, scenario.submissionStatus);
    const result = await api.request(scenario.method, scenario.path, scenario.input, scenario.role);
    const updatedBounty = result.bounty ?? result;
    assert.equal(updatedBounty.status, scenario.expected);
    assert.equal(api.readBounty().status, scenario.expected, "a cached bounty read must return the new status");
    const invalidateIndex = api.trace.findIndex(e => e.invalidated === "bounty:bounty");
    const eventIndex = api.trace.findIndex(e => e.type);
    assert.ok(invalidateIndex >= 0 && invalidateIndex < eventIndex, "invalidate bounty caches before any event can trigger a read");
    assert.ok(Array.isArray(updatedBounty.assignees), "keep assignment-dependent open details authoritative");
    if (scenario.input.status === "rejected") assert.equal(updatedBounty.assignees.length, 0);
    assert.deepEqual(privateFieldPaths({ response: result, broadcasts: api.trace.filter(e => e.type).map(e => e.payload) }),
      [], "JSON responses and broadcast payloads must not expose private user fields at any depth");
  });
}
