const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load(relativePath, dependencies) {
  const filename = path.join(__dirname, "../..", relativePath);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    exports: module.exports,
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
    process: { env: { NODE_ENV: "test" } },
    console: { log() {}, error() {} },
    // Delayed cache invalidation is unrelated to review correctness.
    setTimeout() {},
  }, { filename });
  return module.exports;
}

// Execute the real review handler and authorization helpers; substitute only auth,
// cache and outbound services. Database tests supply real Prisma clients. The
// assignee removal handler is exposed too: it applies the same rule when the
// last assignee goes.
function loadSubmissionReviewRoute(prisma) {
  const noOp = async () => {};
  const effects = { broadcasts: [], invalidations: [] };
  const cache = {
    delCache: async (key) => effects.invalidations.push(key),
    deleteCacheByPattern: async (key) => effects.invalidations.push(key),
    bumpVersion: noOp,
  };
  const helpers = load("utils/bountyHelpers.js", {
    "../prisma/client": prisma,
    "./cache": cache,
    "./sendMail": noOp,
    "./notifyUser": noOp,
    "../middleware/websocket": { sendRealtimeUpdate: (...args) => effects.broadcasts.push(args) },
  });
  const handlers = {};
  const router = Object.fromEntries(["get", "post", "put", "delete", "patch"].map(method => [method,
    (url, ...callbacks) => { handlers[`${method} ${url}`] = callbacks.at(-1); },
  ]));
  async function call(route, req) {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await handlers[route](req, res);
    return res;
  }
  load("routes/bounties.js", {
    express: { Router: () => router },
    "../prisma/client": prisma,
    "../helpers/email": {},
    "../middleware/auth": { authenticate: noOp, isAdmin: noOp, optionalAuthenticate: noOp },
    "../middleware/websocket": { sendRealtimeUpdate: (...args) => effects.broadcasts.push(args) },
    "../utils/cache": cache,
    "../utils/sendMail": noOp,
    "../utils/notifyUser": noOp,
    "../utils/discord/discordNotify": {},
    "../utils/discord/discordAssignWebhook": {},
    "../utils/constants": {},
    "../helpers/validateBounty": {},
    "../utils/userSelects": require("../../utils/userSelects"),
    "../utils/privacy": require("../../utils/privacy"),
    "../utils/bountyHelpers": helpers,
    "../utils/userIdentity": require("../../utils/userIdentity"),
    "../utils/bountySuggestionReview": require("../../utils/bountySuggestionReview"),
    "../utils/suggestionSettings": {
      getSuggestionSettings: async () => ({ mode: "open", threshold: 0 }),
      setSuggestionSettings: async () => ({ mode: "open", threshold: 0 }),
      invalidateSuggestionSettingsCache: () => {},
      VALID_MODES: new Set(["closed", "open", "threshold"]),
    },
    "../utils/bountyActivity": { logActivity: noOp, publishActivity: noOp },
  });
  return {
    effects,
    review(user, submissionId, body) {
      return call("patch /submissions/:submissionId/review", { user, params: { submissionId }, body });
    },
    removeAssignee(user, bountyId, userId) {
      return call("delete /:id/assignees/:userId", { user, params: { id: bountyId, userId } });
    },
  };
}

module.exports = { loadSubmissionReviewRoute };
