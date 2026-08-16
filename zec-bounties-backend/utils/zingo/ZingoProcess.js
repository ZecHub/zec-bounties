const { spawn } = require("child_process");
const { existsSync } = require("fs");

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

  return null; // incomplete JSON
}

// All complete top-level {...} blocks in the text, nesting-safe. The old
// non-greedy regex here stopped at the first "}", which sheared any nested
// object and made the parse fail silently.
function extractJsonBlocks(text) {
  const blocks = [];
  let depth = 0;
  let start = -1;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === "}" && depth > 0) {
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

    this.proc = spawn(this.zingoPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.buffer = "";
    this.waiters = [];

    // Sends are serialized through this chain. The process is shared per
    // (chain, server, dataDir), and two overlapping quicksends would each be
    // reading the other's stdout — the first result block resolves both.
    // For a payment that means one caller gets told "success" off someone
    // else's send. Reads racing a send only corrupt a display, so they are
    // left concurrent.
    this.sendChain = Promise.resolve();

    this.proc.stdout.on("data", (data) => {
      const text = data.toString();
      this.buffer += text;

      // Resolve any pending command waiting for output
      this.waiters.forEach((w) => w());
    });

    this.proc.stderr.on("data", (data) => {
      console.error("ZINGO STDERR:", data.toString());
    });

    this.proc.on("exit", (code) => {
      console.error("Zingo exited with code", code);
    });
  }

  quit(command, timeout = 10000) {
    return new Promise((resolve, reject) => {
      let buffer = "";
      let timer;

      const cleanup = () => {
        clearTimeout(timer);
        this.proc.stdout.off("data", onData);
        this.proc.stderr.off("data", onError);
        this.proc.off("close", onClose);
      };

      const onData = (chunk) => {
        buffer += chunk.toString();
        console.log("Quit output chunk:", buffer);
      };

      const onError = (chunk) => {
        console.error("Zingo stderr:", chunk.toString());
      };

      const onClose = (code) => {
        cleanup();

        console.log("Zingo exited with code", code);

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
        reject(new Error("Quit command timeout"));
      }, timeout);

      this.proc.stdout.on("data", onData);
      this.proc.stderr.on("data", onError);
      this.proc.on("close", onClose);

      this.proc.stdin.write(command + "\n");
    });
  }

  rescan(command, timeout = 10000) {
    return new Promise((resolve, reject) => {
      let buffer = "";
      let resolved = false;

      const onData = (chunk) => {
        buffer += chunk.toString();
        const clean = buffer.replace(/\u001b\[[0-9;]*m/g, "");
        console.log("rescan output chunk:", clean);

        // Check if "Launching rescan..." appeared
        if (clean.includes("Launching rescan...") && !resolved) {
          resolved = true;
          // Wait 3s to let it print final status messages
          setTimeout(() => {
            resolve({ message: "Rescan launched", output: clean });
          }, 3000);
        }
      };

      const onError = (err) => {
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.proc.stdout.off("data", onData);
        this.proc.stderr.off("data", onError);
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Rescan command timeout"));
      }, timeout);

      this.proc.stdout.on("data", onData);
      this.proc.stderr.on("data", onError);

      this.proc.stdin.write(command + "\n");
    });
  }

  sync(command, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const startBufferLen = this.buffer.length;

      this.proc.stdin.write(command + "\n");

      const check = () => {
        const chunk = this.buffer.slice(startBufferLen);
        console.log("chunk", chunk);

        // Remove ANSI
        const clean = chunk.replace(/\u001b\[[0-9;]*m/g, "");

        const jsonText = extractJson(clean);
        if (jsonText) {
          try {
            resolve(JSON.parse(jsonText));
          } catch (e) {
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

  addresses(command, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const startBufferLen = this.buffer.length;

      this.proc.stdin.write(command + "\n");

      const check = () => {
        const chunk = this.buffer.slice(startBufferLen);
        console.log("chunk", chunk);

        // Remove ANSI
        const clean = chunk.replace(/\u001b\[[0-9;]*m/g, "");

        const jsonText = extractJsonAddress(clean);
        console.log("json", jsonText);
        if (jsonText) {
          try {
            resolve(JSON.parse(jsonText));
          } catch (e) {
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

  balance(command, timeout = 10000) {
    return new Promise((resolve, reject) => {
      let buffer = "";

      const onData = (chunk) => {
        buffer += chunk.toString();
        const clean = buffer.replace(/\u001b\[[0-9;]*m/g, "");
        const jsonText = parseZingoBalance(clean);

        if (jsonText && jsonText !== "{}") {
          cleanup();
          resolve(JSON.parse(jsonText));
        }
      };

      const onError = (err) => {
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.proc.stdout.off("data", onData);
        this.proc.stderr.off("data", onError);
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Zingo command timeout"));
      }, timeout);

      this.proc.stdout.on("data", onData);
      this.proc.stderr.on("data", onError);

      this.proc.stdin.write(command + "\n");
    });
  }

  parseAddress(zaddress, timeout = 10000) {
    return new Promise((resolve, reject) => {
      if (!zaddress) {
        reject(new Error("No zaddress provided"));
        return;
      }
      // Reject control characters — the address is written to stdin as a
      // single line; a raw newline would let it be interpreted as a
      // second, attacker-chosen command by the zingo-cli REPL.
      if (/[\r\n]/.test(zaddress)) {
        reject(new Error("Invalid address"));
        return;
      }

      const startBufferLen = this.buffer.length;
      const command = `parse_address ${zaddress}`;
      this.proc.stdin.write(command + "\n");

      const check = () => {
        const chunk = this.buffer.slice(startBufferLen);
        const clean = chunk.replace(/\u001b\[[0-9;]*m/g, "");

        const jsonText = extractJsonAddress(clean);
        if (jsonText) {
          try {
            resolve(JSON.parse(jsonText));
          } catch (e) {
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

  // Resolves with { txids, error, timedOut, raw, stderr }. Never rejects once
  // the command has been written: from that point the send may be on the
  // network, so every exit path has to hand the caller something it can
  // persist. "timedOut" means outcome unknown — NOT "did not happen".
  quicksend(recipients, timeout = 60000) {
    const sanitizedRecipients = recipients.map((r) => {
      // Defense in depth behind the route-level check: an address rides
      // inside the single-quoted REPL command, and mutating one would
      // redirect funds — so reject, never sanitize. Throwing here is safe:
      // nothing has been written to the wallet yet.
      if (!/^[a-z0-9]+$/i.test(String(r.address))) {
        throw new Error("Refusing to send to malformed address");
      }
      return {
        address: r.address,
        amount: Math.ceil(Number(r.amount)),
        // A quote inside a memo (bounty titles end up here) would cut the
        // single-quoted argument short. Strip rather than fail the batch.
        memo: (r.memo || "Sent from the ZEC bounty app!").replace(/'/g, ""),
      };
    });

    const command = `quicksend '${JSON.stringify(sanitizedRecipients)}'`;

    const run = () =>
      new Promise((resolve) => {
        let stdoutBuf = "";
        let stderrBuf = "";
        let timer;

        const cleanup = () => {
          clearTimeout(timer);
          this.proc.stdout.off("data", onData);
          this.proc.stderr.off("data", onError);
        };

        const settle = (outcome) => {
          cleanup();
          resolve({ raw: stdoutBuf, stderr: stderrBuf, ...outcome });
        };

        const onData = (chunk) => {
          stdoutBuf += chunk.toString();
          const clean = stdoutBuf.replace(/\u001b\[[0-9;]*m/g, "");

          // zingolib answers with one flat block — {"txids":[...]} on success,
          // {"error":...} on failure. Sync progress and log lines can precede
          // it, so keep reading until a block actually carries the outcome
          // instead of grabbing the first "{...}" we see.
          for (const block of extractJsonBlocks(clean)) {
            let parsed;
            try {
              parsed = JSON.parse(block);
            } catch {
              continue;
            }

            if (Array.isArray(parsed.txids)) {
              return settle({
                txids: parsed.txids,
                error: null,
                timedOut: false,
              });
            }
            if (parsed.error !== undefined) {
              return settle({
                txids: [],
                error:
                  typeof parsed.error === "string"
                    ? parsed.error
                    : JSON.stringify(parsed.error),
                timedOut: false,
              });
            }
          }
        };

        // zingo logs to stderr in normal operation; collect it for diagnostics
        // instead of failing the send over a log line.
        const onError = (chunk) => {
          stderrBuf += chunk.toString();
        };

        timer = setTimeout(() => {
          settle({ txids: [], error: null, timedOut: true });
        }, timeout);

        this.proc.stdout.on("data", onData);
        this.proc.stderr.on("data", onError);

        this.proc.stdin.write(command + "\n");
      });

    const send = this.sendChain.then(run);
    this.sendChain = send.then(
      () => undefined,
      () => undefined,
    );
    return send;
  }

  transactions(timeout = 10000) {
    const command = "transactions";
    return new Promise((resolve, reject) => {
      let buffer = "";

      const onData = (chunk) => {
        buffer += chunk.toString();

        const clean = buffer.replace(/\u001b\[[0-9;]*m/g, "");
        console.log("transactions chunk:", clean);

        const blocks = clean.match(/\{\n[\s\S]*?\n\}/g) || [];

        if (blocks.length > 0) {
          cleanup();

          const parsed = blocks
            .map((block) => {
              try {
                return parseTransactionBlock(block); // ✅ use custom parser
              } catch (e) {
                console.error("Parse error:", e);
                return null;
              }
            })
            .filter(Boolean);

          resolve(parsed);
        }
      };

      const onError = (err) => {
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.proc.stdout.off("data", onData);
        this.proc.stderr.off("data", onError);
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Zingo transactions timeout"));
      }, timeout);

      this.proc.stdout.on("data", onData);
      this.proc.stderr.on("data", onError);

      this.proc.stdin.write(command + "\n");
    });
  }

  recovery_info(command = "recovery_info", timeout = 10000) {
    return new Promise((resolve, reject) => {
      let buffer = "";

      const onData = (chunk) => {
        buffer += chunk.toString();

        const clean = buffer.replace(/\u001b\[[0-9;]*m/g, "");

        console.log("recovery_info chunk:", clean);

        const parsed = parseRecoveryInfo(clean);

        if (parsed) {
          cleanup();
          resolve(parsed);
        }
      };

      const onError = (err) => {
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.proc.stdout.off("data", onData);
        this.proc.stderr.off("data", onError);
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Zingo recovery_info timeout"));
      }, timeout);

      this.proc.stdout.on("data", onData);
      this.proc.stderr.on("data", onError);

      this.proc.stdin.write(command + "\n");
    });
  }

  info(command = "info", timeout = 10000) {
    return new Promise((resolve, reject) => {
      let buffer = "";

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

        console.log("info chunk:", chunk.toString());

        const parsed = tryParseJSON(buffer);

        if (parsed) {
          cleanup();
          resolve(parsed);
        }
      };

      const onError = (err) => {
        cleanup();
        reject(new Error(`Zingo stderr error: ${err.toString?.() || err}`));
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Zingo info timeout"));
      }, timeout);

      this.proc.stdout.on("data", onData);
      this.proc.stderr.on("data", onError);

      this.proc.stdin.write(command + "\n");
    });
  }

  destroy() {
    if (this.proc && !this.proc.killed) {
      this.proc.kill();
    }
  }
}

module.exports = ZingoProcess;
