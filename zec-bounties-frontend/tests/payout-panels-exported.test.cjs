const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Render a payment panel with its real filtering. Replace only hooks,
// rendering and the bounty context.
function render(file, exportName, context, props = {}) {
  const components = new Proxy({}, { get: (_, name) => name });
  const filename = path.resolve(__dirname, "..", file);
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, []);
  const module = { exports: {} };
  const dependencies = {
    react: { useState: (initial) => [initial, () => {}], useRef: (initial) => ({ current: initial }) },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "@/lib/bounty-context": { useBounty: () => context },
    sonner: { toast: {} },
    "@/components/nym-sending-indicator": { setNymSending() {} },
  };
  vm.runInNewContext(result.outputText, {
    module, exports: module.exports, console,
    require(id) {
      if (Object.hasOwn(dependencies, id)) return dependencies[id];
      if (id.startsWith("@/components/") || id === "lucide-react") return components;
      throw new Error(`Unexpected dependency: ${id}`);
    },
  }, { filename });
  return text(module.exports[exportName](props));
}

function text(node) {
  if (Array.isArray(node)) return node.map(text).join("");
  if (!node || typeof node === "boolean") return "";
  if (typeof node === "object") return text(node.props?.children);
  return String(node);
}

function bounty(id, fields = {}) {
  return {
    id, title: `Bounty ${id}`, teamId: null, chain: "MAIN", bountyAmount: 0.5,
    status: "DONE", isApproved: true, isPaid: false, paymentInFlight: false, exportedAt: null,
    assigneeUser: { id: "hunter", name: "Hunter", UA_address: "u1hunter" },
    ...fields,
  };
}

const EXPORTED = "2026-10-04T22:27:11.481Z";

function adminPanel(bounties, chain = "mainnet") {
  // unpaidDoneCount is the server's count behind the "Payments Due" header:
  // DONE, unpaid and not exported.
  const unpaidDoneCount = bounties.filter((b) => !b.isPaid && !b.exportedAt).length;
  return render("components/payments/authorize-payment-panel.tsx", "AuthorizePaymentPanel", {
    bounties, unpaidDoneCount, hasMoreBounties: false, bountiesLoading: false,
    zcashParams: [{ accountName: "Main", chain, isDefault: true }],
  });
}

function teamPanel(teamBounties, chain = "mainnet") {
  const team = { id: "team-1", name: "Team", wallet: { accountName: "Team", chain } };
  return render("components/payments/teams/authorize-payment-panel.tsx", "TeamAuthorizePaymentPanel", {}, { team, teamBounties });
}

test("Payments Due lists only the bounties its header counts as due", () => {
  const rendered = adminPanel([bounty("due"), bounty("exported", { exportedAt: EXPORTED })]);
  assert.match(rendered, /Select all \(1\)/);
  assert.ok(rendered.includes("Bounty due"));
  assert.ok(!rendered.includes("Bounty exported"), rendered);
});

test("Payments Due shows nothing to pay when every completed bounty was exported", () => {
  const rendered = adminPanel([bounty("exported", { exportedAt: EXPORTED })]);
  assert.match(rendered, /No bounties ready for payment/);
});

test("Payments Due does not offer to switch wallets to pay an exported bounty", () => {
  const rendered = adminPanel([
    bounty("due", { chain: "TEST" }),
    bounty("exported", { exportedAt: EXPORTED }),
  ], "testnet");
  assert.match(rendered, /Select all \(1\)/);
  assert.ok(!rendered.includes("hidden"), rendered);
});

test("the team panel does not list a bounty exported for an off-platform payout", () => {
  const rendered = teamPanel([
    bounty("due", { teamId: "team-1" }),
    bounty("exported", { teamId: "team-1", exportedAt: EXPORTED }),
  ]);
  assert.match(rendered, /1 completed bounty awaiting payout/);
  assert.match(rendered, /Select all \(1\)/);
  assert.ok(!rendered.includes("Bounty exported"), rendered);
});

test("the team panel does not offer to switch wallets to pay an exported bounty", () => {
  const rendered = teamPanel([
    bounty("due", { teamId: "team-1", chain: "TEST" }),
    bounty("exported", { teamId: "team-1", exportedAt: EXPORTED }),
  ], "testnet");
  assert.ok(!rendered.includes("hidden"), rendered);
});
