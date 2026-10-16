const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Stands in for every dependency a test does not care about: any property,
// call or `new` returns the stub again, and `await` resolves to it.
const anything = new Proxy(function () {}, {
  get: (_, key) => (key === "then" ? undefined : anything),
  apply: () => anything,
  construct: () => anything,
});
const withDefaults = (stubs) =>
  new Proxy(stubs, { get: (target, key) => (key in target ? target[key] : anything) });

function loadRoutes(team) {
  const effects = { emails: [], pushes: [], realtime: [], scoped: [] };
  const db = {
    team: { findUnique: async () => team },
    teamMember: { findUnique: async () => ({ role: "ADMIN" }) },
    bounty: {
      findUnique: async () => ({ id: "b1", teamId: "team-1", suggestionReviewStatus: "PENDING" }),
      updateMany: async () => ({ count: 1 }),
    },
  };
  const helpers = withDefaults({
    requireOnboarded: () => true,
    requireTaskCreation: (req, res, next) => next(),
    canAdministerBounty: async () => true,
    getBroadcastRecipients: async (bounty) => (bounty.isPrivate ? ["creator", "teammate"] : null),
    broadcastBountyEvent: async (...args) => effects.scoped.push(args),
    createBountyWithQuota: async (user, { data }) => ({
      id: "b1",
      ...data,
      createdByUser: { name: "Creator" },
    }),
    sendMailIfEnabled: async (mail) => effects.emails.push(mail.to),
    sendPushToOptedIn: async (ids) => effects.pushes.push(...ids),
    invalidateBounty: async () => {},
  });
  const dependencies = {
    express: {
      Router: () =>
        new Proxy({}, { get: (_, method) => (url, ...handlers) => { routes[`${method} ${url}`] = handlers; } }),
    },
    "../prisma/client": db,
    "../helpers/email": { formatEmailText: (text) => text },
    "../middleware/websocket": withDefaults({
      sendRealtimeUpdate: (...args) => effects.realtime.push(args),
    }),
    "../utils/cache": withDefaults({
      getCache: async () => [
        { id: "creator", email: "creator@example.com", emailNotifications: true, pushNotifications: true },
        { id: "teammate", email: "teammate@example.com", emailNotifications: true, pushNotifications: true },
        { id: "outsider", email: "outsider@example.com", emailNotifications: true, pushNotifications: true },
      ],
      bumpVersion: async () => {},
    }),
    "../utils/bountyHelpers": helpers,
    "../utils/bountySuggestionReview": require("../utils/bountySuggestionReview"),
  };
  const routes = {};
  const filename = path.join(__dirname, "../routes/bounties.js");
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(filename, "utf8"),
    {
      module,
      exports: module.exports,
      require: (name) => (Object.hasOwn(dependencies, name) ? dependencies[name] : anything),
      console: { log() {}, error() {} },
      process: { env: {} },
    },
    { filename },
  );
  return {
    effects,
    async call(route, req) {
      const res = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.body = payload;
          return this;
        },
      };
      await routes[route].at(-1)({ params: {}, body: {}, ...req }, res);
      // Email and push run after the response is sent.
      await new Promise((resolve) => setImmediate(resolve));
      return res;
    },
  };
}

const creator = { id: "creator", role: "TEAM" };
const newBounty = {
  title: "Private task",
  description: "Only the team should see this.",
  bountyAmount: 1,
  timeToComplete: "2099-01-01T00:00:00.000Z",
  teamId: "team-1",
};

test("a new private team bounty is emailed and pushed only to its team", async () => {
  const routes = loadRoutes({ id: "team-1", name: "Team", isVerified: true, isPrivate: true });
  const res = await routes.call("post /", { user: creator, body: newBounty });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(routes.effects.emails, ["teammate@example.com"]);
  assert.deepEqual(routes.effects.pushes, ["teammate"]);
  assert.deepEqual(routes.effects.realtime[0][3], ["creator", "teammate"]);
});

test("a new public team bounty is still announced", async () => {
  const routes = loadRoutes({ id: "team-1", name: "Team", isVerified: true, isPrivate: false });
  const res = await routes.call("post /", { user: creator, body: newBounty });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(routes.effects.emails, ["teammate@example.com", "outsider@example.com"]);
  assert.deepEqual(routes.effects.pushes, ["teammate", "outsider"]);
});

test("a suggestion review is sent only to the bounty's audience", async () => {
  const routes = loadRoutes(null);
  const res = await routes.call("patch /:id/suggestion-review", {
    user: creator,
    params: { id: "b1" },
    body: { action: "approve", reason: "Fits the roadmap" },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(routes.effects.realtime, []);
  assert.equal(routes.effects.scoped[0][0], "bounty_updated");
  assert.equal(routes.effects.scoped[0][2], "b1");
});
