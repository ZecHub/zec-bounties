const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadTs(relative, requireFixture) {
  const filename = path.resolve(__dirname, "..", relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  assert.deepEqual(compiled.diagnostics, []);
  const module = { exports: {} };
  vm.runInNewContext(
    compiled.outputText,
    { module, exports: module.exports, require: requireFixture },
    { filename },
  );
  return module.exports;
}

function collectText(node, out = []) {
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return out;
  }
  if (node.props && node.props.children !== undefined) {
    collectText(node.props.children, out);
  }
  return out;
}

function mountBountyDetailPage(fetchBountyById) {
  const state = [];
  let stateCursor = 0;
  let currentId = "";
  let prevDeps = null;
  let cleanup = null;

  const components = new Proxy({}, { get: (_, name) => String(name) });
  const jsx = (type, props) => ({ type, props });

  const { default: BountyDetailPage } = loadTs("app/bounties/[id]/page.tsx", (id) => {
    if (id === "react") {
      return {
        useState(initial) {
          const idx = stateCursor++;
          if (!(idx in state)) state[idx] = initial;
          return [
            state[idx],
            (val) => {
              state[idx] = typeof val === "function" ? val(state[idx]) : val;
            },
          ];
        },
        useEffect(fn, deps) {
          const changed =
            !prevDeps ||
            deps.length !== prevDeps.length ||
            deps.some((d, i) => !Object.is(d, prevDeps[i]));
          if (changed) {
            if (typeof cleanup === "function") cleanup();
            prevDeps = deps;
            cleanup = fn();
          }
        },
      };
    }
    if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
    if (id === "next/navigation") {
      return {
        useParams: () => ({ id: currentId }),
        useRouter: () => ({ back() {} }),
      };
    }
    if (id === "@/lib/bounty-context") {
      return { useBounty: () => ({ fetchBountyById }) };
    }
    if (id === "@/lib/explorer") return { getExplorerUrl: (tx) => `https://explorer/${tx}` };
    if (id.startsWith("@/components/ui/") || id === "lucide-react") return components;
    throw new Error(`Unexpected import: ${id}`);
  });

  return {
    render(id) {
      currentId = id;
      stateCursor = 0;
      return BountyDetailPage();
    },
  };
}

test("navigating from a missing bounty id to a valid bounty id clears notFound", async () => {
  const page = mountBountyDetailPage(async (id) => {
    if (id === "missing") return null;
    return {
      id,
      title: "Fix Shielded Fee Estimator",
      status: "TO_DO",
      bountyAmount: 2.5,
      assignees: [],
    };
  });

  // Load missing bounty -> notFound becomes true
  page.render("missing");
  await new Promise((r) => setImmediate(r));
  let text = collectText(page.render("missing")).join(" ");
  assert.match(text, /Bounty not found/);

  // Navigate to valid bounty -> must clear notFound and render the bounty
  page.render("valid-123");
  await new Promise((r) => setImmediate(r));
  text = collectText(page.render("valid-123")).join(" ");
  assert.match(text, /Fix Shielded Fee Estimator/);
  assert.doesNotMatch(text, /Bounty not found/);
});

test("stale fetchBountyById response from previous id is ignored after navigation", async () => {
  const resolvers = {};
  const page = mountBountyDetailPage(
    (id) =>
      new Promise((resolve) => {
        resolvers[id] = resolve;
      }),
  );

  page.render("old-id");
  page.render("new-id");

  // Newer request resolves first
  resolvers["new-id"]({
    id: "new-id",
    title: "Current Bounty",
    status: "IN_PROGRESS",
    bountyAmount: 1,
    assignees: [],
  });
  await new Promise((r) => setImmediate(r));

  // Stale request resolves later with null
  resolvers["old-id"](null);
  await new Promise((r) => setImmediate(r));

  const text = collectText(page.render("new-id")).join(" ");
  assert.match(text, /Current Bounty/);
  assert.doesNotMatch(text, /Bounty not found/);
});
