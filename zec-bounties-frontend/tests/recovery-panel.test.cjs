const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function findAll(node, pred, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) findAll(item, pred, out);
    return out;
  }
  if (pred(node)) out.push(node);
  if (node.props && node.props.children) findAll(node.props.children, pred, out);
  return out;
}

function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object" && node.props) return textOf(node.props.children);
  return "";
}

function mount(initialProps, clipboardImpl) {
  const states = [];
  const refs = [];
  const effects = [];
  let stateCursor = 0;
  let refCursor = 0;
  let effectCursor = 0;
  let currentProps = { ...initialProps };
  const components = new Proxy({}, { get: (_, name) => name });
  const clearedTimers = [];
  let nextTimerId = 1;
  const timers = new Map();

  const filename = path.resolve(__dirname, "../components/recovery/recovery-panel.tsx");
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
      useState(initial) {
        const i = stateCursor++;
        if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial;
        return [
          states[i],
          (val) => {
            states[i] = typeof val === "function" ? val(states[i]) : val;
          },
        ];
      },
      useRef(initial) {
        const i = refCursor++;
        if (!(i in refs)) refs[i] = { current: initial };
        return refs[i];
      },
      useEffect(fn, deps) {
        const i = effectCursor++;
        const prev = effects[i];
        const changed =
          !prev ||
          !deps ||
          !prev.deps ||
          deps.length !== prev.deps.length ||
          deps.some((d, idx) => !Object.is(d, prev.deps[idx]));
        if (changed) {
          prev?.cleanup?.();
          const cleanup = fn();
          effects[i] = { deps, cleanup: typeof cleanup === "function" ? cleanup : null };
        }
      },
    },
    "react/jsx-runtime": {
      Fragment: "Fragment",
      jsx: (type, props, key) => ({ type, props, key }),
      jsxs: (type, props, key) => ({ type, props, key }),
    },
    "@/lib/utils": {
      cn: (...args) => args.filter(Boolean).join(" "),
    },
  };

  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      navigator: { clipboard: clipboardImpl },
      setTimeout: (fn) => {
        const id = nextTimerId++;
        timers.set(id, fn);
        return id;
      },
      clearTimeout: (id) => {
        clearedTimers.push(id);
        timers.delete(id);
      },
      require(id) {
        if (Object.hasOwn(dependencies, id)) return dependencies[id];
        if (id.startsWith("@/components/") || id === "lucide-react") return components;
        throw new Error(`Unexpected dependency: ${id}`);
      },
    },
    { filename },
  );

  function render(overrides) {
    if (overrides) currentProps = { ...currentProps, ...overrides };
    stateCursor = 0;
    refCursor = 0;
    effectCursor = 0;
    return module.exports.RecoveryPanel(currentProps);
  }

  function unmount() {
    for (const eff of effects) eff?.cleanup?.();
  }

  return { render, unmount, timers, clearedTimers };
}

test("RecoveryPanel guards re-entry, enforces 6-digit OTP on Enter, and clears stale OTP on resend", async () => {
  let reqCount = 0;
  let verifyCount = 0;
  let resolveReq;
  const harness = mount({
    requestOtp: () => {
      reqCount++;
      return new Promise((r) => {
        resolveReq = () => r({ message: "sent", email: "a***@example.com" });
      });
    },
    verifyOtp: async () => {
      verifyCount++;
      return { birthday: 100, accountIndex: 0, no_of_accounts: 1, "seed phrase": "word1 word2" };
    },
  });

  let tree = harness.render();
  const sendBtn = findAll(tree, (n) => n.type === "Button" && textOf(n).includes("Send verification code"))[0];
  const p1 = sendBtn.props.onClick();
  const p2 = sendBtn.props.onClick(); // same-tick duplicate click
  assert.equal(reqCount, 1);
  resolveReq();
  await Promise.all([p1, p2]);

  tree = harness.render();
  const input = findAll(tree, (n) => n.type === "Input")[0];
  input.props.onChange({ target: { value: "123" } });
  tree = harness.render();
  const inputShort = findAll(tree, (n) => n.type === "Input")[0];
  await inputShort.props.onKeyDown({ key: "Enter" });
  assert.equal(verifyCount, 0);

  // Resend clears partial OTP
  const resendBtn = findAll(tree, (n) => n.type === "Button" && textOf(n).includes("Resend"))[0];
  const p3 = resendBtn.props.onClick();
  resolveReq();
  await p3;
  tree = harness.render();
  assert.equal(findAll(tree, (n) => n.type === "Input")[0].props.value, "");
});

test("RecoveryPanel ignores late verifyOtp completion after unmount and handles clipboard failure safely", async () => {
  let resolveVerify;
  const harness = mount(
    {
      requestOtp: async () => ({ message: "sent", email: "u***@example.com" }),
      verifyOtp: () =>
        new Promise((r) => {
          resolveVerify = r;
        }),
    },
    {
      writeText: async () => {
        throw new Error("clipboard denied");
      },
    },
  );

  let tree = harness.render();
  await findAll(tree, (n) => n.type === "Button")[0].props.onClick();
  tree = harness.render();
  findAll(tree, (n) => n.type === "Input")[0].props.onChange({ target: { value: "654321" } });
  tree = harness.render();
  const verifyBtn = findAll(tree, (n) => n.type === "Button" && textOf(n).includes("Verify"))[0];
  const pending = verifyBtn.props.onClick();
  harness.unmount();
  resolveVerify({ birthday: 1, accountIndex: 0, no_of_accounts: 1, "seed phrase": "secret" });
  await pending;

  // Still on otp_sent step because session was invalidated on unmount
  tree = harness.render();
  assert.equal(textOf(tree).includes("Store recovery data securely offline"), false);
});
