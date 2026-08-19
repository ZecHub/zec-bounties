const { spawn } = require("child_process");
const { existsSync } = require("fs");

async function executeZingoCliSeed(params, seed, birthday) {
  const zingoPath = process.env.ZINGO_CLI;

  if (!existsSync(zingoPath)) {
    throw new Error(`zingo-cli not found at ${zingoPath}`);
  }

  const args = [
    "--chain",
    params.chain || "mainnet",
    "--server",
    params.serverUrl || "http://127.0.0.1:8137",
    "--data-dir",
    params.dataDir || "/mnt/d/zaino/zebra/.cache/zaino",
    "--seed",
    seed,
    "--birthday",
    String(birthday || 0),
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn(zingoPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("error", (error) => {
      reject(error);
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Zingo CLI error: ${
              stderr || stdout || `process exited with code ${code}`
            }`,
          ),
        );
        return;
      }

      const noAnsi = stdout.replace(/\u001b\[[0-9;]*m/g, "");

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

      if (parsed.length === 1) {
        resolve(parsed[0]);
      } else {
        resolve(parsed);
      }
    });
  });
}

module.exports = executeZingoCliSeed;
