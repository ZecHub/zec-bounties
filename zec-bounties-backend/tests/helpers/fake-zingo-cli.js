#!/usr/bin/env node
// Stand-in for the zingo-cli REPL, spawned by ZingoProcess via ZINGO_CLI.
// FAKE_ZINGO_MODE picks the quicksend output, copied from real zingo-cli:
//   v6         zingolib_v6.0.0 zingo-cli/src/commands.rs (txids + transmissions)
//   ironwood   zingolib_beta_ironwood: transmit heartbeat on stderr, then txids
//   error      {"error": ...}; FAKE_ZINGO_ERROR overrides the message
//   hang       never answers
// FAKE_ZINGO_LOG, if set, gets one line per command received.
const fs = require("fs");
const readline = require("readline");

const mode = process.env.FAKE_ZINGO_MODE || "v6";
const log = process.env.FAKE_ZINGO_LOG;
let sends = 0;

const out = (text) => process.stdout.write(text + "\n");
const txidFor = (n) => n.toString(16).padStart(64, "0");

// zingo-cli splits each line with shellwords and prints this when a quote
// is left open.
const quotesBalanced = (line) => {
  let single = false;
  let double = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (single) {
      if (ch === "'") single = false;
    } else if (double) {
      if (ch === "\\") i++;
      else if (ch === '"') double = false;
    } else if (ch === "'") single = true;
    else if (ch === '"') double = true;
    else if (ch === "\\") i++;
  }
  return !single && !double;
};

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  if (log) fs.appendFileSync(log, line + "\n");

  if (!quotesBalanced(line)) return out("Mismatched Quotes");

  if (line === "sync status") {
    // Slow enough that a send written right after it would still be
    // waiting when this lands.
    setTimeout(
      () =>
        out(
          JSON.stringify(
            { sync_status: "complete", percentage_total_outputs_scanned: 100 },
            null,
            2,
          ),
        ),
      100,
    );
    return;
  }

  if (line === "balance") {
    process.stderr.write("fetching balance...\n");
    setTimeout(() => out("[\n  confirmed_orchard_balance: 1_000\n]"), 100);
    return;
  }

  if (!line.startsWith("quicksend ")) return;

  const txid = txidFor(++sends);
  setTimeout(() => {
    if (mode === "v6") {
      out(
        JSON.stringify(
          {
            txids: [txid],
            transmissions: [
              {
                txid,
                over_mixnet: false,
                destination: "https://zec.rocks:443",
                rtt_ms: 812,
              },
            ],
          },
          null,
          2,
        ),
      );
    } else if (mode === "ironwood") {
      process.stderr.write("quicksend: transmitting 1 of 1...\n");
      setTimeout(() => out(JSON.stringify({ txids: [txid] }, null, 2)), 50);
    } else if (mode === "error") {
      const error =
        process.env.FAKE_ZINGO_ERROR ||
        "Insufficient balance (have 1000, need 30010000 including fee)";
      out(JSON.stringify({ error }, null, 2));
    }
  }, 150);
});
