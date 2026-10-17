const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Execute the whole page and its real load/export callbacks. Replace only
// hooks/rendering, the API boundary, and browser download plumbing.
function mount(rows) {
  const state = [];
  let cursor = 0, downloaded, clicked = false;
  const components = new Proxy({}, { get: (_, name) => name });
  const filename = path.resolve(__dirname, "../app/admin/export/page.tsx");
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, []);
  const module = { exports: {} };
  const dependencies = {
    react: {
      useState(initial) {
        const i = cursor++;
        if (!(i in state)) state[i] = initial;
        return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }];
      },
      useEffect() {}, useCallback: fn => fn,
    },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "next/navigation": { useRouter: () => ({}), useSearchParams: () => new URLSearchParams() },
    "@/lib/bounty-context": { useBounty: () => ({ fetchExportPayments: async () => rows }) },
  };
  vm.runInNewContext(result.outputText + "\nmodule.exports.testPanel = BountyDetailPanel;", {
    module, exports: module.exports, Date, console, Blob, URLSearchParams,
    window: { location: { origin: "https://board.example" } },
    document: { createElement(tag) {
      assert.equal(tag, "a");
      return { click() { clicked = true; } };
    } },
    URL: { createObjectURL(blob) { downloaded = blob; return "blob:fixture"; }, revokeObjectURL() {} },
    require(id) {
      if (Object.hasOwn(dependencies, id)) return dependencies[id];
      if (id.startsWith("@/components/") || id === "lucide-react") return components;
      throw new Error(`Unexpected dependency: ${id}`);
    },
  }, { filename });
  function render() { cursor = 0; return module.exports.default(); }
  function find(predicate, node = render()) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.map(child => find(predicate, child)).find(Boolean);
    if (predicate(node)) return node;
    return find(predicate, node.props?.children ?? null);
  }
  return {
    async load() {
      const button = find(node => node.type === "Button" && node.props.onClick?.name === "load");
      assert.ok(button);
      await button.props.onClick();
    },
    async csv() {
      const button = find(node => node.type === "Button" && node.props.onClick?.name === "handleExport");
      assert.ok(button && !button.props.disabled);
      button.props.onClick();
      assert.ok(clicked);
      return downloaded.text();
    },
    panel(bounty) { return module.exports.testPanel({ bounty }); },
    addressCell() {
      const row = find(node => node.type === "TableRow" && node.props.children?.some?.(child => child?.type === "TableCell"));
      assert.ok(row);
      return row.props.children[5].props.children;
    },
  };
}
const recipient = { id: "hunter", name: "Hunter", email: "test@example.com", ofacVerified: true,
  UA_address: "u1mainnet-address-fixture", z_address: "ztestsapling-address-fixture" };
function row(chain, user = recipient, fallback = false) {
  return { id: "fixture", title: "Reward", bountyAmount: 0.1, chain, paidAt: "2026-10-17T12:00:00Z",
    paymentTxId: "tx-fixture", ...(fallback ? { assignees: [{ user }] } : { assigneeUser: user }) };
}

for (const [chain, address] of [["MAIN", recipient.UA_address], ["TEST", recipient.z_address]]) {
  for (const fallback of [false, true]) {
    test(`${chain} ${fallback ? "assignees fallback" : "primary recipient"}: table and CSV use the matching network address`, async () => {
      const page = mount([row(chain, recipient, fallback)]);
      await page.load();
      const csv = await page.csv();
      assert.equal(csv.split("\n")[1].split(",")[7], address);
      assert.equal(page.addressCell(), address.slice(0, 14) + "…");
      assert.ok(csv.includes("tx-fixture"));
    });
  }
}

test("missing mainnet address stays empty instead of substituting a testnet address", async () => {
  const page = mount([row("MAIN", { ...recipient, UA_address: null })]);
  await page.load();
  assert.equal((await page.csv()).split("\n")[1].split(",")[7], "");
  assert.equal(page.addressCell(), "—");
});

test("missing recipient produces an empty address without crashing", async () => {
  const page = mount([row("MAIN", null)]);
  await page.load();
  assert.equal((await page.csv()).split("\n")[1].split(",")[7], "");
  assert.equal(page.addressCell(), "—");
});

for (const [chain, address] of [["MAIN", recipient.UA_address], ["TEST", recipient.z_address]]) {
  test(`${chain}: payment details show the same network address as the report`, () => {
    const page = mount([]);
    const tree = page.panel({ ...row(chain), isPaid: true, status: "DONE", description: "Fixture" });
    function text(node) {
      if (Array.isArray(node)) return node.map(text).join(" ");
      if (!node || typeof node === "boolean") return "";
      if (typeof node === "object") return text(node.props?.children);
      return String(node);
    }
    const rendered = text(tree);
    assert.ok(rendered.includes(address), rendered);
    assert.ok(!rendered.includes(chain === "MAIN" ? recipient.z_address : recipient.UA_address));
  });
}
