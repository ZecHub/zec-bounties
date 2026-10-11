const { execFile } = require("child_process");
const { existsSync } = require("fs");
const { promisify } = require("util");

const { ADDRESS_PATTERN } = require("./replCommand");

const execFileAsync = promisify(execFile);
const PARSE_TIMEOUT_MS = 15000;

async function executeZingoParseAddress(zaddress, params) {
  const command = "parse_address";
  if (!zaddress) throw new Error("No zaddress provided");
  if (typeof zaddress !== "string" || !ADDRESS_PATTERN.test(zaddress)) {
    return { status: "invalid" };
  }

  const zingoPath = process.env.ZINGO_CLI;

  if (!existsSync(zingoPath)) {
    throw new Error(`zingo-cli not found at ${zingoPath}`);
  }

  const args = [
    "--chain",
    params.chain || "testnet",
    "--server",
    params.serverUrl || "https://testnet.zec.rocks:443",
    "--data-dir",
    params.dataDir || "/error",
    command,
    zaddress,
  ];

  try {
    // 1️⃣ Run CLI and capture full output
    const { stdout: rawOutput } = await execFileAsync(zingoPath, args, {
      encoding: "utf8",
      timeout: PARSE_TIMEOUT_MS,
    });

    // 2️⃣ Strip ANSI color codes
    const noAnsi = rawOutput.replace(/\u001b\[[0-9;]*m/g, "");

    // 3️⃣ Extract JSON blocks (any {…} including newlines)
    const jsonBlocks = noAnsi.match(/\{[\s\S]*?\}/g) || [];

    // 4️⃣ Parse each JSON block safely
    const parsed = jsonBlocks
      .map((block) => {
        try {
          return JSON.parse(block);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    // 5️⃣ Return array if >1 objects, or object if just 1
    if (parsed.length === 1) return parsed[0];
    return parsed;
  } catch (error) {
    throw new Error(
      `Zingo CLI error: ${error.stderr?.toString() || error.message}`,
    );
  }
}

module.exports = executeZingoParseAddress;
