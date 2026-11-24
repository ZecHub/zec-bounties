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

function mount({ login, initialErrorParam = null } = {}) {
  const states = [];
  const refs = [];
  const effects = [];
  let stateCursor = 0;
  let refCursor = 0;
  let effectCursor = 0;
  let errorParam = initialErrorParam;
  const pushed = [];
  let githubLoginCalls = 0;
  const components = new Proxy({}, { get: (_, name) => name });

  const filename = path.resolve(__dirname, "../components/auth/login-form.tsx");
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
      default: {},
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
    "next/navigation": {
      useRouter: () => ({ push: (p) => pushed.push(p) }),
      useSearchParams: () => ({ get: (k) => (k === "error" ? errorParam : null) }),
    },
    "@/lib/bounty-context": {
      useBounty: () => ({ login: login || (async () => ({ success: true, user: { role: "TEAM" } })) }),
    },
    "@/lib/configENV": {
      backendUrl: "https://api.example.com",
    },
    "@/lib/githubLogin": {
      startGithubLogin: () => {
        githubLoginCalls++;
      },
      getGithubOAuthErrorMessage: (code) => (code ? `OAuth error: ${code}` : null),
    },
  };

  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      process: { env: { NODE_ENV: "development" } },
      console: { error() {} },
      require(id) {
        if (Object.hasOwn(dependencies, id)) return dependencies[id];
        if (id.startsWith("@/components/")) return components;
        throw new Error(`Unexpected dependency: ${id}`);
      },
    },
    { filename },
  );

  function render(nextErrorParam) {
    if (nextErrorParam !== undefined) errorParam = nextErrorParam;
    stateCursor = 0;
    refCursor = 0;
    effectCursor = 0;
    return module.exports.LoginForm();
  }

  return { render, pushed, getGithubLoginCalls: () => githubLoginCalls };
}

test("LoginForm routes TEAM to /teams, trims email, prevents double submit, and blocks GitHub link while loading", async () => {
  const calls = [];
  let resolveLogin;
  const harness = mount({
    login: (email, password) => {
      calls.push({ email, password });
      return new Promise((r) => {
        resolveLogin = r;
      });
    },
  });

  let tree = harness.render();
  const emailInput = findAll(tree, (n) => n.type === "Input" && n.props.id === "email")[0];
  emailInput.props.onChange({ target: { value: "  team@example.com  " } });
  tree = harness.render();

  const form = findAll(tree, (n) => n.type === "form")[0];
  const ghLink = findAll(tree, (n) => n.type === "a")[0];

  const p1 = form.props.onSubmit({ preventDefault() {} });
  const p2 = form.props.onSubmit({ preventDefault() {} });
  ghLink.props.onClick({ preventDefault() {} });

  assert.deepEqual(calls, [{ email: "team@example.com", password: "" }]);
  assert.equal(harness.getGithubLoginCalls(), 0);

  resolveLogin({ success: true, user: { role: "TEAM" } });
  await Promise.all([p1, p2]);
  assert.deepEqual(harness.pushed, ["/teams"]);
});

test("LoginForm clears oauthError when error search param is removed and routes CLIENT to /onboarding", async () => {
  const harness = mount({
    initialErrorParam: "access_denied",
    login: async () => ({ success: true, user: { role: "CLIENT" } }),
  });

  let tree = harness.render();
  tree = harness.render();
  assert.equal(textOf(tree).includes("OAuth error: access_denied"), true);

  tree = harness.render(null);
  tree = harness.render(null);
  assert.equal(textOf(tree).includes("OAuth error: access_denied"), false);

  const form = findAll(tree, (n) => n.type === "form")[0];
  await form.props.onSubmit({ preventDefault() {} });
  assert.deepEqual(harness.pushed, ["/onboarding"]);
});
