const { execFile } = require("child_process");
const { existsSync } = require("fs");
const { promisify } = require("util");
const { isSafeShieldedAddress } = require("../../helpers/validateAddress.js");
const { ADDRESS_PATTERN } = require("./replCommand");

const execFileAsync = promisify(execFile);
const PARSE_TIMEOUT_MS = 30000;

function extractJsonObjects(text) {
  if (typeof text !== "string" || !text) return [];
  const results = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"' && depth > 0) {
      inString = true;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}" && depth > 0) {
      depth--;
      if (depth === 0 && start !== -1) {
        const candidate = text.slice(start, i + 1);
        try {
          results.push(JSON.parse(candidate));
        } catch {
          // Ignore non-JSON brace blocks emitted by CLI banners/logs
        }
        start = -1;
      }
    }
  }

  return results;
}

async function executeZingoParseAddress(zaddress, params = {}) {
  const command = "parse_address";
  if (!zaddress) throw new Error("No zaddress provided");
  if (typeof zaddress !== "string" || !ADDRESS_PATTERN.test(zaddress)) {
    return { status: "invalid" };
  }

  // Sink-level guard: never let a value that isn't a plain base58/bech32
  // address reach the wallet CLI, regardless of what the caller validated.
  if (!isSafeShieldedAddress(zaddress)) {
    throw new Error("Invalid address");
  }

  const zingoPath = process.env.ZINGO_CLI;
  if (!zingoPath || !existsSync(zingoPath)) {
    throw new Error(`zingo-cli not found at ${zingoPath}`);
  }

  const opts = params && typeof params === "object" ? params : {};

  // parse_address is local. --offline keeps v7 from starting the mixnet.
  // --offline conflicts with --server, so the server is omitted.
  const args = [
    "--chain",
    opts.chain || "testnet",
    "--offline",
    "--data-dir",
    opts.dataDir || "/error",
    command,
    zaddress,
  ];

  try {
    const { stdout: rawOutput } = await execFileAsync(zingoPath, args, {
      encoding: "utf8",
      timeout: PARSE_TIMEOUT_MS,
    });

    const noAnsi = rawOutput.replace(/\u001b\[[0-9;]*m/g, "");
    const parsed = extractJsonObjects(noAnsi);

    if (parsed.length === 1) return parsed[0];
    return parsed;
  } catch (error) {
    const detail =
      error.stderr?.toString().trim() ||
      error.stdout?.toString().trim() ||
      error.message;
    throw new Error(`Zingo CLI error: ${detail}`);
  }
}

executeZingoParseAddress.extractJsonObjects = extractJsonObjects;

module.exports = executeZingoParseAddress;
