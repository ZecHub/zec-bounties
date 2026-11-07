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

const EXPORTED = "2026-01-15T12:00:00.000Z";

function adminPanel(bounties, chain = "mainnet", extraContext = {}) {
  // unpaidDoneCount is the server's count behind the "Payments Due" header:
  // DONE, unpaid and not exported.
  const unpaidDoneCount = bounties.filter((b) => !b.isPaid && !b.exportedAt).length;
  return render("components/payments/authorize-payment-panel.tsx", "AuthorizePaymentPanel", {
    bounties, unpaidDoneCount, hasMoreBounties: false, bountiesLoading: false,
    zcashParams: [{ accountName: "Main", chain, isDefault: true }],
    ...extraContext,
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

test("Payments Due does not warn about chain mismatch or in-flight status for team bounties", () => {
  const rendered = adminPanel([
    bounty("platform-due"),
    bounty("team-testnet", { teamId: "team-1", chain: "TEST" }),
    bounty("team-inflight", { teamId: "team-1", paymentInFlight: true }),
  ]);
  assert.match(rendered, /Select all \(1\)/);
  assert.ok(!rendered.includes("hidden"), rendered);
  assert.ok(!rendered.includes("awaiting settlement"), rendered);
});

test("Payments Due still renders in-flight and chain-mismatch warnings when no bounties are currently eligible", () => {
  const inFlightOnly = adminPanel([
    bounty("stuck", { paymentInFlight: true }),
  ]);
  assert.match(inFlightOnly, /1 payment awaiting settlement/);
  assert.ok(!inFlightOnly.includes("No bounties ready for payment"), inFlightOnly);

  const blockedOnly = adminPanel([
    bounty("testnet-due", { chain: "TEST" }),
  ], "mainnet");
  assert.match(blockedOnly, /1 bounty hidden/);
  assert.ok(!blockedOnly.includes("No bounties ready for payment"), blockedOnly);
});

test("Payments Due does not claim loaded team bounties are unloaded eligible payouts", () => {
  const rendered = adminPanel(
    [bounty("team-due", { teamId: "team-1" })],
    "mainnet",
    { unpaidDoneCount: 1, hasMoreBounties: true },
  );
  assert.match(rendered, /No bounties ready for payment/);
  assert.ok(!rendered.includes("not loaded into this view yet"), rendered);
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

test("the team panel matches skipped bounties by ID so a paid bounty with the same title is still reported to onPaid", async () => {
  const filename = path.resolve(__dirname, "..", "components/payments/teams/authorize-payment-panel.tsx");
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const module = { exports: {} };
  let stateIdx = 0;
  const states = [new Set(["b1", "b2"]), false, false];
  const findAction = (node) => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = findAction(child);
        if (found) return found;
      }
      return null;
    }
    if (node.type === "AlertDialogAction" && typeof node.props?.onClick === "function") {
      return node.props.onClick;
    }
    return findAction(node.props?.children);
  };
  const components = new Proxy({}, { get: (_, name) => name });
  const dependencies = {
    react: {
      useState: (initial) => {
        const val = stateIdx < states.length ? states[stateIdx++] : initial;
        return [val, () => {}];
      },
      useRef: (initial) => ({ current: initial }),
    },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "@/lib/bounty-context": {
      useBounty: () => ({
        authorizeTeamDuePayment: async () => ({
          success: true,
          paidCount: 1,
          txids: ["a".repeat(64)],
          skipped: [{ id: "b1", title: "Weekly Digest", reason: "Assignee has no UA address" }],
        }),
      }),
    },
    sonner: { toast: { success() {}, error() {} } },
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

  const paid = [];
  const tree = module.exports.TeamAuthorizePaymentPanel({
    team: { id: "team-1", name: "Team", wallet: { accountName: "Team", chain: "mainnet" } },
    teamBounties: [
      bounty("b1", { teamId: "team-1", title: "Weekly Digest", assigneeUser: { id: "u1", name: "NoAddr", UA_address: null } }),
      bounty("b2", { teamId: "team-1", title: "Weekly Digest", assigneeUser: { id: "u2", name: "HasAddr", UA_address: "u1valid" } }),
    ],
    onPaid: (ids) => paid.push(...ids),
  });
  const confirmClick = findAction(tree);
  assert.equal(typeof confirmClick, "function");
  await confirmClick();
  assert.deepEqual(paid, ["b2"]);
});

test("authorizeTeamDuePayment refreshes team bounties even when the send outcome is unknown (502)", async () => {
  const filename = path.resolve(__dirname, "..", "lib/bounty-context.tsx");
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  let capturedValue = null;
  let stateIdx = 0;
  const fetchedUrls = [];
  const moduleObj = { exports: {} };
  vm.runInNewContext(
    result.outputText,
    {
      module: moduleObj,
      exports: moduleObj.exports,
      console: { log() {}, error() {}, warn() {} },
      URLSearchParams,
      crypto: require("node:crypto"),
      localStorage: { getItem: () => "tok", setItem() {}, removeItem() {} },
      window: { location: { reload() {} }, addEventListener() {}, removeEventListener() {} },
      fetch: async (url) => {
        fetchedUrls.push(String(url));
        if (String(url).includes("/wallet/authorize-payment")) {
          return {
            ok: false,
            status: 502,
            json: async () => ({ error: "Payment outcome unknown", details: "Timed out" }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [], records: [], total: 0 }),
        };
      },
      require(id) {
        if (id === "react") {
          return {
            createContext: () => ({ Provider: "Provider" }),
            useContext: () => ({}),
            useState: (init) => {
              const idx = stateIdx++;
              if (idx === 1) return [{ id: "u1", role: "TEAM" }, () => {}];
              return [typeof init === "function" ? init() : init, () => {}];
            },
            useEffect: () => {},
            useMemo: (fn) => fn(),
            useRef: (init) => ({ current: init }),
          };
        }
        if (id === "react/jsx-runtime") {
          return {
            jsx: (type, props) => {
              if (type === "Provider") capturedValue = props.value;
              return { type, props };
            },
            jsxs: (type, props) => ({ type, props }),
          };
        }
        if (id === "./configENV") return { backendUrl: "http://api.test", backendWebSpocketUrl: "ws://api.test" };
        if (id === "./displayName") return { displayName: (u) => u?.name || "" };
        if (id === "./bounty-merge") return { bountyUpdatedAt: () => 0, mergeBounty: (_, b) => b };
        return {};
      },
    },
    { filename },
  );

  moduleObj.exports.BountyProvider({ children: null });
  await assert.rejects(
    () => capturedValue.authorizeTeamDuePayment("team-1", ["b1"], "key-1"),
    /Payment outcome unknown: Timed out/,
  );
  assert.ok(
    fetchedUrls.some((u) => u.includes("/api/teams/team-1/bounties")),
    `Expected /api/teams/team-1/bounties to be refetched, got: ${fetchedUrls.join(", ")}`,
  );
  assert.ok(
    fetchedUrls.some((u) => u.includes("/api/teams/team-1/wallet/payment-records")),
  );
});
