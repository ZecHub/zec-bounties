const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// A deadline is a calendar day. These dialogs must show and save the day the
// person picked in their own time zone, as the admin and hunter create dialogs
// already do (a9b2106). Runs the real TSX with hooks replaced; no DOM.
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

for (const timezone of ["America/New_York", "Asia/Tokyo", "UTC"]) {
  test(`team review in ${timezone}: the suggestion's deadline day is shown and kept on edit`, async () => {
    process.env.TZ = timezone;
    // A hunter in the same zone picked 20 Nov; the create dialog stores local midnight.
    const due = new Date(2026, 10, 20).toISOString();
    const h = hooks();
    let sent;
    const { ReviewBountySuggestionModal } = loadTs("components/teams/review-bounty-suggestion-modal.tsx", (id) => {
      if (id === "react") return h.react;
      if (id === "react/jsx-runtime") return jsxRuntime();
      if (id === "@/lib/utils") return utils();
      if (id === "@/lib/bounty-context") return { useBounty: () => ({
        reviewBountySuggestion: async (_id, body) => { sent = JSON.parse(JSON.stringify(body)); },
        fetchTeamBounties: async () => {},
      }) };
      if (id === "sonner") return { toast: { error() {}, success() {} } };
      if (id.startsWith("@/components/ui/")) return ui;
      throw new Error(`Unexpected dependency: ${id}`);
    });
    const props = { bounty: { id: "s1", title: "Suggestion", description: "Fixture", bountyAmount: 1, timeToComplete: due }, teamId: "t1", open: true, onOpenChange() {} };
    const render = () => { h.reset(); return ReviewBountySuggestionModal(props); };
    render(); h.runEffects();
    let tree = render();
    const dateInput = find(tree, (n) => n.type === "Input" && n.props.type === "date");
    assert.equal(dateInput.props.value, "2026-11-20");
    find(tree, (n) => n.type === "Textarea" && /reason/i.test(n.props.id ?? "")).props.onChange({ target: { value: "Fixed the title" } });
    tree = render();
    const edit = find(tree, (n) => n.type === "Button" && /edit/i.test(text(n)));
    await edit.props.onClick();
    assert.equal(localDay(sent.timeToComplete), "2026-11-20");
  });

  test(`team create in ${timezone}: the picked deadline day is shown and saved`, async () => {
    process.env.TZ = timezone;
    const h = hooks();
    let created;
    const { TeamsNewBountyModal } = loadTs("components/teams/new-bounty-modal.tsx", (id) => {
      if (id === "react") return h.react;
      if (id === "react/jsx-runtime") return jsxRuntime();
      if (id === "@/lib/utils") return utils();
      if (id === "@/lib/bounty-context") return { useBounty: () => ({
        createBounty: async (data) => { created = JSON.parse(JSON.stringify(data)); },
        categories: [{ id: "Development", name: "Development" }],
      }) };
      if (id === "sonner") return { toast: { error() {}, success() {} } };
      if (id === "lucide-react" || id.startsWith("@/components/ui/")) return ui;
      throw new Error(`Unexpected dependency: ${id}`);
    });
    const props = { open: true, onOpenChange() {}, defaultTeamId: "t1", defaultTeamName: "Team" };
    const render = () => { h.reset(); return TeamsNewBountyModal(props); };
    let tree = render();
    const field = (id) => find(tree, (n) => n.props?.id === id);
    field("timeToComplete").props.onChange({ target: { value: "2026-11-20" } });
    tree = render();
    assert.equal(field("timeToComplete").props.value, "2026-11-20");
    assert.match(text(tree), /Nov 20, 2026/);
    for (const [id, value] of [["title", "Fixture"], ["category", "Development"], ["reward", "1"], ["description", "Fixture work"]]) {
      field(id).props.onChange({ target: { value } });
    }
    tree = render();
    const form = find(tree, (n) => n.type === "form");
    await form.props.onSubmit({ preventDefault() {} });
    assert.ok(created, "the form was submitted");
    assert.equal(localDay(created.timeToComplete), "2026-11-20");
  });
}
