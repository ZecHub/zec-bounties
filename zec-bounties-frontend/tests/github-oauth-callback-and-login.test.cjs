const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function transpile(relativePath) {
  const filename = path.resolve(__dirname, "..", relativePath);
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, []);
  return { filename, outputText: result.outputText };
}

function loadGithubLogin(env = {}) {
  const { filename, outputText } = transpile("lib/githubLogin.ts");
  const storage = new Map(Object.entries(env.initialSessionStorage || {}));
  let assignedUrl = null;
  const module = { exports: {} };
  vm.runInNewContext(
    outputText,
    {
      module,
      exports: module.exports,
      URLSearchParams,
      Uint8Array,
      crypto: {
        getRandomValues(arr) {
          for (let i = 0; i < arr.length; i++) arr[i] = (i + 1) & 0xff;
          return arr;
        },
      },
      sessionStorage: {
        getItem: (k) => (storage.has(k) ? storage.get(k) : null),
        setItem: (k, v) => storage.set(k, String(v)),
        removeItem: (k) => storage.delete(k),
      },
      window: {
        location: {
          assign(url) {
            assignedUrl = url;
          },
        },
      },
      require(id) {
        if (id === "@/lib/configENV") {
          return { backendUrl: "https://backend.example" };
        }
        throw new Error(`Unexpected dependency in githubLogin.ts: ${id}`);
      },
    },
    { filename },
  );
  return {
    exports: module.exports,
    storage,
    getAssignedUrl: () => assignedUrl,
  };
}

function text(node) {
  if (Array.isArray(node)) return node.map(text).join("");
  if (!node || typeof node === "boolean") return "";
  if (typeof node === "object") return text(node.props?.children);
  return String(node);
}

test("extractGithubCallbackParams reads fragment #token first and scrubs fragment", () => {
  const { exports: gh } = loadGithubLogin();
  const parsed = gh.extractGithubCallbackParams({
    pathname: "/auth/callback",
    search: "?state=state-123",
    hash: "#token=jwt-fragment-token",
  });
  assert.equal(parsed.token, "jwt-fragment-token");
  assert.equal(parsed.state, "state-123");
  assert.equal(parsed.scrubbedUrl, "/auth/callback?state=state-123");
});

test("extractGithubCallbackParams falls back to query ?token= and scrubs token from query string", () => {
  const { exports: gh } = loadGithubLogin();
  const parsed = gh.extractGithubCallbackParams({
    pathname: "/auth/callback",
    search: "?token=jwt-query-token&state=state-456",
    hash: "",
  });
  assert.equal(parsed.token, "jwt-query-token");
  assert.equal(parsed.state, "state-456");
  assert.equal(parsed.scrubbedUrl, "/auth/callback?state=state-456");
  assert.ok(!parsed.scrubbedUrl.includes("jwt-query-token"));
});

test("getGithubOAuthErrorMessage maps all backend and callback OAuth error codes", () => {
  const { exports: gh } = loadGithubLogin();
  assert.equal(gh.getGithubOAuthErrorMessage(null), null);
  assert.equal(gh.getGithubOAuthErrorMessage(""), null);
  assert.match(
    gh.getGithubOAuthErrorMessage("no_email"),
    /verified primary email address/i,
  );
  assert.match(
    gh.getGithubOAuthErrorMessage("account_mismatch"),
    /different GitHub user/i,
  );
  assert.match(
    gh.getGithubOAuthErrorMessage("account_exists"),
    /already exists/i,
  );
  assert.match(
    gh.getGithubOAuthErrorMessage("oauth_cancelled"),
    /cancelled/i,
  );
  assert.match(gh.getGithubOAuthErrorMessage("oauth_failed"), /failed/i);
  assert.match(
    gh.getGithubOAuthErrorMessage("missing_token"),
    /session token was missing/i,
  );
  assert.match(
    gh.getGithubOAuthErrorMessage("invalid_state"),
    /state verification failed/i,
  );
  assert.match(
    gh.getGithubOAuthErrorMessage("invalid_token"),
    /verify your session/i,
  );
  assert.match(
    gh.getGithubOAuthErrorMessage("unexpected_future_code"),
    /Sign-in failed/i,
  );
});

function mountCallbackPage({
  search = "?state=valid-state",
  hash = "#token=jwt-token-1",
  expectedState = "valid-state",
  verifyResponse = { user: { id: "u1", role: "CLIENT" } },
}) {
  const { filename, outputText } = transpile("app/auth/callback/page.tsx");
  const gh = loadGithubLogin({
    initialSessionStorage: expectedState
      ? { githubLoginState: expectedState }
      : {},
  });

  const refs = [];
  const effects = [];
  let refCursor = 0;
  let effectCursor = 0;
  const pushedRoutes = [];
  const replacedUrls = [];
  const localStore = new Map();
  let currentUser = null;
  let resolveVerify = null;

  const windowObj = {
    location: {
      pathname: "/auth/callback",
      search,
      hash,
    },
    history: {
      replaceState(_data, _unused, url) {
        replacedUrls.push(url);
        const u = new URL(url, "https://bounties.zechub.wiki");
        windowObj.location.pathname = u.pathname;
        windowObj.location.search = u.search;
        windowObj.location.hash = u.hash;
      },
    },
  };

  const module = { exports: {} };
  const components = new Proxy({}, { get: (_, name) => name });
  vm.runInNewContext(
    outputText,
    {
      module,
      exports: module.exports,
      window: windowObj,
      localStorage: {
        setItem: (k, v) => localStore.set(k, String(v)),
        removeItem: (k) => localStore.delete(k),
        getItem: (k) => localStore.get(k) ?? null,
      },
      fetch() {
        return new Promise((resolve) => {
          resolveVerify = () =>
            resolve({
              ok: Boolean(verifyResponse),
              async json() {
                return verifyResponse;
              },
            });
        });
      },
      URLSearchParams,
      require(id) {
        if (id === "react") {
          return {
            useRef(initial) {
              const i = refCursor++;
              if (!(i in refs)) refs[i] = { current: initial };
              return refs[i];
            },
            useEffect(fn, deps) {
              const i = effectCursor++;
              effects[i] = { fn, deps };
            },
          };
        }
        if (id === "react/jsx-runtime") {
          const jsx = (type, props) => ({ type, props });
          return { jsx, jsxs: jsx, Fragment: "Fragment" };
        }
        if (id === "next/navigation") {
          return {
            useRouter: () => ({
              push(url) {
                pushedRoutes.push(url);
              },
            }),
            useSearchParams: () =>
              new URLSearchParams(windowObj.location.search.replace(/^\?/, "")),
          };
        }
        if (id === "lucide-react") return components;
        if (id === "sonner") return { toast: { error() {} } };
        if (id === "@/lib/bounty-context") {
          return {
            useBounty: () => ({
              setCurrentUser(u) {
                currentUser = u;
              },
            }),
          };
        }
        if (id === "@/lib/configENV") {
          return { backendUrl: "https://backend.example" };
        }
        if (id === "@/lib/githubLogin") return gh.exports;
        throw new Error(`Unexpected callback dependency: ${id}`);
      },
    },
    { filename },
  );

  function renderAndRunEffects() {
    refCursor = 0;
    effectCursor = 0;
    module.exports.default();
    for (const eff of effects) {
      eff.fn();
    }
  }

  return {
    renderAndRunEffects,
    flushVerify: async () => {
      if (resolveVerify) {
        resolveVerify();
        await new Promise((r) => setImmediate(r));
        await new Promise((r) => setImmediate(r));
      }
    },
    pushedRoutes,
    replacedUrls,
    localStore,
    sessionStorage: gh.storage,
    getCurrentUser: () => currentUser,
  };
}

test("GithubCallback does not self-clobber to /login?error=missing_token when useEffect re-runs after replaceState", async () => {
  const h = mountCallbackPage({
    search: "?state=valid-state",
    hash: "#token=jwt-fragment-token",
    expectedState: "valid-state",
  });

  // First render + effect run scrubs #token=... via history.replaceState while /auth/verify is in flight.
  h.renderAndRunEffects();
  assert.deepEqual(h.replacedUrls, ["/auth/callback?state=valid-state"]);
  assert.deepEqual(h.pushedRoutes, []);

  // Second render + effect run (StrictMode or router/context update after replaceState wiped location.hash).
  h.renderAndRunEffects();
  assert.deepEqual(
    h.pushedRoutes,
    [],
    "must not redirect to /login?error=missing_token on effect re-run",
  );

  await h.flushVerify();
  assert.deepEqual(h.pushedRoutes, ["/home"]);
  assert.equal(h.getCurrentUser()?.id, "u1");
  assert.equal(h.sessionStorage.has("githubLoginState"), false);
});

test("GithubCallback accepts query-string ?token= fallback and scrubs token from address bar", async () => {
  const h = mountCallbackPage({
    search: "?token=jwt-query-token&state=valid-state",
    hash: "",
    expectedState: "valid-state",
  });

  h.renderAndRunEffects();
  assert.deepEqual(h.replacedUrls, ["/auth/callback?state=valid-state"]);
  assert.equal(h.localStore.get("authToken"), "jwt-query-token");

  await h.flushVerify();
  assert.deepEqual(h.pushedRoutes, ["/home"]);
});

test("GithubCallback clears githubLoginState on missing_token and invalid_state redirects", () => {
  const missing = mountCallbackPage({
    search: "?state=valid-state",
    hash: "",
    expectedState: "valid-state",
  });
  missing.renderAndRunEffects();
  assert.deepEqual(missing.pushedRoutes, ["/login?error=missing_token"]);
  assert.equal(missing.sessionStorage.has("githubLoginState"), false);

  const badState = mountCallbackPage({
    search: "?state=wrong-state",
    hash: "#token=jwt-token",
    expectedState: "valid-state",
  });
  badState.renderAndRunEffects();
  assert.deepEqual(badState.pushedRoutes, ["/login?error=invalid_state"]);
  assert.equal(badState.sessionStorage.has("githubLoginState"), false);
});

function renderLoginForm(search = "") {
  const { filename, outputText } = transpile("components/auth/login-form.tsx");
  const gh = loadGithubLogin();
  const state = [];
  const effects = [];
  let stateCursor = 0;
  let effectCursor = 0;
  const components = new Proxy({}, { get: (_, name) => name });

  const module = { exports: {} };
  vm.runInNewContext(
    outputText,
    {
      module,
      exports: module.exports,
      process: { env: { NODE_ENV: "production" } },
      window: {
        location: { search },
      },
      URLSearchParams,
      console,
      require(id) {
        if (id === "react") {
          return {
            useState(initial) {
              const i = stateCursor++;
              if (!(i in state)) state[i] = initial;
              return [
                state[i],
                (val) => {
                  state[i] = typeof val === "function" ? val(state[i]) : val;
                },
              ];
            },
            useEffect(fn) {
              const i = effectCursor++;
              effects[i] = fn;
            },
          };
        }
        if (id === "react/jsx-runtime") {
          const jsx = (type, props) => ({ type, props });
          return { jsx, jsxs: jsx, Fragment: "Fragment" };
        }
        if (id.startsWith("@/components/ui/") || id === "lucide-react") {
          return components;
        }
        if (id === "@/lib/bounty-context") {
          return {
            useBounty: () => ({
              login: async () => ({ success: false }),
              currentUser: null,
            }),
          };
        }
        if (id === "next/navigation") {
          return { useRouter: () => ({ push() {} }) };
        }
        if (id === "@/lib/configENV") {
          return { backendUrl: "https://backend.example" };
        }
        if (id === "@/lib/githubLogin") return gh.exports;
        throw new Error(`Unexpected login-form dependency: ${id}`);
      },
    },
    { filename },
  );

  stateCursor = 0;
  effectCursor = 0;
  module.exports.LoginForm();
  for (const eff of effects) eff();
  stateCursor = 0;
  effectCursor = 0;
  return text(module.exports.LoginForm());
}

test("LoginForm displays user-friendly Alert banner for ?error=no_email and ?error=missing_token", () => {
  const noEmailText = renderLoginForm("?error=no_email");
  assert.match(noEmailText, /verified primary email address/i);
  assert.match(noEmailText, /GitHub Settings/i);

  const missingTokenText = renderLoginForm("?error=missing_token");
  assert.match(missingTokenText, /session token was missing/i);

  const cleanText = renderLoginForm("");
  assert.ok(!cleanText.includes("verified primary email address"));
  assert.ok(!cleanText.includes("session token was missing"));
});
