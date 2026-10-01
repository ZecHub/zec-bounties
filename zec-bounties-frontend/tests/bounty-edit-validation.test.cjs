const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { loadRoutes } = require("../../zec-bounties-backend/tests/helpers/bountyValidationHarness");

// Execute the real TSX components and date helpers. Only hooks/rendering and
// integrations are replaced; no DOM, authentication or notification services.
function loadTs(relative, requireFixture) {
  const filename = path.resolve(__dirname, "..", relative);
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, []);
  const module = { exports: {} };
  vm.runInNewContext(result.outputText, {
    module, exports: module.exports, require: requireFixture, Date, console,
  }, { filename });
  return module.exports;
}

function mount(kind) {
  const bounty = {
    id: "b1", title: "Expired fixture", description: "A valid expired bounty fixture.",
    bountyAmount: 1, timeToComplete: "2000-01-02T03:45:12.000Z",
    createdBy: "owner", teamId: null, status: "TO_DO", chain: "MAIN", assignees: [],
  };
  const h = loadRoutes({ bounty: {
    findUnique: async () => ({ ...bounty }),
    update: async ({ data }) => { Object.assign(bounty, data); return { ...bounty }; },
  } });
  const state = [];
  let cursor = 0, initialized = false, effect, payload, response;
  const components = new Proxy({}, { get: (_, name) => name });
  const utils = loadTs("lib/utils.ts", id => {
    if (id === "clsx") return { clsx: () => "" };
    if (id === "tailwind-merge") return { twMerge: () => "" };
    throw new Error(`Unexpected date helper dependency: ${id}`);
  });
  const exports = loadTs(`components/${kind}/edit-bounty-modal.tsx`, id => {
    if (id === "react") return {
      useState(initial) {
        const i = cursor++;
        if (!(i in state)) state[i] = initial;
        return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }];
      },
      useEffect(fn) { if (!initialized) effect = fn; },
    };
    if (id === "react/jsx-runtime") {
      const jsx = (type, props) => ({ type, props });
      return { jsx, jsxs: jsx, Fragment: "Fragment" };
    }
    if (id === "@/lib/utils") return utils;
    if (id === "@/lib/displayName") return { displayName: user => user.name };
    if (id === "@/lib/bounty-context") return { useBounty: () => ({
      nonAdminUsers: [{ id: "hunter", name: "Hunter", UA_address: "fixture", z_address: "fixture" }],
      updateBounty: async (_id, body) => {
        // Match the HTTP JSON boundary: omit undefined, serialize Date values.
        payload = JSON.parse(JSON.stringify(body));
        response = await h.request("edit", payload);
      },
    }) };
    if (id.startsWith("@/components/ui/") || id === "lucide-react" || id === "../ZecToUsd") return components;
    throw new Error(`Unexpected modal dependency: ${id}`);
  });
  const Component = kind === "admin" ? exports.EditBountyModal : exports.TeamsEditBountyModal;
  function render() {
    cursor = 0;
    const tree = Component({ bounty, open: true, onOpenChange() {} });
    if (!initialized) { initialized = true; effect(); return render(); }
    return tree;
  }
  function find(predicate, node = render()) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.map(child => find(predicate, child)).find(Boolean);
    if (predicate(node)) return node;
    return find(predicate, node.props?.children ?? null);
  }
  return {
    bounty, find,
    async save() {
      const button = find(node => node.type === "Button" && node.props.onClick?.name === "handleSave");
      assert.ok(button && !button.props.disabled);
      await button.props.onClick();
      return { payload, response };
    },
  };
}

for (const timezone of ["UTC", "Pacific/Honolulu"]) {
  for (const kind of ["admin", "teams"]) {
    test(`${kind} in ${timezone}: unchanged expired deadline does not block title edits or lose its time`, async () => {
      process.env.TZ = timezone;
      const form = mount(kind);
      form.find(node => node.type === "Input" && node.props.id === "edit-title")
        .props.onChange({ target: { value: "Edited fixture title" } });
      const { payload, response } = await form.save();
      assert.equal(response.statusCode, 200);
      assert.equal(payload.timeToComplete, undefined);
      assert.equal(form.bounty.title, "Edited fixture title");
      assert.equal(form.bounty.timeToComplete, "2000-01-02T03:45:12.000Z");
    });
    test(`${kind} in ${timezone}: expired deadline permits assignee payload`, async () => {
      process.env.TZ = timezone;
      const form = mount(kind);
      form.find(node => node.type === "button" && node.props.children?.includes?.("assignees"))
        .props.onClick();
      form.find(node => node.type === "button" && node.props.onClick?.toString().includes("toggleUser(user.id)"))
        .props.onClick();
      const { payload, response } = await form.save();
      assert.equal(response.statusCode, 200);
      assert.deepEqual(payload.userIds, ["hunter"]);
      assert.equal(payload.timeToComplete, undefined);
    });
    for (const [deadline, expected] of [["2099-02-03", 200], ["2001-02-03", 400]]) {
      test(`${kind} in ${timezone}: changed deadline ${deadline} returns ${expected}`, async () => {
        process.env.TZ = timezone;
        const form = mount(kind);
        form.find(node => node.type === "Input" && node.props.type === "date")
          .props.onChange({ target: { value: deadline } });
        const { payload, response } = await form.save();
        assert.ok(payload.timeToComplete);
        assert.equal(response.statusCode, expected);
        if (expected === 400) assert.equal(form.bounty.timeToComplete, "2000-01-02T03:45:12.000Z");
        else assert.equal(new Date(form.bounty.timeToComplete).getTime(), new Date(payload.timeToComplete).getTime());
      });
    }
  }
}
