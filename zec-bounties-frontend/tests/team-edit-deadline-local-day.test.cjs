const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// A deadline is a calendar day. The team edit dialog must show and save the day
// the person picked in their own time zone, as the admin edit dialog already
// does. Runs the real TSX with hooks replaced; no DOM.
function loadTs(relative, requireFixture) {
  const filename = path.resolve(__dirname, "..", relative);
  const out = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(out, { module, exports: module.exports, require: requireFixture, Date, console }, { filename });
  return module.exports;
}

const utils = () => loadTs("lib/utils.ts", (id) => {
  if (id === "clsx") return { clsx: () => "" };
  if (id === "tailwind-merge") return { twMerge: () => "" };
  throw new Error(`Unexpected utils dependency: ${id}`);
});

function hooks() {
  const state = [];
  let cursor = 0;
  const effects = [];
  return {
    reset() { cursor = 0; },
    runEffects() { effects.splice(0).forEach((fn) => fn()); },
    react: {
      useState(initial) {
        const i = cursor++;
        if (!(i in state)) state[i] = initial;
        return [state[i], (v) => { state[i] = typeof v === "function" ? v(state[i]) : v; }];
      },
      useEffect(fn) { effects.push(fn); },
      useMemo(fn) { return fn(); },
    },
  };
}

function find(node, predicate) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  if (predicate(node)) return node;
  return find(node.props?.children ?? null, predicate);
}

function text(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node !== "object") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return text(node.props?.children);
}

const ui = new Proxy({}, { get: (_, name) => name });
const jsxRuntime = () => { const jsx = (type, props) => ({ type, props }); return { jsx, jsxs: jsx, Fragment: "Fragment" }; };
const localDay = (iso) => { const d = new Date(iso); return [d.getFullYear(), d.getMonth() + 1, d.getDate()].join("-"); };

function loadEditModal(h, sent) {
  return loadTs("components/teams/edit-bounty-modal.tsx", (id) => {
    if (id === "react") return h.react;
    if (id === "react/jsx-runtime") return jsxRuntime();
    if (id === "@/lib/utils") return utils();
    if (id === "@/lib/bounty-context") return { useBounty: () => ({
      updateBounty: async (_id, body) => { sent.push(JSON.parse(JSON.stringify(body))); },
      nonAdminUsers: [],
    }) };
    if (id === "@/lib/displayName") return { displayName: (u) => u.name ?? "" };
    if (id === "lucide-react" || id.startsWith("@/components/ui/")) return ui;
    throw new Error(`Unexpected dependency: ${id}`);
  }).TeamsEditBountyModal;
}

function openEdit(due) {
  const h = hooks();
  const sent = [];
  const TeamsEditBountyModal = loadEditModal(h, sent);
  const props = { bounty: { id: "b1", title: "Team bounty", description: "Fixture", bountyAmount: 1, timeToComplete: due, chain: "TEST", assignees: [] }, open: true, onOpenChange() {} };
  const render = () => { h.reset(); return TeamsEditBountyModal(props); };
  render(); h.runEffects();
  return { render, sent, dateInput: (tree) => find(tree, (n) => n.props?.id === "edit-deadline") };
}

async function save(tree) {
  await find(tree, (n) => n.type === "Button" && /save/i.test(text(n))).props.onClick();
}

for (const timezone of ["America/New_York", "Asia/Tokyo", "UTC"]) {
  test(`team edit in ${timezone}: shows the deadline day and keeps it when unchanged`, async () => {
    process.env.TZ = timezone;
    // Created in the same zone for 20 Nov: the create dialogs store local midnight.
    const edit = openEdit(new Date(2026, 10, 20).toISOString());
    const tree = edit.render();
    assert.equal(edit.dateInput(tree).props.value, "2026-11-20");
    await save(tree);
    assert.equal(edit.sent[0].timeToComplete, undefined);
  });

  test(`team edit in ${timezone}: a newly picked day is saved as that day`, async () => {
    process.env.TZ = timezone;
    const edit = openEdit(new Date(2026, 10, 20).toISOString());
    edit.dateInput(edit.render()).props.onChange({ target: { value: "2026-11-25" } });
    await save(edit.render());
    assert.equal(localDay(edit.sent[0].timeToComplete), "2026-11-25");
  });
}
