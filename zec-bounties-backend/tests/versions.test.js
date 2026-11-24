const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createVersionsHarness({
  pgDelayMs = 0,
  failPg = false,
  failRedis = false,
  zingoCli = "",
  nymProxy = "",
  exists = () => false,
  execFileImpl = (_bin, _args, _opts, cb) => cb(new Error("not installed")),
} = {}) {
  const counts = { pg: 0, redis: 0, exec: 0 };

  const prisma = {
    $queryRaw: async (strings) => {
      const sql = Array.isArray(strings) ? strings.join("") : String(strings);
      if (sql.includes("version()")) {
        counts.pg += 1;
        if (pgDelayMs > 0) {
          await new Promise((r) => setTimeout(r, pgDelayMs));
        }
        if (failPg) throw new Error("pg down");
        return [{ version: "PostgreSQL 16.4 on x86_64-pc-linux-gnu" }];
      }
      return [{ migration_name: "20261101_init" }];
    },
  };

  const redisClient = {
    info: async () => {
      counts.redis += 1;
      if (failRedis) throw new Error("redis down");
      return "# Server\r\nredis_version:7.2.5\r\n";
    },
  };

  let getHandler;
  const router = {
    get(routePath, ...handlers) {
      if (routePath === "/versions") getHandler = handlers.at(-1);
    },
  };

  const dependencies = {
    express: { Router: () => router },
    child_process: {
      execFile(bin, args, opts, cb) {
        counts.exec += 1;
        return execFileImpl(bin, args, opts, cb);
      },
    },
    fs: { existsSync: exists },
    util: require("node:util"),
    "../middleware/auth": { authenticate() {}, isAdmin() {} },
    "../prisma/client": prisma,
    "../config/redis": { redisClient },
    "../package.json": {
      version: "1.2.3",
      dependencies: { "@prisma/client": "^5.22.0" },
    },
  };

  const filename = path.join(__dirname, "../routes/versions.js");
  const mod = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(filename, "utf8"),
    {
      module: mod,
      exports: mod.exports,
      require(name) {
        if (Object.hasOwn(dependencies, name)) return dependencies[name];
        throw new Error(`Unexpected dependency: ${name}`);
      },
      console: { log() {}, error() {} },
      process: {
        version: "v22.21.1",
        uptime: () => 42.9,
        env: {
          ZINGO_CLI: zingoCli,
          ZINGO_NYM_PROXY: nymProxy,
          BUILD_SHA: "abc1234",
        },
      },
    },
    { filename },
  );

  async function request() {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    await getHandler({}, res);
    return res;
  }

  return { counts, request, resetCache: mod.exports._resetCache };
}

test("GET /versions coalesces concurrent cold-cache requests into a single collect()", async () => {
  const h = createVersionsHarness({ pgDelayMs: 30 });
  const [r1, r2, r3] = await Promise.all([
    h.request(),
    h.request(),
    h.request(),
  ]);

  assert.equal(r1.statusCode, 200);
  assert.equal(r2.statusCode, 200);
  assert.equal(r3.statusCode, 200);
  assert.equal(h.counts.pg, 1);
  assert.equal(h.counts.redis, 1);
  assert.deepEqual(r1.body, r2.body);
  assert.deepEqual(r2.body, r3.body);

  // Subsequent request hits cache without re-querying
  const r4 = await h.request();
  assert.equal(r4.statusCode, 200);
  assert.equal(h.counts.pg, 1);
});

test("GET /versions trims whitespace-only ZINGO_CLI and ZINGO_NYM_PROXY env vars as missing", async () => {
  const h = createVersionsHarness({
    zingoCli: "   ",
    nymProxy: "\t  ",
    exists: () => true,
  });
  const res = await h.request();
  assert.equal(res.statusCode, 200);
  const byName = Object.fromEntries(
    res.body.components.map((c) => [c.name, c]),
  );
  assert.equal(byName["zingo-cli"].status, "missing");
  assert.equal(byName["zingo-cli"].detail, "not configured");
  assert.equal(byName["nym-proxy"].status, "missing");
  assert.equal(byName["nym-proxy"].detail, "not configured");
  assert.equal(h.counts.exec, 0);
});

test("GET /versions reports unavailable PostgreSQL/Redis gracefully and parses zingo-cli version", async () => {
  const h = createVersionsHarness({
    failPg: true,
    failRedis: true,
    zingoCli: " /usr/local/bin/zingo-cli ",
    exists: (p) => p === "/usr/local/bin/zingo-cli",
    execFileImpl: (bin, args, _opts, cb) => {
      assert.equal(bin, "/usr/local/bin/zingo-cli");
      assert.deepEqual(Array.from(args), ["--offline", "version"]);
      cb(null, { stdout: "zingo-cli v6.1.0-git\n", stderr: "" });
    },
  });

  const res = await h.request();
  assert.equal(res.statusCode, 200);
  const byName = Object.fromEntries(
    res.body.components.map((c) => [c.name, c]),
  );
  assert.equal(byName.PostgreSQL.status, "unavailable");
  assert.equal(byName.Redis.status, "unavailable");
  assert.equal(byName["zingo-cli"].status, "ok");
  assert.equal(byName["zingo-cli"].version, "zingo-cli v6.1.0-git");
});

test("_resetCache clears cached response so next call collects fresh data", async () => {
  const h = createVersionsHarness();
  await h.request();
  assert.equal(h.counts.pg, 1);
  h.resetCache();
  await h.request();
  assert.equal(h.counts.pg, 2);
});
