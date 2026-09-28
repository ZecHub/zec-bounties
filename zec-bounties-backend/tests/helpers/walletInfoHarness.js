const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");

function load(file, dependencies) {
  const filename = path.join(__dirname, "../..", file);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    exports: module.exports,
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
    console: { log() {}, error() {} },
    process: { env: { ZINGO_CLI: "fixture-zingo" } },
    // A command returning non-JSON must time out without a ten-second test.
    setTimeout: fn => setTimeout(fn, 10),
    clearTimeout,
  }, { filename });
  return module.exports;
}

// Exercise the actual route, command adapter, process initialization and info
// parser. The child-process boundary is fake; no CLI or wallet is opened.
function createWalletInfoHarness({ defaults, failInfo = false } = {}) {
  const forbidden = () => { throw new Error("Unexpected live side effect"); };
  const wallet = { walletId: "fixture-wallet", accountName: "Main", chain: "mainnet" };
  const pendingDefaults = defaults ? [...defaults] : [wallet];
  const effects = { commands: [], initializations: [], walletLookups: [], processParams: [] };
  const proc = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(), stderr: new EventEmitter(),
    stdin: Object.assign(new EventEmitter(), {
      write(command) {
        effects.commands.push(command);
        queueMicrotask(() => {
          if (failInfo) {
            proc.stderr.emit("data", Buffer.from("fixture server unavailable"));
          } else {
            // The info command returns JSON; v6 rescan acknowledges in text.
            const response = command === "info\n"
              ? JSON.stringify({ chain_name: "main", block_height: 100 })
              : "Launching rescan...";
            proc.stdout.emit("data", Buffer.from(response));
          }
        });
      },
    }),
  });
  const ZingoProcess = load("utils/zingo/ZingoProcess.js", {
    child_process: { spawn: () => proc }, fs: { existsSync: () => true },
  });
  const zingo = new ZingoProcess(wallet);
  const executeInfo = load("utils/zingo/zingoLibInfo.js", {
    "./getZingo": { getZingo(params) { effects.processParams.push(params); return zingo; } },
  });
  const authenticate = () => {};
  const isAdmin = () => {};
  let callbacks;
  const router = Object.fromEntries(["get", "post", "put", "patch", "delete", "use"].map(method => [method,
    (url, ...handlers) => { if (method === "get" && url === "/info") callbacks = handlers; },
  ]));
  load("routes/zcash.js", {
    express: { Router: () => router }, axios: {}, bcrypt: {}, jsonwebtoken: {},
    "../prisma/client": {},
    "../middleware/auth": { authenticate, isAdmin },
    "../zcash/init": { initZcashOnce: async (...args) => effects.initializations.push(args) },
    "../utils/zingo/zingoLibSeed": forbidden,
    "../helpers/zcash/zcashHelper.js": {
      getWalletDataDir: forbidden,
      getDefaultZcashParams: async userId => {
        effects.walletLookups.push(userId);
        return pendingDefaults.shift() ?? null;
      },
    },
    "../utils/zingo/zingoLibInfo": executeInfo,
    "../middleware/websocket": { sendRealtimeUpdate: forbidden },
    fs: { promises: { rm: forbidden } }, path,
    "../utils/zingo/getZingo": { invalidateZingo: forbidden },
  });
  return {
    effects, callbacks, authenticate, isAdmin, wallet,
    async request() {
      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
      };
      await callbacks.at(-1)({ user: { id: "fixture-admin", role: "ADMIN" } }, res);
      return res;
    },
  };
}

module.exports = { createWalletInfoHarness };
