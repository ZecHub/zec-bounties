const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Render the admin payment panel with its real filtering. Only hooks,
// rendering and the bounty context are replaced. Mirrors the harness in
// payout-panels-exported.test.cjs, with useEffect stubbed for the panel's
// payout-round fetch effect.
function render(file, exportName, context, props = {}) {
  const components = new Proxy({}, { get: (_, name) => name });
  const filename = path.resolve(__dirname, "..", file);
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, []);
  const module = { exports: {} };
  const dependencies = {
    react: {
      useState: (initial) => [initial, () => {}],
      useRef: (initial) => ({ current: initial }),
      useEffect: () => {},
    },
    "react/jsx-runtime": {
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
    },
    "@/lib/bounty-context": { useBounty: () => context },
    sonner: { toast: {} },
    "@/components/nym-sending-indicator": { setNymSending() {} },
  };
  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      console,
      require(id) {
        if (Object.hasOwn(dependencies, id)) return dependencies[id];
        if (id.startsWith("@/components/") || id === "lucide-react")
          return components;
        throw new Error(`Unexpected dependency: ${id}`);
      },
    },
    { filename },
  );
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
    id,
    title: `Bounty ${id}`,
    teamId: null,
    chain: "MAIN",
    bountyAmount: 0.5,
    status: "DONE",
    isApproved: true,
    isPaid: false,
    paymentInFlight: false,
    exportedAt: null,
    assigneeUser: { id: "hunter", name: "Hunter", UA_address: "u1hunter" },
    ...fields,
  };
}

function adminPanel(bounties, chain = "mainnet") {
  const unpaidDoneCount = bounties.filter(
    (b) => !b.isPaid && !b.exportedAt,
  ).length;
  return render(
    "components/payments/authorize-payment-panel.tsx",
    "AuthorizePaymentPanel",
    {
      bounties,
      unpaidDoneCount,
      hasMoreBounties: false,
      bountiesLoading: false,
      zcashParams: [{ accountName: "Main", chain, isDefault: true }],
    },
  );
}

// The admin panel pays platform bounties only (teamId: null), matching the
// backend's GET/POST payment routes. Its warning banners must share that scope.

test("the off-chain warning ignores team bounties", () => {
  const rendered = adminPanel([
    bounty("platform-due"),
    bounty("team-off-chain", { teamId: "team-1", chain: "TEST" }),
  ]);
  assert.ok(!rendered.includes("hidden"), rendered);
});

test("a platform bounty on the opposite chain still triggers the off-chain warning", () => {
  const rendered = adminPanel([
    bounty("platform-due"),
    bounty("platform-off-chain", { chain: "TEST" }),
  ]);
  assert.ok(rendered.includes("hidden"), rendered);
});

test("the awaiting-settlement warning ignores team bounties", () => {
  const rendered = adminPanel([
    bounty("platform-due"),
    bounty("team-in-flight", { teamId: "team-1", paymentInFlight: true }),
  ]);
  assert.ok(!rendered.includes("awaiting settlement"), rendered);
});

test("an in-flight platform payment still triggers the awaiting-settlement warning", () => {
  const rendered = adminPanel([
    bounty("platform-due"),
    bounty("platform-in-flight", { paymentInFlight: true }),
  ]);
  assert.ok(rendered.includes("awaiting settlement"), rendered);
});
