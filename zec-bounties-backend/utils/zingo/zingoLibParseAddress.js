const { execFile } = require("child_process");
const { existsSync } = require("fs");
const { promisify } = require("util");
const { isSafeShieldedAddress } = require("../../helpers/validateAddress.js");
const { ADDRESS_PATTERN } = require("./replCommand");

const execFileAsync = promisify(execFile);
const PARSE_TIMEOUT_MS = 30000;

async function executeZingoParseAddress(zaddress, params) {
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
  if (!existsSync(zingoPath)) {
    throw new Error(`zingo-cli not found at ${zingoPath}`);
  }

  // parse_address is local. --offline keeps v7 from starting the mixnet.
  // --offline conflicts with --server, so the server is omitted.
  const args = [
    "--chain",
    params.chain || "testnet",
    "--offline",
    "--data-dir",
    params.dataDir || "/error",
    command,
    zaddress,
  ];

  try {
    const { stdout: rawOutput } = await execFileAsync(zingoPath, args, {
      encoding: "utf8",
      timeout: PARSE_TIMEOUT_MS,
    });

    const noAnsi = rawOutput.replace(/\u001b\[[0-9;]*m/g, "");
    const jsonBlocks = noAnsi.match(/\{[\s\S]*?\}/g) || [];

    const parsed = jsonBlocks
      .map((block) => {
        try {
          return JSON.parse(block);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

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

module.exports = executeZingoParseAddress;