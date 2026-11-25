const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadGithubLogin({
  backendUrl = "https://api.example.test///",
  sessionStorageImpl,
  assignImpl,
} = {}) {
  const filename = path.resolve(__dirname, "..", "lib/githubLogin.ts");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    reportDiagnostics: true,
  });
  assert.deepEqual(compiled.diagnostics, []);
  const mod = { exports: {} };
  const customRequire = (specifier) => {
    if (specifier === "@/lib/configENV") {
      return { backendUrl };
    }
    throw new Error(`Unexpected require: ${specifier}`);
  };
  const ctx = {
    module: mod,
    exports: mod.exports,
    require: customRequire,
    crypto: crypto.webcrypto,
    Uint8Array,
    encodeURIComponent,
    window: { location: { assign: assignImpl || (() => {}) } },
  };
  if (sessionStorageImpl !== undefined) {
    ctx.sessionStorage = sessionStorageImpl;
  }
  vm.runInNewContext(compiled.outputText, ctx, { filename });
  return mod.exports;
}

test("startGithubLogin stores 64-hex state, normalizes backendUrl, and redirects", () => {
  const store = new Map();
  let assignedUrl = null;

  const { startGithubLogin, readGithubLoginState, clearGithubLoginState } = loadGithubLogin({
    backendUrl: "https://api.example.test///",
    sessionStorageImpl: {
      setItem: (k, v) => store.set(k, v),
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      removeItem: (k) => store.delete(k),
    },
    assignImpl: (url) => {
      assignedUrl = url;
    },
  });

  startGithubLogin();
  const state = readGithubLoginState();
  assert.match(state, /^[0-9a-f]{64}$/);
  assert.equal(assignedUrl, `https://api.example.test/auth/github?state=${state}`);

  clearGithubLoginState();
  assert.equal(readGithubLoginState(), null);
});

test("storage helpers degrade safely and startGithubLogin refuses to redirect when storage fails", () => {
  let redirected = false;
  const broken = loadGithubLogin({
    sessionStorageImpl: {
      setItem: () => {
        throw new Error("SecurityError");
      },
      getItem: () => {
        throw new Error("SecurityError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    },
    assignImpl: () => {
      redirected = true;
    },
  });

  assert.equal(broken.readGithubLoginState(), null);
  assert.doesNotThrow(() => broken.clearGithubLoginState());
  assert.throws(() => broken.startGithubLogin(), /unable to store github sign-in state/i);
  assert.equal(redirected, false);

  const ssr = loadGithubLogin({ sessionStorageImpl: undefined });
  assert.equal(ssr.readGithubLoginState(), null);
  assert.doesNotThrow(() => ssr.clearGithubLoginState());
});

test("getGithubOAuthErrorMessage trims whitespace, handles blanks, and maps known/unknown codes", () => {
  const { getGithubOAuthErrorMessage } = loadGithubLogin();
  assert.equal(getGithubOAuthErrorMessage(null), null);
  assert.equal(getGithubOAuthErrorMessage(""), null);
  assert.equal(getGithubOAuthErrorMessage("   \t\n "), null);
  assert.equal(
    getGithubOAuthErrorMessage("  invalid_state  "),
    "Sign-in state did not match. Please try again.",
  );
  assert.equal(
    getGithubOAuthErrorMessage("no_email"),
    "A verified GitHub email is required.",
  );
  assert.equal(
    getGithubOAuthErrorMessage("account_exists"),
    "This GitHub account cannot be linked.",
  );
  assert.equal(
    getGithubOAuthErrorMessage("unexpected_code"),
    "Sign-in failed. Please try again.",
  );
});
