const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// The team page keeps its submissions in its own state, so the context's
// shared submission lists are empty there. "Reject remaining pending
// submissions" must still send its request when the caller passes the bounty.
// Runs the real BountyProvider with React hooks replaced; no DOM.
function loadTs(relative, requireFixture, globals = {}) {
  const filename = path.resolve(__dirname, "..", relative);
  const out = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(out, { module, exports: module.exports, require: requireFixture, process, console, ...globals }, { filename });
  return module.exports;
}

function hooks() {
  const state = [];
  let cursor = 0;
  return {
    state,
    reset() { cursor = 0; },
    react: {
      createContext: () => ({ Provider: "Provider" }),
      useContext: () => undefined,
      useState(initial) {
        const i = cursor++;
        if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
        return [state[i], (v) => { state[i] = typeof v === "function" ? v(state[i]) : v; }];
      },
      useEffect() {},
      useMemo: (fn) => fn(),
      useRef: (value) => ({ current: value }),
    },
  };
}

const jsxRuntime = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: "Fragment" };

function provider() {
  const h = hooks();
  const requests = [];
  const fetch = async (url, init = {}) => {
    requests.push({ url: String(url), method: init.method ?? "GET" });
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const local = (relative) => loadTs(relative, (id) => {
    if (id === "./configENV") return { backendUrl: "http://api.test", backendWebSpocketUrl: "ws://api.test" };
    throw new Error(`Unexpected dependency: ${id}`);
  });
  const { BountyProvider } = loadTs("lib/bounty-context.tsx", (id) => {
    if (id === "react") return h.react;
    if (id === "react/jsx-runtime") return jsxRuntime;
    if (id === "./configENV") return { backendUrl: "http://api.test", backendWebSpocketUrl: "ws://api.test" };
    if (id === "./displayName") return local("lib/displayName.ts");
    if (id === "./bounty-merge") return local("lib/bounty-merge.ts");
    if (id === "./types") return {};
    throw new Error(`Unexpected dependency: ${id}`);
  }, { fetch, localStorage: { getItem: () => "token", setItem() {}, removeItem() {} }, setTimeout, clearTimeout, URLSearchParams, Promise, Date, JSON });
  const render = () => { h.reset(); return BountyProvider({ children: null }).props.value; };
  render();
  h.state[1] = { id: "owner", role: "TEAM" }; // currentUser: a team owner, not a platform admin
  return { value: render(), requests };
}

test("reject others sends its request when the shared submission lists are empty", async () => {
  const { value, requests } = provider();
  await value.rejectOtherSubmissions("s1", "b1");
  assert.ok(
    requests.some((r) => r.method === "PATCH" && r.url.endsWith("/api/bounties/submissions/s1/reject-others")),
    `no reject-others request; sent: ${JSON.stringify(requests)}`,
  );
});
