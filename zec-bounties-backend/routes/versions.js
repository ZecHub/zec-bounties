const express = require("express");
const { execFile } = require("child_process");
const { existsSync } = require("fs");
const { promisify } = require("util");
const { authenticate, isAdmin } = require("../middleware/auth");
const prisma = require("../prisma/client");
const { redisClient } = require("../config/redis");

const router = express.Router();
const execFileAsync = promisify(execFile);

const backendPkg = require("../package.json");
const CACHE_MS = 60_000;
let cached = null;
let cachedAt = 0;

function row(name, version, source, status = "ok", detail) {
  return {
    name,
    version: version || "unknown",
    source,
    status,
    detail: detail || null,
  };
}

async function postgresVersion() {
  const rows = await prisma.$queryRaw`SELECT version()`;
  const full = rows?.[0]?.version || "";
  const match = full.match(/PostgreSQL\s+[\d.]+/);
  return row("PostgreSQL", match ? match[0] : null, "SELECT version()");
}

async function prismaMigration() {
  const rows = await prisma.$queryRaw`
    SELECT migration_name FROM _prisma_migrations
    ORDER BY finished_at DESC NULLS LAST LIMIT 1
  `;
  return rows?.[0]?.migration_name || null;
}

async function redisVersion() {
  const info = await redisClient.info("server");
  const match = String(info).match(/redis_version:(\S+)/);
  return row("Redis", match ? match[1] : null, "INFO server");
}

async function zingoVersion() {
  const bin = process.env.ZINGO_CLI;
  if (!bin)
    return row("zingo-cli", null, "ZINGO_CLI", "missing", "not configured");
  if (!existsSync(bin))
    return row("zingo-cli", null, "ZINGO_CLI", "missing", "binary not found");
  // --version prints the crate placeholder (version.rs is "0.1.1" on source
  // builds). The `version` command returns zingolib::git_description() and
  // does not open a wallet.
  try {
    const { stdout, stderr } = await execFileAsync(
      bin,
      ["--offline", "version"],
      { timeout: 5000 },
    );
    const text = (stdout || stderr || "")
      .trim()
      .split("\n")
      .filter(Boolean)
      .pop();
    if (text) return row("zingo-cli", text, "zingo-cli version");
  } catch {
    // fall through to the clap string
  }
  try {
    const { stdout, stderr } = await execFileAsync(bin, ["--version"], {
      timeout: 2000,
    });
    const text = (stdout || stderr || "").trim().split("\n")[0];
    return row(
      "zingo-cli",
      text || "configured",
      "zingo-cli --version",
      "ok",
      "placeholder; version command failed",
    );
  } catch {
    return row(
      "zingo-cli",
      null,
      "ZINGO_CLI",
      "unavailable",
      "version check failed",
    );
  }
}

function nymProxy() {
  const bin = process.env.ZINGO_NYM_PROXY;
  if (!bin)
    return row(
      "nym-proxy",
      null,
      "ZINGO_NYM_PROXY",
      "missing",
      "not configured",
    );
  if (!existsSync(bin))
    return row(
      "nym-proxy",
      null,
      "ZINGO_NYM_PROXY",
      "missing",
      "binary not found",
    );
  return row("nym-proxy", "configured", "ZINGO_NYM_PROXY");
}

async function collect() {
  const [pg, redis, zingo, migration] = await Promise.all([
    postgresVersion().catch(() =>
      row("PostgreSQL", null, "SELECT version()", "unavailable", "unavailable"),
    ),
    redisVersion().catch(() =>
      row("Redis", null, "INFO server", "unavailable", "unavailable"),
    ),
    zingoVersion(),
    prismaMigration().catch(() => null),
  ]);

  return {
    collectedAt: new Date().toISOString(),
    components: [
      row("Node.js", process.version, "process.version"),
      row("Backend", backendPkg.version, "package.json"),
      row(
        "Prisma",
        backendPkg.dependencies?.["@prisma/client"]?.replace("^", "") || null,
        "package.json",
        "ok",
        migration ? `last migration ${migration}` : null,
      ),
      pg,
      redis,
      zingo,
      nymProxy(),
      row(
        "Commit",
        process.env.BUILD_SHA || process.env.GIT_SHA || null,
        "BUILD_SHA",
      ),
      row("Uptime", `${Math.floor(process.uptime())}s`, "process.uptime"),
    ],
  };
}

router.get("/versions", authenticate, isAdmin, async (req, res) => {
  try {
    if (cached && Date.now() - cachedAt < CACHE_MS) {
      return res.json(cached);
    }
    const data = await collect();
    cached = data;
    cachedAt = Date.now();
    res.json(data);
  } catch {
    console.error("versions: collect failed");
    res.status(500).json({ error: "Failed to collect versions" });
  }
});

module.exports = router;
