const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function mountProtected(opts = {}) {
  const replaced = [];
  const pushed = [];
  const filename = path.resolve(__dirname, "../components/auth/protected-route.tsx");
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
      useEffect(fn) {
        fn();
      },
    },
    "react/jsx-runtime": {
      Fragment: "Fragment",
      jsx: (type, props, key) => ({ type, props, key }),
      jsxs: (type, props, key) => ({ type, props, key }),
    },
    "next/navigation": {
      useRouter: () => ({
        replace: (p) => replaced.push(p),
        push: (p) => pushed.push(p),
      }),
      usePathname: () => opts.pathname ?? "/admin",
    },
    "@/lib/bounty-context": {
      useBounty: () => ({
        currentUser: opts.currentUser ?? null,
        isLoading: opts.isLoading ?? false,
      }),
    },
  };

  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      require(id) {
        if (Object.hasOwn(dependencies, id)) return dependencies[id];
        throw new Error(`Unexpected dependency: ${id}`);
      },
    },
    { filename },
  );

  return {
    exports: module.exports,
    replaced,
    pushed,
    render: (props = {}) => module.exports.ProtectedRoute({ children: "OK", ...props }),
  };
}

test("ProtectedRoute uses router.replace and routes TEAM users hitting requireAdmin straight to /teams", () => {
  const h = mountProtected({
    currentUser: { id: "t1", role: "TEAM" },
    pathname: "/admin/dashboard",
  });
  h.render({ requireAdmin: true });

  assert.deepEqual(h.replaced, ["/teams"]);
  assert.deepEqual(h.pushed, []);
});

test("ProtectedRoute handles CLIENT onboarding with trailing slash and unauthenticated login redirect via replace", () => {
  const hClientOnOnboarding = mountProtected({
    currentUser: { id: "c1", role: "CLIENT" },
    pathname: "/onboarding/",
  });
  const tree = hClientOnOnboarding.render();
  assert.deepEqual(hClientOnOnboarding.replaced, []);
  assert.equal(tree.props.children, "OK");

  const hAnon = mountProtected({ currentUser: null, pathname: "/home" });
  hAnon.render();
  assert.deepEqual(hAnon.replaced, ["/login"]);
  assert.deepEqual(hAnon.pushed, []);
});
