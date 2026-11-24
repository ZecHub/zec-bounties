const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadTs(relative, requireFixture, globals = {}) {
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
    {
      module,
      exports: module.exports,
      require: requireFixture,
      document: { addEventListener() {}, removeEventListener() {} },
      ...globals,
    },
    { filename },
  );
  return module.exports;
}

function findElement(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findElement(child, predicate);
      if (hit) return hit;
    }
    return null;
  }
  if (predicate(node)) return node;
  if (node.props && node.props.children) {
    return findElement(node.props.children, predicate);
  }
  return null;
}

function mountModal({ verifyZaddress }) {
  const state = [];
  const refs = [];
  let stateCursor = 0;
  let refCursor = 0;
  let timers = [];
  let nextTimerId = 1;

  const setTimeoutMock = (fn) => {
    const id = nextTimerId++;
    timers.push({ id, fn, cleared: false });
    return id;
  };
  const clearTimeoutMock = (id) => {
    const t = timers.find((x) => x.id === id);
    if (t) t.cleared = true;
  };

  const components = new Proxy({}, { get: (_, name) => String(name) });
  const jsx = (type, props) => ({ type, props });
  const addressUtils = loadTs("lib/address-utils.ts", () => {
    throw new Error("Unexpected import in address-utils");
  });

  const { ZAddressCollectionModal } = loadTs(
    "components/address/zaddress-collection-modal.tsx",
    (id) => {
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
          useRef(initial) {
            const idx = refCursor++;
            if (!(idx in refs)) refs[idx] = { current: initial };
            return refs[idx];
          },
          useEffect() {},
        };
      }
      if (id === "react/jsx-runtime") {
        return { jsx, jsxs: jsx, Fragment: "Fragment" };
      }
      if (id === "@/lib/bounty-context") {
        return { useBounty: () => ({ verifyZaddress }) };
      }
      if (id === "@/lib/address-utils") return addressUtils;
      if (id.startsWith("@/components/ui/") || id === "lucide-react") {
        return components;
      }
      throw new Error(`Unexpected import: ${id}`);
    },
    { setTimeout: setTimeoutMock, clearTimeout: clearTimeoutMock },
  );

  function render() {
    stateCursor = 0;
    refCursor = 0;
    return ZAddressCollectionModal({ isOpen: true, onComplete: async () => {} });
  }

  function flushTimers() {
    const pending = timers.filter((t) => !t.cleared);
    timers = [];
    for (const t of pending) t.fn();
  }

  return { render, flushTimers };
}

test("stale verifyZaddress resolution does not mark a cleared or transparent address valid", async () => {
  let resolveVerify;
  const verifyPromise = new Promise((resolve) => {
    resolveVerify = resolve;
  });

  const { render, flushTimers } = mountModal({
    verifyZaddress: () => verifyPromise,
  });

  // 1. User types a valid-looking shielded address and debounce triggers verification.
  let tree = render();
  const input = findElement(tree, (n) => n.type === "Input" && n.props?.id === "zaddress");
  assert.ok(input);
  input.props.onChange({ target: { value: "u1validshieldedaddress1234567890" } });
  flushTimers();

  // 2. While verification is in flight, user replaces it with a transparent address.
  tree = render();
  findElement(tree, (n) => n.type === "Input" && n.props?.id === "zaddress").props.onChange({
    target: { value: "t1transparentaddress1234567890123456" },
  });

  // 3. The earlier shielded verification resolves as true.
  resolveVerify(true);
  await new Promise((r) => setImmediate(r));

  tree = render();
  const submitBtn = findElement(tree, (n) => n.type === "Button" && n.props?.type === "submit");
  assert.equal(submitBtn.props.disabled, true, "Submit must stay disabled for transparent address");
});

test("stale verifyZaddress resolution does not mark a subsequently cleared input valid", async () => {
  let resolveVerify;
  const verifyPromise = new Promise((resolve) => {
    resolveVerify = resolve;
  });

  const { render, flushTimers } = mountModal({
    verifyZaddress: () => verifyPromise,
  });

  let tree = render();
  findElement(tree, (n) => n.type === "Input" && n.props?.id === "zaddress").props.onChange({
    target: { value: "u1validshieldedaddress1234567890" },
  });
  flushTimers();

  // User clears input before verification settles
  tree = render();
  findElement(tree, (n) => n.type === "Input" && n.props?.id === "zaddress").props.onChange({
    target: { value: "" },
  });

  resolveVerify(true);
  await new Promise((r) => setImmediate(r));

  tree = render();
  const submitBtn = findElement(tree, (n) => n.type === "Button" && n.props?.type === "submit");
  assert.equal(submitBtn.props.disabled, true, "Submit must stay disabled after clearing input");
});
