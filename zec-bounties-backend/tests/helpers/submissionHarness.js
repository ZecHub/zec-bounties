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
      // Newer upstream routes import this helper; older branch bases do not.
      if (name === "../utils/userIdentity") return require("../../utils/userIdentity");
      throw new Error(`Unexpected dependency: ${name}`);
    },
    process: { env: { NODE_ENV: "test" } },
    console: { log() {}, error() {} },
    // Delayed cache invalidation is unrelated to submission correctness.
    setTimeout() {},
  }, { filename });
  return module.exports;
}

// Execute the real handler and onboarding guard; substitute only auth,
// cache and outbound services. Database tests supply real Prisma clients.
function loadSubmissionRoute(prisma) {
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
  });
  let handler;
  const router = Object.fromEntries(["get", "post", "put", "delete", "patch"].map(method => [method,
    (url, ...callbacks) => {
      if (method === "post" && url === "/:id/submit") handler = callbacks.at(-1);
    },
  ]));
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
    "../utils/bountyHelpers": helpers,
  });
  return {
    effects,
    async submit(user, bountyId, body = { description: "  Work completed  ", deliverableUrl: "  https://example.com/work  " }) {
      const req = { user, params: { id: bountyId }, body };
      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
      };
      await handler(req, res);
      return res;
    },
  };
}

module.exports = { loadSubmissionRoute };
