const { spawn } = require("child_process");
const { existsSync } = require("fs");

const ANSI = /\u001b\[[0-9;]*m/g;

function parseBirthday(birthday) {
  if (birthday === undefined || birthday === null || birthday === "") {
    return "0";
  }
  if (typeof birthday === "number") {
    if (!Number.isSafeInteger(birthday) || birthday < 0) {
      throw new Error("Invalid wallet birthday");
    }
    return String(birthday);
  }
  if (typeof birthday === "string") {
    const trimmed = birthday.trim();
    if (!trimmed) return "0";
    if (!/^\d+$/.test(trimmed)) {
      throw new Error("Invalid wallet birthday");
    }
    const parsed = Number(trimmed);
    if (!Number.isSafeInteger(parsed)) {
      throw new Error("Invalid wallet birthday");
    }
    return String(parsed);
  }
  throw new Error("Invalid wallet birthday");
}

async function executeZingoCliSeed(params = {}, seed, birthday, timeout = 180000) {
  const zingoPath = process.env.ZINGO_CLI;
  if (!zingoPath || !existsSync(zingoPath)) {
    throw new Error(`zingo-cli not found at ${zingoPath}`);
  }
  if (typeof seed !== "string" || !seed.trim()) {
    throw new Error("Seed phrase required");
  }

  const normalizedBirthday = parseBirthday(birthday);
  const opts = params && typeof params === "object" ? params : {};
  const dataDir = opts.dataDir || "/mnt/d/zaino/zebra/.cache/zaino";

  const args = [
    "--chain",
    opts.chain || "mainnet",
    "--server",
    opts.serverUrl || "http://127.0.0.1:8137",
    "--data-dir",
    dataDir,
    "--birthday",
    normalizedBirthday,
  ];

  return new Promise((resolve, reject) => {
    // stdin must stay open: the REPL exits on EOF.
    // ZINGO_SEED (zingolib 6.0.0+) keeps the seed out of the process list.
    const proc = spawn(zingoPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ZINGO_SEED: seed },
    });

    let stdout = "";
    let stderr = "";
    let quitSent = false;
    let settled = false;
    let readyTimer = null;

    const sendQuit = () => {
      if (quitSent || settled || proc.stdin.destroyed) return;
      quitSent = true;
      proc.stdin.write("quit\n");
    };

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(fallback);
      if (readyTimer) {
        clearTimeout(readyTimer);
        readyTimer = null;
      }
      fn(value);
    };

    const maybeReady = () => {
      if (quitSent || readyTimer || settled) return;
      const all = (stdout + stderr).replace(ANSI, "");
      if (/Launching save task/i.test(all)) {
        readyTimer = setTimeout(sendQuit, 2000);
      }
    };

    proc.stdout.on("data", (d) => {
      stdout += d.toString();
      maybeReady();
    });

    proc.stderr.on("data", (d) => {
      stderr += d.toString();
      maybeReady();
    });

    proc.stdin.on("error", (e) =>
      console.error("ZINGO SEED STDIN:", e.message),
    );
    proc.on("error", (e) => finish(reject, e));

    const fallback = setTimeout(sendQuit, 60000);
    const timer = setTimeout(() => {
      if (!proc.killed) proc.kill();
      finish(reject, new Error("Zingo seed restore timeout"));
    }, timeout);

    proc.on("close", (code) => {
      if (code !== 0) {
        return finish(
          reject,
          new Error(`Zingo CLI exited with code ${code}: ${stderr || stdout}`),
        );
      }
      finish(resolve, {
        message: "Wallet restored",
        output: stdout.replace(ANSI, ""),
      });
    });
  });
}

executeZingoCliSeed.parseBirthday = parseBirthday;

module.exports = executeZingoCliSeed;
