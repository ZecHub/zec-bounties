// Payout tracker on the bounty detail page: the step logic, the polling
// rules, how the page reacts to server/permission failures, and the real
// tracker component rendered to HTML.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function loadTs(relative, requireFixture, extraGlobals = {}) {
  const filename = path.resolve(__dirname, "..", relative);
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, []);
  const module = { exports: {} };
  vm.runInNewContext(
    result.outputText,
    {
      module, exports: module.exports, require: requireFixture,
      Date, Number, String, Array, Object, Promise, Error, isNaN, console,
      setTimeout, clearTimeout, navigator: {}, ...extraGlobals,
    },
    { filename },
  );
  return module.exports;
}

const lib = loadTs("lib/payout-status.ts", (id) => {
  throw new Error(`Unexpected dependency: ${id}`);
});
const explorer = loadTs("lib/explorer.ts", () => {
  throw new Error("explorer has no dependencies");
});

// Icons render as <svg data-icon="Name"> so tests can see which one was used.
const icons = new Proxy({}, {
  get: (_, name) => () => React.createElement("svg", { "data-icon": String(name) }),
});
const { PayoutStatusView } = loadTs("components/payout-status-tracker.tsx", (id) => {
  if (id === "react") return React;
  if (id === "react/jsx-runtime") return require("react/jsx-runtime");
  if (id === "lucide-react") return icons;
  if (id === "@/lib/configENV") return { backendUrl: "http://backend.test" };
  if (id === "@/lib/explorer") return explorer;
  if (id === "@/lib/payout-status") return lib;
  throw new Error(`Unexpected component dependency: ${id}`);
});

const TXID = "ab".repeat(32);
const stamps = {
  approvedAt: "2026-10-10T10:00:00.000Z",
  queuedAt: "2026-10-11T10:00:00.000Z",
  broadcastAt: "2026-10-11T10:00:20.000Z",
  confirmedAt: "2026-10-11T10:05:00.000Z",
};
const status = (extra = {}) => ({
  bountyId: "b1",
  state: "BROADCAST",
  txid: TXID,
  memoRef: "Bounty: Fix thing (ID: b1)",
  chain: "MAIN",
  timestamps: { ...stamps, confirmedAt: null },
  error: null,
  backend: { reachable: true, checkedAt: stamps.broadcastAt },
  ...extra,
});
const html = (s) => renderToStaticMarkup(React.createElement(PayoutStatusView, { status: s }));
// Arrays built inside the vm context have another realm's prototype.
const stepStatuses = (s) => Array.from(lib.getStepStatuses(s));

describe("getStepStatuses", () => {
  it("fills steps up to the current one", () => {
    assert.deepEqual(stepStatuses({ state: "APPROVED" }), ["current", "upcoming", "upcoming", "upcoming"]);
    assert.deepEqual(stepStatuses({ state: "QUEUED" }), ["done", "current", "upcoming", "upcoming"]);
    assert.deepEqual(stepStatuses({ state: "BROADCAST" }), ["done", "done", "current", "upcoming"]);
  });

  it("completes every step once confirmed", () => {
    assert.deepEqual(stepStatuses({ state: "CONFIRMED" }), ["done", "done", "done", "done"]);
  });

  it("marks a failed or stalled payout on the Queued step", () => {
    const failed = { state: "APPROVED", error: { code: "failed", message: "x" } };
    const unknown = { state: "QUEUED", error: { code: "unknown", message: "x" } };
    assert.deepEqual(stepStatuses(failed), ["done", "problem", "upcoming", "upcoming"]);
    assert.deepEqual(stepStatuses(unknown), ["done", "problem", "upcoming", "upcoming"]);
  });

  it("leaves the steps alone when only the node is unreachable", () => {
    const down = { state: "BROADCAST", error: { code: "backend_unreachable", message: "x" } };
    assert.deepEqual(stepStatuses(down), ["done", "done", "current", "upcoming"]);
  });

  it("has nothing in progress before approval", () => {
    assert.deepEqual(stepStatuses({ state: null }), ["upcoming", "upcoming", "upcoming", "upcoming"]);
    assert.deepEqual(stepStatuses(null), ["upcoming", "upcoming", "upcoming", "upcoming"]);
  });
});

describe("nextPollDelay", () => {
  it("keeps checking while a payout is moving", () => {
    assert.equal(lib.nextPollDelay({ state: "QUEUED" }), lib.POLL_ACTIVE_MS);
    assert.equal(lib.nextPollDelay({ state: "BROADCAST" }), lib.POLL_ACTIVE_MS);
  });

  it("stops once confirmed, or once a failure needs a person", () => {
    assert.equal(lib.nextPollDelay({ state: "CONFIRMED" }), null);
    assert.equal(
      lib.nextPollDelay({ state: "APPROVED", error: { code: "failed", message: "x" } }),
      null,
    );
    assert.equal(lib.nextPollDelay(null), null);
  });

  it("slows down while the node is unreachable", () => {
    assert.equal(
      lib.nextPollDelay({ state: "BROADCAST", backend: { reachable: false } }),
      lib.POLL_BACKOFF_MS,
    );
  });
});

describe("formatting", () => {
  it("formats timestamps and tolerates missing or invalid ones", () => {
    assert.match(lib.formatPayoutTime("2026-10-11T10:05:00.000Z"), /Oct 11, 2026/);
    assert.equal(lib.formatPayoutTime(null), null);
    assert.equal(lib.formatPayoutTime("not a date"), null);
  });

  it("shortens a txid but keeps short ones", () => {
    assert.equal(lib.shortTxid(TXID), `${TXID.slice(0, 10)}…${TXID.slice(-8)}`);
    assert.equal(lib.shortTxid("abc"), "abc");
  });
});

describe("requestPayoutStatus", () => {
  const respond = (init) => async () => ({
    ok: init.status >= 200 && init.status < 300,
    status: init.status,
    json: async () => init.body,
  });

  it("returns the status on success", async () => {
    const out = await lib.requestPayoutStatus("/x", {}, respond({ status: 200, body: status() }));
    assert.equal(out.kind, "ok");
    assert.equal(out.status.state, "BROADCAST");
  });

  it("hides the tracker for signed-out, uninvolved or missing", async () => {
    for (const code of [401, 403, 404]) {
      const out = await lib.requestPayoutStatus("/x", {}, respond({ status: code, body: {} }));
      assert.equal(out.kind, "hidden", `HTTP ${code}`);
    }
  });

  it("reports an error, not a crash, when the server fails or is unreachable", async () => {
    const serverError = await lib.requestPayoutStatus("/x", {}, respond({ status: 500, body: {} }));
    assert.equal(serverError.kind, "error");

    const offline = await lib.requestPayoutStatus("/x", {}, async () => {
      throw new TypeError("Failed to fetch");
    });
    assert.equal(offline.kind, "error");
  });

  it("lets an aborted request propagate", async () => {
    await assert.rejects(
      lib.requestPayoutStatus("/x", {}, async () => {
        const e = new Error("aborted");
        e.name = "AbortError";
        throw e;
      }),
      { name: "AbortError" },
    );
  });
});

describe("PayoutStatusView", () => {
  const stepAttrs = (markup, state) =>
    markup.match(new RegExp(`<li data-step="${state}" data-status="([a-z]+)"`))?.[1];

  it("renders nothing before approval", () => {
    assert.equal(html({ bountyId: "b1", state: null }), "");
  });

  it("shows all four states in order", () => {
    const markup = html(status());
    const order = ["Approved", "Queued", "Broadcast", "Confirmed"].map((l) => markup.indexOf(`>${l}`));
    assert.ok(order.every((i) => i > 0));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
  });

  it("marks the current step and exposes it to assistive tech", () => {
    const markup = html(status());
    assert.equal(stepAttrs(markup, "APPROVED"), "done");
    assert.equal(stepAttrs(markup, "BROADCAST"), "current");
    assert.equal(stepAttrs(markup, "CONFIRMED"), "upcoming");
    assert.match(markup, /data-step="BROADCAST"[^>]*aria-current="step"/);
    assert.match(markup, /<ol aria-label="Payout progress"/);
  });

  it("shows a timestamp for reached steps and Pending for the rest", () => {
    const markup = html(status());
    assert.match(markup, /Oct 10, 2026/);
    assert.match(markup, /Oct 11, 2026/);
    assert.match(markup, /Pending/);
    assert.doesNotMatch(html(status({ state: "CONFIRMED", timestamps: stamps })), /Pending/);
  });

  it("links the transaction to the right explorer for the chain", () => {
    const main = html(status());
    assert.match(main, new RegExp(`href="https://blockchair.com/zcash/transaction/${TXID}"`));
    assert.match(main, /rel="noopener noreferrer"/);

    const test = html(status({ chain: "TEST" }));
    assert.match(test, new RegExp(`href="https://zexplorer.app/testnet/tx/${TXID}"`));
  });

  it("shows the memo reference while there is no txid yet", () => {
    const markup = html(status({ state: "QUEUED", txid: null }));
    assert.doesNotMatch(markup, /View on explorer/);
    assert.match(markup, /Bounty: Fix thing \(ID: b1\)/);
  });

  it("shows a clear error message when the payout fails", () => {
    const markup = html(status({
      state: "APPROVED",
      txid: null,
      error: { code: "failed", message: "The payout could not be sent. It will be retried." },
    }));
    assert.match(markup, /role="alert"/);
    assert.match(markup, /The payout could not be sent/);
    assert.equal(stepAttrs(markup, "QUEUED"), "problem");
    assert.match(markup, /— problem/);
  });

  it("shows admin-only failure detail when the server provides it", () => {
    const markup = html(status({
      state: "APPROVED",
      txid: null,
      error: { code: "failed", message: "Could not send.", detail: "insufficient funds" },
    }));
    assert.match(markup, /insufficient funds/);
    assert.doesNotMatch(html(status({
      state: "APPROVED", txid: null,
      error: { code: "failed", message: "Could not send." },
    })), /insufficient funds/);
  });

  it("warns, without alarming, when the Zcash backend is unreachable", () => {
    const markup = html(status({
      error: { code: "backend_unreachable", message: "We can't reach the Zcash node right now." },
      backend: { reachable: false, checkedAt: stamps.broadcastAt },
    }));
    assert.match(markup, /role="status"/);
    assert.doesNotMatch(markup, /role="alert"/);
    assert.match(markup, /We can&#x27;t reach the Zcash node right now/);
    assert.match(markup, /Last checked/);
    // The payout itself is still shown, with its txid.
    assert.equal(stepAttrs(markup, "BROADCAST"), "current");
    assert.match(markup, /View on explorer/);
  });

  it("offers a refresh control only when given a handler", () => {
    assert.doesNotMatch(html(status()), /Refresh payout status/);
    const withRefresh = renderToStaticMarkup(
      React.createElement(PayoutStatusView, { status: status(), onRefresh: () => {} }),
    );
    assert.match(withRefresh, /aria-label="Refresh payout status"/);
  });
});
