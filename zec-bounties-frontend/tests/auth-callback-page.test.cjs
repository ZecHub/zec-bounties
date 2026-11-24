const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function mountCallback(opts = {}) {
  const refs = [];
  let refCursor = 0;
  const replaced = [];
  const pushed = [];
  const cleared = [];
  const toastErrors = [];
  const storage = new Map();
  const historyCalls = [];
  let setUserArg = null;
  let effectCleanup = null;

  const filename = path.resolve(__dirname, "../app/auth/callback/page.tsx");
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, []);

  const searchMap = new URLSearchParams(opts.search || "");
  const module = { exports: {} };
  const dependencies = {
    react: {
      useRef(initial) {
        const i = refCursor++;
        if (!(i in refs)) refs[i] = { current: initial };
        return refs[i];
      },
      useEffect(fn) {
        effectCleanup = fn() || null;
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
      useSearchParams: () => ({
        get: (k) => searchMap.get(k),
      }),
    },
    "lucide-react": new Proxy({}, { get: (_, name) => name }),
    sonner: {
      toast: { error: (title, meta) => toastErrors.push({ title, meta }) },
    },
    "@/lib/bounty-context": {
      useBounty: () => ({ setCurrentUser: (u) => { setUserArg = u; } }),
    },
    "@/lib/configENV": { backendUrl: "https://api.example.test" },
    "@/lib/githubLogin": {
      readGithubLoginState: () => opts.expectedState ?? "state-123",
      clearGithubLoginState: () => cleared.push(true),
    },
  };

  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      URLSearchParams,
      AbortController,
      window: {
        location: {
          pathname: "/auth/callback",
          search: opts.search ? `?${opts.search}` : "",
          hash: opts.hash || "",
        },
        history: {
          replaceState: (_s, _t, url) => historyCalls.push(url),
        },
      },
      localStorage: {
        setItem: (k, v) => storage.set(k, v),
        removeItem: (k) => storage.delete(k),
        getItem: (k) => storage.get(k) ?? null,
      },
      fetch: opts.fetchImpl || (async () => ({
        ok: true,
        json: async () => ({ user: opts.user || { id: "u1", role: "TEAM" } }),
      })),
      require(id) {
        if (Object.hasOwn(dependencies, id)) return dependencies[id];
        throw new Error(`Unexpected dependency: ${id}`);
      },
    },
    { filename },
  );

  module.exports.default();
  return {
    exports: module.exports,
    replaced,
    pushed,
    cleared,
    toastErrors,
    storage,
    historyCalls,
    getUser: () => setUserArg,
    unmount: () => { if (effectCleanup) effectCleanup(); },
  };
}

test("GithubCallback scrubs ?token from query string and routes TEAM/CLIENT/ADMIN via router.replace", async () => {
  const h = mountCallback({
    search: "state=state-123&token=secret-jwt&next=ok",
    user: { id: "u1", role: "TEAM" },
  });

  await new Promise((r) => setTimeout(r, 10));

  assert.deepEqual(h.historyCalls, ["/auth/callback?state=state-123&next=ok"]);
  assert.equal(h.storage.get("authToken"), "secret-jwt");
  assert.deepEqual(h.getUser(), { id: "u1", role: "TEAM" });
  assert.deepEqual(h.replaced, ["/teams"]);
  assert.deepEqual(h.pushed, []);
  assert.equal(h.exports.getPostAuthPath("CLIENT"), "/onboarding");
  assert.equal(h.exports.getPostAuthPath("ADMIN"), "/admin");
  assert.equal(h.exports.getPostAuthPath("HUNTER"), "/home");
});

test("GithubCallback aborts in-flight verify on unmount without updating user or navigating", async () => {
  let aborted = false;
  let resolveFetch;
  const h = mountCallback({
    search: "state=state-123",
    hash: "#token=hash-jwt",
    fetchImpl: (_url, init) =>
      new Promise((resolve) => {
        init.signal.addEventListener("abort", () => {
          aborted = true;
        });
        resolveFetch = resolve;
      }),
  });

  h.unmount();
  assert.equal(aborted, true);
  resolveFetch({ ok: true, json: async () => ({ user: { id: "u2", role: "ADMIN" } }) });
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(h.getUser(), null);
  assert.deepEqual(h.replaced, []);
  assert.deepEqual(h.toastErrors, []);
});
