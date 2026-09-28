const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Keep the production handlers, validators and authorization helpers. Replace application
// startup, auth and outbound services so tests cannot send notifications.
function loadModule(relativePath, dependencies, DateClass = Date) {
  const filename = path.join(__dirname, "../..", relativePath);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    exports: module.exports,
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
    process: { env: { NODE_ENV: "production" } },
    console: { log() {}, error() {} },
    Date: DateClass,
    setTimeout,
  }, { filename });
  return module.exports;
}

function loadHelpers(prisma, DateClass) {
  return loadModule("utils/bountyHelpers.js", {
    "../prisma/client": prisma,
    "./cache": { delCache: async () => {}, bumpVersion: async () => {} },
    "./sendMail": async () => {},
    "./notifyUser": async () => {},
  }, DateClass);
}

function loadRoutes(prisma) {
  const effects = { broadcasts: [], invalidations: 0, discord: [] };
  const noOp = async () => {};
  const helpers = loadHelpers(prisma);
  const cache = {
    getCache: async () => [],
    bumpVersion: async () => { effects.invalidations++; },
    delCache: noOp,
  };
  const dependencies = {
    "../prisma/client": prisma,
    "@prisma/client": { PrismaClient: function () { return prisma; } },
    "../helpers/email": { formatEmailText: (text) => text },
    "../middleware/auth": { authenticate: noOp, isAdmin: noOp, optionalAuthenticate: noOp },
    "../middleware/websocket": { sendRealtimeUpdate: (...args) => effects.broadcasts.push(args), sendToUser: noOp },
    "../utils/cache": cache,
    "../utils/sendMail": noOp,
    "../utils/notifyUser": noOp,
    "../utils/discord/discordNotify": { notifyNewBounty: (bounty) => effects.discord.push(bounty.id) },
    "../utils/discord/discordAssignWebhook": { notifyAssignment: noOp },
    "../utils/constants": { REQUIRED_TEAM_VERIFICATIONS: 3 },
    "../helpers/validateBounty": require("../../helpers/validateBounty"),
    "../utils/userSelects": require("../../utils/userSelects"),
    "../utils/bountyHelpers": helpers,
    "path": path,
    "multer": Object.assign(() => ({ single: () => noOp }), { memoryStorage: () => ({}) }),
    "fs": { promises: {} },
    "crypto": require("node:crypto"),
    "../zcash/init": { initZcashOnce: noOp, initZcashOnceForTeams: noOp },
    "../utils/zingo/getZingo": { invalidateZingo: noOp },
    "../helpers/zcash/zcashHelper.js": { getWalletDataDir: noOp },
    "../utils/ipfs/pinata": { uploadToPinata: noOp, pinataUrl: noOp },
  };
  for (const name of ["Seed", "Balance", "Addresses", "QuickSend", "Transactions", "Rescan", "Sync"]) {
    dependencies[`../utils/zingo/zingoLib${name}`] = noOp;
  }
  const handlers = {};
  for (const [name, file, method, route] of [["create", "bounties", "post", "/"], ["team", "teams", "post", "/:teamId/bounties"], ["edit", "bounties", "put", "/:id"]]) {
    const routes = [];
    const router = Object.fromEntries(["get", "post", "put", "delete", "patch"].map((method) => [method,
      (url, ...callbacks) => routes.push({ method, url, callbacks }),
    ]));
    loadModule(`routes/${file}.js`, { ...dependencies, express: { Router: () => router } });
    handlers[name] = routes.find((r) => r.method === method && r.url === route).callbacks.at(-1);
  }
  return {
    effects,
    async request(route, body, { user = { id: "admin", role: "ADMIN" }, teamId = "team1", bountyId = "b1" } = {}) {
      const req = { user, params: { teamId, id: bountyId }, body };
      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
      };
      await handlers[route](req, res);
      return res;
    },
  };
}

module.exports = { loadRoutes };
