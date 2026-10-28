const { spawn } = require("child_process");
const { existsSync } = require("fs");
const {
  assertFixedCommand,
  parseAddressLine,
  quicksendLine,
} = require("./replCommand");

// ---------------------------------------------------------------------------
// Logging
// Off unless ZINGO_DEBUG=1. ZINGO_LOG_MAX controls truncation (chars).
// Never log raw stdout or stderr: recovery_info prints the wallet seed.
// ---------------------------------------------------------------------------
const DEBUG = process.env.ZINGO_DEBUG === "1";
const LOG_MAX = Number(process.env.ZINGO_LOG_MAX) || 20000;
const ANSI = /\u001b\[[0-9;]*m/g;

function preview(value, max = LOG_MAX) {
  let s;
  try {
    s = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    s = String(value);
  }
  s = String(s).replace(ANSI, "");
  return s.length > max ? `${s.slice(0, max)}…(+${s.length - max} chars)` : s;
}

function log(tag, message, data) {
  if (!DEBUG) return;
  const head = `[${new Date().toISOString()}] [ZINGO:${tag}] ${message}`;
  if (data === undefined) console.log(head);
  else console.log(`${head}\n${preview(data)}`);
}

function extractJson(text) {
  let start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;

  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth--;

    if (depth === 0) {
      return text.slice(start, i + 1);
    }
  }

  return null;
}

// Extract complete top-level JSON blocks while respecting nested objects
// and braces inside JSON strings.
function extractJsonBlocks(text) {
  const blocks = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}" && depth > 0) {
      depth--;
      if (depth === 0) {
        blocks.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return blocks;
}

function extractJsonAddress(text) {
  let start = text.indexOf("[");

  if (start !== -1) {
    let depth = 0;

    for (let i = start; i < text.length; i++) {
      if (text[i] === "[") depth++;
      else if (text[i] === "]") depth--;

      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;

  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth--;

    if (depth === 0) {
      return text.slice(start, i + 1);
    }
  }

  return null;
}

function parseZingoBalance(output) {
  const lines = output
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        !l.startsWith("Launching") &&
        !l.startsWith("Save") &&
        !l.startsWith("Zingo") &&
        l !== "[" &&
        l !== "]",
    );

  const result = {};

  for (const line of lines) {
    const [key, value] = line.split(":").map((s) => s.trim());
    if (!key || !value) continue;

    // Convert numeric values; replace NaN with null
    const num = Number(value.replace(/_/g, ""));
    result[key.replace(/['"]/g, "")] = isNaN(num) ? null : num;
  }

  // Return JSON string instead of object
  return JSON.stringify(result);
}

function parseTransactionBlock(block) {
  const root = {};
  const stack = [{ obj: root, key: null }];

  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(1, -1);

  for (const line of lines) {
    if (line === "{") {
      const parent = stack[stack.length - 1];
      const key = parent.key;

      if (!Array.isArray(parent.obj[key])) {
        parent.obj[key] = parent.obj[key] ? [parent.obj[key]] : [];
      }

      const obj = {};
      parent.obj[key].push(obj);
      stack.push({ obj, key: null });
      continue;
    }

    if (line === "}") {
      stack.pop();
      continue;
    }

    const m = line.match(/^(.+?):\s*(.*)$/);
    if (!m) continue;

    const key = m[1].trim();
    const raw = m[2].trim();
    const current = stack[stack.length - 1];

    if (raw === "") {
      current.key = key;
      current.obj[key] = current.obj[key] || {};
    } else {
      current.obj[key] = /^\d+$/.test(raw) ? Number(raw) : raw;
    }
  }

  return root;
}

function parseRecoveryInfo(output) {
  const match = output.match(/Wallet backup info:\s*(\{[\s\S]*?\})/);

  if (!match) return null;

  const result = {};

  match[1]
    .replace(/[{}]/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return;

      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();

      result[key] = /^\d+$/.test(value) ? Number(value) : value;
    });

  return result;
}

class ZingoProcess {
  constructor(params = {}) {
    this.zingoPath = process.env.ZINGO_CLI;

    if (!existsSync(this.zingoPath)) {
      throw new Error(`zingo-cli not found at ${this.zingoPath}`);
    }

    const args = [
      "--chain",
      params.chain || "mainnet",
      "--server",
      params.serverUrl || "http://127.0.0.1:8137",
      "--data-dir",
      params.dataDir || "/mnt/d/zaino/zebra/.cache/zaino",
    ];

    log("constructor", `spawning ${this.zingoPath}`, args.join(" "));

    this.proc = spawn(this.zingoPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    log("constructor", `spawned pid=${this.proc.pid}`);

    this.buffer = "";
    this.waiters = [];

    // Run commands sequentially so their output cannot be mixed up.
    this.queue = Promise.resolve();

    // Set when a command gave up (timeout, stderr, bad parse) while its
    // output may still be on the way. That output would land in the next
    // command's window, so sends refuse to run here and getZingo hands
    // senders a fresh process.
    this.tainted = false;
    this.exited = false;

    this.proc.on("error", (err) => {
      log("process", `spawn/process error: ${err.message}`);
    });

    this.proc.stdout.on("data", (data) => {
      const text = data.toString();
      this.buffer += text;

      // Resolve any pending command waiting for output
      this.waiters.forEach((w) => w());
    });

    this.proc.stderr.on("data", (data) => {
      const message = data.toString().replace(/\u001b\[[0-9;]*m/g, "");

      const meaningful = message
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter(
          (line) =>
            !/^Server-Selection Sweep:/i.test(line) &&
            !/^Launching (?:sync|save) task\.\.\.$/i.test(line) &&
            !/^balance failed:\s*undefined$/i.test(line),
        );

      // Zingo sends normal startup and sync progress through stderr.
      // Do not log known progress messages as errors.
      if (meaningful.length) {
        console.error("ZINGO STDERR:", meaningful.join("\n"));
      }
    });

    this.proc.on("exit", (code, signal) => {
      this.exited = true;
      log("process", `exit code=${code} signal=${signal}`);
      console.error("Zingo exited with code", code);
    });

    // A write racing the process exit surfaces as EPIPE here; without a
    // listener it would crash the server.
    this.proc.stdin.on("error", (err) => {
      console.error("ZINGO STDIN:", err.message);
    });
  }

  // Runs `command` after every earlier command on this process has settled.
  exclusive(command, name = "command") {
    const queuedAt = Date.now();
    log("queue", `${name}: queued`);

    const run = this.queue.then(async () => {
      if (this.exited || this.proc.killed) {
        log("queue", `${name}: refused, process has exited`);
        throw new Error("zingo process has exited");
      }

      const startedAt = Date.now();
      log("queue", `${name}: started (waited ${startedAt - queuedAt}ms)`);

      try {
        const result = await command();
        log(
          "queue",
          `${name}: finished in ${Date.now() - startedAt}ms`,
          result,
        );
        return result;
      } catch (err) {
        log(
          "queue",
          `${name}: FAILED in ${Date.now() - startedAt}ms`,
          err.message,
        );
        throw err;
      }
    });

    this.queue = run.then(
      () => undefined,
      () => {
        this.tainted = true;
        log("queue", `${name}: process marked tainted`);
      },
    );

    return run;
  }

  quit(command, timeout = 30000) {
    return new Promise((resolve, reject) => {
      let buffer = "";
      let timer;

      log("quit", `sending "${command}" (timeout ${timeout}ms)`);

      const cleanup = () => {
        clearTimeout(timer);
        this.proc.stdout.off("data", onData);
        this.proc.stderr.off("data", onError);
        this.proc.off("close", onClose);
      };

      const onData = (chunk) => {
        buffer += chunk.toString();
      };

      const onError = (chunk) => {
        console.error("Zingo stderr:", chunk.toString());
      };

      const onClose = (code) => {
        cleanup();

        console.log("Zingo exited with code", code);
        log("quit", `closed with code ${code}`, buffer);

        if (code === 0) {
          resolve({
            message: "Quit successful",
            output: buffer,
          });
        } else {
          reject(new Error(`Zingo exited with code ${code}`));
        }
      };

      timer = setTimeout(() => {
        cleanup();
        log("quit", "TIMEOUT, output so far:", buffer);
        reject(new Error("Quit command timeout"));
      }, timeout);

      this.proc.stdout.on("data", onData);
      this.proc.stderr.on("data", onError);
      this.proc.on("close", onClose);

      this.proc.stdin.write(assertFixedCommand(command) + "\n");
    });
  }

  rescan(command, timeout = 360000) {
    return new Promise((resolve, reject) => {
      let buffer = "";
      let resolved = false;

      log("rescan", `sending "${command}" (timeout ${timeout}ms)`);

      const onData = (chunk) => {
        buffer += chunk.toString();
        const clean = buffer.replace(/\u001b\[[0-9;]*m/g, "");

        // Check if "Launching rescan..." appeared
        if (clean.includes("Launching rescan...") && !resolved) {
          resolved = true;
          log("rescan", "saw 'Launching rescan...', resolving in 3s");

          setTimeout(() => {
            log("rescan", "resolved", clean);
            resolve({ message: "Rescan launched", output: clean });
          }, 3000);
        }
      };

      const onError = (err) => {
        cleanup();
        log("rescan", "stderr rejection", err.toString());
        reject(err);
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.proc.stdout.off("data", onData);
        this.proc.stderr.off("data", onError);
      };

      const timer = setTimeout(() => {
        cleanup();
        log("rescan", "TIMEOUT, output so far:", buffer);
        reject(new Error("Rescan command timeout"));
      }, timeout);

      this.proc.stdout.on("data", onData);
      this.proc.stderr.on("data", onError);

      this.proc.stdin.write(assertFixedCommand(command) + "\n");
    });
  }

  sync(command, timeout = 360000) {
    return new Promise((resolve, reject) => {
      const startBufferLen = this.buffer.length;

      log("sync", `sending "${command}" (timeout ${timeout}ms)`);
      this.proc.stdin.write(assertFixedCommand(command) + "\n");

      const check = () => {
        const chunk = this.buffer.slice(startBufferLen);

        // Remove ANSI
        const clean = chunk.replace(/\u001b\[[0-9;]*m/g, "");

        const jsonText = extractJson(clean);

        if (jsonText) {
          try {
            const parsed = JSON.parse(jsonText);
            log("sync", "resolved", parsed);
            resolve(parsed);
          } catch (e) {
            log("sync", `JSON parse failed: ${e.message}`, jsonText);
            reject(e);
          }

          return true;
        }

        return false;
      };

      const interval = setInterval(() => {
        if (check()) {
          clearInterval(interval);
          clearTimeout(timer);
        }
      }, 50);

      const timer = setTimeout(() => {
        clearInterval(interval);
        log(
          "sync",
          "TIMEOUT, output so far:",
          this.buffer.slice(startBufferLen),
        );
        reject(new Error("Zingo command timeout"));
      }, timeout);

      this.waiters.push(() => {
        if (check()) {
          clearInterval(interval);
          clearTimeout(timer);
        }
      });
    });
  }

  addresses(command, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const startBufferLen = this.buffer.length;

      log("addresses", `sending "${command}" (timeout ${timeout}ms)`);
      this.proc.stdin.write(assertFixedCommand(command) + "\n");

      const check = () => {
        const chunk = this.buffer.slice(startBufferLen);

        // Remove ANSI
        const clean = chunk.replace(/\u001b\[[0-9;]*m/g, "");

        const jsonText = extractJsonAddress(clean);

        if (jsonText) {
          try {
            const parsed = JSON.parse(jsonText);
            log("addresses", "resolved", parsed);
            resolve(parsed);
          } catch (e) {
            log("addresses", `JSON parse failed: ${e.message}`, jsonText);
            reject(e);
          }

          return true;
        }

        return false;
      };

      const interval = setInterval(() => {
        if (check()) {
          clearInterval(interval);
          clearTimeout(timer);
        }
      }, 50);

      const timer = setTimeout(() => {
        clearInterval(interval);
        log(
          "addresses",
          "TIMEOUT, output so far:",
          this.buffer.slice(startBufferLen),
        );
        reject(new Error("Zingo command timeout"));
      }, timeout);

      this.waiters.push(() => {
        if (check()) {
          clearInterval(interval);
          clearTimeout(timer);
        }
      });
    });
  }

  balance(command, timeout = 360000) {
    return new Promise((resolve, reject) => {
      let buffer = "";

      log("balance", `sending "${command}" (timeout ${timeout}ms)`);

      const onData = (chunk) => {
        buffer += chunk.toString();

        const clean = buffer.replace(/\u001b\[[0-9;]*m/g, "");
        const jsonText = parseZingoBalance(clean);

        if (jsonText && jsonText !== "{}") {
          cleanup();
          const parsed = JSON.parse(jsonText);
          log("balance", "resolved", parsed);
          resolve(parsed);
        }
      };

      // Stderr is not a reliable failure signal for Zingo. Normal server
      // selection, sync and save progress is written there even when balance
      // succeeds. Do not reject with a Buffer; let stdout determine success.
      const onStderr = (chunk) => {
        const clean = chunk.toString().replace(/\u001b\[[0-9;]*m/g, "");

        const meaningful = clean
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .filter(
            (line) =>
              !/^Server-Selection Sweep:/i.test(line) &&
              !/^Launching (?:sync|save) task\.\.\.$/i.test(line) &&
              !/^balance failed:\s*undefined$/i.test(line),
          );

        if (meaningful.length) {
          console.error("ZINGO balance stderr:", meaningful.join("\n"));
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.proc.stdout.off("data", onData);
        this.proc.stderr.off("data", onStderr);
      };

      const timer = setTimeout(() => {
        cleanup();
        log("balance", "TIMEOUT, output so far:", buffer);
        reject(new Error("Zingo command timeout"));
      }, timeout);

      this.proc.stdout.on("data", onData);
      this.proc.stderr.on("data", onStderr);

      this.proc.stdin.write(assertFixedCommand(command) + "\n");
    });
  }

  parseAddress(zaddress, timeout = 30000) {
    return new Promise((resolve, reject) => {
      if (!zaddress) {
        log("parseAddress", "rejected: no zaddress provided");
        reject(new Error("No zaddress provided"));
        return;
      }

      let command;

      try {
        command = parseAddressLine(zaddress);
      } catch (err) {
        log("parseAddress", `rejected: ${err.message}`);
        reject(err);
        return;
      }

      const startBufferLen = this.buffer.length;
      log("parseAddress", `sending "${command}" (timeout ${timeout}ms)`);
      this.proc.stdin.write(command + "\n");

      const check = () => {
        const chunk = this.buffer.slice(startBufferLen);
        const clean = chunk.replace(/\u001b\[[0-9;]*m/g, "");

        const jsonText = extractJsonAddress(clean);

        if (jsonText) {
          try {
            const parsed = JSON.parse(jsonText);
            log("parseAddress", "resolved", parsed);
            resolve(parsed);
          } catch (e) {
            log("parseAddress", `JSON parse failed: ${e.message}`, jsonText);
            reject(e);
          }

          return true;
        }

        return false;
      };

      const interval = setInterval(() => {
        if (check()) {
          clearInterval(interval);
          clearTimeout(timer);
        }
      }, 50);

      const timer = setTimeout(() => {
        clearInterval(interval);
        log(
          "parseAddress",
          "TIMEOUT, output so far:",
          this.buffer.slice(startBufferLen),
        );
        reject(new Error("Zingo parse_address timeout"));
      }, timeout);

      this.waiters.push(() => {
        if (check()) {
          clearInterval(interval);
          clearTimeout(timer);
        }
      });
    });
  }

  // Resolves with { txids, error, timedOut, raw, stderr }.
  async quicksend(recipients, timeout = 360000) {
    log(
      "quicksend",
      `called with ${recipients.length} recipient(s)`,
      recipients,
    );

    // An address rides inside the single-quoted REPL command and mutating
    // one would redirect funds, so reject, never sanitize.
    const sanitizedRecipients = recipients.map((r) => {
      if (!/^[a-z0-9]+$/i.test(String(r.address))) {
        log("quicksend", `refusing malformed address: ${String(r.address)}`);
        throw new Error("Refusing to send to malformed address");
      }

      return {
        address: r.address,
        amount: Math.ceil(Number(r.amount)),
        // zingo-cli splits the line with shellwords, so a quote in a memo
        // (bounty titles end up here) cuts the argument short and the REPL
        // answers "Mismatched Quotes". Strip rather than fail the batch.
        memo: (r.memo || "Sent from the ZEC bounty app!").replace(/'/g, ""),
      };
    });

    const command = `quicksend '${JSON.stringify(sanitizedRecipients)}'`;

    const run = () =>
      new Promise((resolve) => {
        let stdoutBuf = "";
        let stderrBuf = "";

        const cleanup = () => {
          clearTimeout(timer);
          this.proc.stdout.off("data", onData);
          this.proc.stderr.off("data", onStderr);
        };

        const settle = (outcome) => {
          cleanup();
          const result = { raw: stdoutBuf, stderr: stderrBuf, ...outcome };
          log("quicksend", "settled", result);
          resolve(result);
        };

        const onData = (chunk) => {
          stdoutBuf += chunk.toString();
          const clean = stdoutBuf.replace(/\u001b\[[0-9;]*m/g, "");

          // zingo-cli prints one result block: {"txids":[...]} (6.x adds
          // "transmissions") on success, {"error":...} on failure. Blocks
          // with neither — a background sync result, say — are not ours.
          // A txids block wins wherever it sits: wrongly reporting a failure
          // releases the bounties for a second payment.
          let failure = null;

          for (const block of extractJsonBlocks(clean)) {
            let parsed;

            try {
              parsed = JSON.parse(block);
            } catch {
              log("quicksend", "skipping unparseable JSON block", block);
              continue;
            }

            log("quicksend", "parsed JSON block", parsed);

            if (Array.isArray(parsed.txids) && parsed.txids.length > 0) {
              return settle({
                txids: parsed.txids.map(String),
                error: null,
                timedOut: false,
              });
            }

            if (parsed.error != null && failure === null) {
              failure =
                typeof parsed.error === "string"
                  ? parsed.error
                  : JSON.stringify(parsed.error);
            }
          }

          if (failure !== null) {
            settle({ txids: [], error: failure, timedOut: false });
          }
        };

        // Zingo may write progress to stderr while a send is in flight.
        // Keep it for diagnostics rather than failing a send automatically.
        const onStderr = (chunk) => {
          stderrBuf += chunk.toString();
        };

        const timer = setTimeout(() => {
          // Outcome unknown, and a late result from this send would land in
          // the next command's window. Kill the process; getZingo spawns a
          // clean one, and a send that did go out shows up in wallet history
          // for POST /records/:id/resolve.
          log("quicksend", `TIMEOUT after ${timeout}ms, killing process`);
          settle({ txids: [], error: null, timedOut: true });
          this.destroy();
        }, timeout);

        this.proc.stdout.on("data", onData);
        this.proc.stderr.on("data", onStderr);

        log("quicksend", "sending command", command);
        this.proc.stdin.write(command + "\n");
      });

    return this.exclusive(() => {
      if (this.tainted) {
        log("quicksend", "refused: process is tainted, nothing sent");
        throw new Error(
          "zingo process may still be printing an earlier command's output; nothing was sent",
        );
      }
      return run();
    }, "quicksend");
  }

  transactions(timeout = 360000) {
    const command = "transactions";
    return new Promise((resolve, reject) => {
      let buffer = "";

      log("transactions", `sending "${command}" (timeout ${timeout}ms)`);

      const onData = (chunk) => {
        buffer += chunk.toString();

        const clean = buffer.replace(/\u001b\[[0-9;]*m/g, "");

        const blocks = clean.match(/\{\n[\s\S]*?\n\}/g) || [];

        if (blocks.length > 0) {
          cleanup();
          log("transactions", `matched ${blocks.length} raw block(s)`, blocks);

          const parsed = blocks
            .map((block) => {
              try {
                return parseTransactionBlock(block);
              } catch (e) {
                console.error("Parse error:", e);
                log("transactions", `block parse error: ${e.message}`, block);
                return null;
              }
            })
            .filter(Boolean);

          log(
            "transactions",
            `resolved with ${parsed.length} transaction(s)`,
            parsed,
          );
          resolve(parsed);
        }
      };

      const onError = (err) => {
        cleanup();
        log("transactions", "stderr rejection", err.toString());
        reject(err);
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.proc.stdout.off("data", onData);
        this.proc.stderr.off("data", onError);
      };

      const timer = setTimeout(() => {
        cleanup();
        log("transactions", "TIMEOUT, output so far:", buffer);
        reject(new Error("Zingo transactions timeout"));
      }, timeout);

      this.proc.stdout.on("data", onData);
      this.proc.stderr.on("data", onError);

      this.proc.stdin.write(assertFixedCommand(command) + "\n");
    });
  }

  recovery_info(command = "recovery_info", timeout = 30000) {
    return new Promise((resolve, reject) => {
      let buffer = "";

      log("recovery_info", `sending "${command}" (timeout ${timeout}ms)`);

      const onData = (chunk) => {
        buffer += chunk.toString();

        const clean = buffer.replace(/\u001b\[[0-9;]*m/g, "");

        const parsed = parseRecoveryInfo(clean);

        if (parsed) {
          cleanup();
          // Deliberately NOT logging values: this contains the wallet seed.
          log(
            "recovery_info",
            `resolved (values redacted), keys: ${Object.keys(parsed).join(", ")}`,
          );
          resolve(parsed);
        }
      };

      const onError = (err) => {
        cleanup();
        log("recovery_info", "stderr rejection", err.toString());
        reject(err);
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.proc.stdout.off("data", onData);
        this.proc.stderr.off("data", onError);
      };

      const timer = setTimeout(() => {
        cleanup();
        log("recovery_info", "TIMEOUT (output withheld, may contain seed)");
        reject(new Error("Zingo recovery_info timeout"));
      }, timeout);

      this.proc.stdout.on("data", onData);
      this.proc.stderr.on("data", onError);

      this.proc.stdin.write(assertFixedCommand(command) + "\n");
    });
  }

  info(command = "info", timeout = 360000) {
    return new Promise((resolve, reject) => {
      let buffer = "";

      log("info", `sending "${command}" (timeout ${timeout}ms)`);

      const cleanup = () => {
        clearTimeout(timer);
        this.proc.stdout.off("data", onData);
        this.proc.stderr.off("data", onError);
      };

      const tryParseJSON = (text) => {
        const clean = text.replace(/\u001b\[[0-9;]*m/g, "");

        // fast path: find first complete JSON object
        const start = clean.indexOf("{");
        const end = clean.lastIndexOf("}");

        if (start === -1 || end === -1 || end <= start) return null;

        const candidate = clean.slice(start, end + 1);

        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      };

      const onData = (chunk) => {
        buffer += chunk.toString();

        const parsed = tryParseJSON(buffer);

        if (parsed) {
          cleanup();
          log("info", "resolved", parsed);
          resolve(parsed);
        }
      };

      const onError = (err) => {
        cleanup();
        log("info", "stderr rejection", err.toString?.() || err);
        reject(new Error(`Zingo stderr error: ${err.toString?.() || err}`));
      };

      const timer = setTimeout(() => {
        cleanup();
        log("info", "TIMEOUT, output so far:", buffer);
        reject(new Error("Zingo info timeout"));
      }, timeout);

      this.proc.stdout.on("data", onData);
      this.proc.stderr.on("data", onError);

      this.proc.stdin.write(assertFixedCommand(command) + "\n");
    });
  }

  destroy() {
    log("destroy", `killing process pid=${this.proc && this.proc.pid}`);
    if (this.proc && !this.proc.killed) {
      this.proc.kill();
    }
  }
}

// Route read commands through the same queue as sends so output windows
// do not overlap.
for (const name of [
  "quit",
  "rescan",
  "sync",
  "addresses",
  "balance",
  "parseAddress",
  "transactions",
  "recovery_info",
  "info",
]) {
  const command = ZingoProcess.prototype[name];

  ZingoProcess.prototype[name] = function (...args) {
    return this.exclusive(() => command.apply(this, args), name);
  };
}

module.exports = ZingoProcess;
