const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Render the real edit modal as an admin, type into the assignee search and
// report which users are listed. Only hooks and UI components are replaced.
function load(relative, requireFixture) {
  const filename = path.resolve(__dirname, "..", relative);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  const module = { exports: {} };
  vm.runInNewContext(outputText, { module, exports: module.exports, require: requireFixture, Date, console }, { filename });
  return module.exports;
}

const users = [
  { id: "alice", name: "Alice Smith", nickname: "asmith", email: "a@example.test" },
  { id: "bob", name: "Bob Jones", nickname: null, email: "b@example.test" },
];

function search(query) {
  const state = [];
  let cursor = 0;
  const components = new Proxy({}, { get: (_, name) => name });
  const jsx = (type, props, key) => ({ type, props, key });
  const { BountyEditModal } = load("components/bounty-edit-modal.tsx", (id) => {
    if (id === "react") {
      return {
        useState(initial) {
          const i = cursor++;
          if (!(i in state)) state[i] = initial;
          return [state[i], (value) => { state[i] = typeof value === "function" ? value(state[i]) : value; }];
        },
        useEffect() {},
        useMemo: (fn) => fn(),
      };
    }
    if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
    if (id === "next/link") return { __esModule: true, default: "Link" };
    if (id === "@/lib/displayName") return load("lib/displayName.ts", () => ({ backendUrl: "" }));
    if (id === "@/lib/bounty-context") return { useBounty: () => ({ currentUser: { id: "admin", role: "ADMIN" }, nonAdminUsers: users }) };
    if (id === "@/lib/configENV") return { IS_DEV: false };
    if (id === "@/lib/repos") return { REPOS: [] };
    if (id === "@/lib/utils") return { toDateInputValue: () => "", parseDateInputValue: () => new Date() };
    return components;
  });
  const bounty = { id: "b1", title: "Bounty", status: "TO_DO", chain: "MAIN", assignees: [] };
  const render = () => {
    cursor = 0;
    const nodes = [];
    (function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object" || !node.props) return;
      nodes.push(node);
      walk(node.props.children);
    })(BountyEditModal({ variant: "admin", bounty, open: true, onOpenChange() {}, defaultSection: "assignees" }));
    return nodes;
  };
  render().find((n) => n.props.placeholder?.startsWith("Search by name")).props.onChange({ target: { value: query } });
  return render().filter((n) => n.type === "button" && users.some((u) => u.id === n.key)).map((n) => n.key);
}

for (const [query, expected] of [
  ["Alice Smith", ["alice"]],
  ["Alice Smith (@asmith)", ["alice"]],
  ["asmith", ["alice"]],
  ["a@example.test", ["alice"]],
  ["bob jones", ["bob"]],
  ["null", []],
]) {
  test(`an admin searching assignees for "${query}" sees ${expected.join(", ") || "nobody"}`, () => {
    assert.deepEqual(search(query), expected);
  });
}
