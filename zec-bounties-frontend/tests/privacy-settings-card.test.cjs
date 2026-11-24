const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function mount(initialProps) {
  const state = [];
  let cursor = 0;
  let currentProps = { ...initialProps };
  const toasts = { success: [], error: [] };
  const visibilityChanges = [];
  const components = new Proxy({}, { get: (_, name) => name });

  const filename = path.resolve(
    __dirname,
    "../components/profile/privacy-settings-card.tsx",
  );
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
      useState(initial) {
        const i = cursor++;
        if (!(i in state)) state[i] = initial;
        return [
          state[i],
          (value) => {
            state[i] = typeof value === "function" ? value(state[i]) : value;
          },
        ];
      },
    },
    "react/jsx-runtime": {
      Fragment: "Fragment",
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
    },
    "next/link": { default: "Link" },
    sonner: {
      toast: {
        success: (msg) => toasts.success.push(msg),
        error: (msg) => toasts.error.push(msg),
      },
    },
  };

  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      Error,
      require(id) {
        if (Object.hasOwn(dependencies, id)) return dependencies[id];
        if (id.startsWith("@/components/") || id === "lucide-react")
          return components;
        throw new Error(`Unexpected dependency: ${id}`);
      },
    },
    { filename },
  );

  function render(overrides) {
    if (overrides) currentProps = { ...currentProps, ...overrides };
    cursor = 0;
    return module.exports.PrivacySettingsCard({
      ...currentProps,
      onVisibilityChange: (next) => {
        visibilityChanges.push(next);
        currentProps = { ...currentProps, visibility: next };
        currentProps.onVisibilityChange?.(next);
      },
    });
  }

  function walk(predicate, node, acc) {
    if (!node || typeof node !== "object") return acc;
    if (Array.isArray(node)) {
      for (const child of node) walk(predicate, child, acc);
      return acc;
    }
    if (predicate(node)) acc.push(node);
    walk(predicate, node.props?.children, acc);
    return acc;
  }

  function findAll(predicate, node = render()) {
    return walk(predicate, node, []);
  }

  function find(predicate, node = render()) {
    return findAll(predicate, node)[0];
  }

  return {
    render,
    find,
    findAll,
    toasts,
    visibilityChanges,
    DEFAULT_VISIBILITY: module.exports.DEFAULT_VISIBILITY,
  };
}

test("locks toggles/bulk actions and guards re-entry while saving", async () => {
  let finishSave;
  let saveCalls = 0;
  const ui = mount({
    bio: "",
    loading: false,
    visibility: {
      showAvatar: true,
      showDisplayName: true,
      showBio: false,
      showBadges: false,
      showCompleted: false,
      showCreated: false,
      showEarnings: false,
      showCompletionRate: false,
      showAddressType: false,
      showMemberSince: false,
      showRecentBounties: false,
      showRole: false,
      showGithub: false,
      showDiscord: false,
    },
    onSave: () => {
      saveCalls += 1;
      return new Promise((resolve) => {
        finishSave = resolve;
      });
    },
  });

  // Trigger a change to enable Save
  const switches = ui.findAll((n) => n.type === "Switch");
  switches[2].props.onCheckedChange(true);
  assert.equal(ui.visibilityChanges.length, 1);

  const saveBtn = ui.find(
    (n) =>
      n.type === "Button" &&
      Array.isArray(n.props.children) &&
      n.props.children.includes("Save privacy settings"),
  );
  assert.equal(saveBtn.props.disabled, false);

  const savePromise = saveBtn.props.onClick();

  // While saving: Hide all, Show all, and Switches are disabled and ignore invocations
  const hideAllBtn = ui.find(
    (n) => n.type === "Button" && n.props.children === "Hide all",
  );
  const showAllBtn = ui.find(
    (n) => n.type === "Button" && n.props.children === "Show all",
  );
  assert.equal(hideAllBtn.props.disabled, true);
  assert.equal(showAllBtn.props.disabled, true);
  hideAllBtn.props.onClick();
  const busySwitches = ui.findAll((n) => n.type === "Switch");
  assert.equal(busySwitches[0].props.disabled, true);
  busySwitches[0].props.onCheckedChange(false);
  assert.equal(ui.visibilityChanges.length, 1);

  // Re-invoking handleSave while busy does not double-submit
  await ui
    .find(
      (n) =>
        n.type === "Button" &&
        Array.isArray(n.props.children) &&
        n.props.children.includes("Save privacy settings"),
    )
    .props.onClick();
  assert.equal(saveCalls, 1);

  finishSave();
  await savePromise;
  assert.deepEqual(ui.toasts.success, ["Privacy settings saved"]);
});

test("handles nullish onSave rejections safely without throwing TypeError", async () => {
  const ui = mount({
    bio: "",
    loading: false,
    visibility: {
      showAvatar: true,
      showDisplayName: true,
      showBio: false,
      showBadges: false,
      showCompleted: false,
      showCreated: false,
      showEarnings: false,
      showCompletionRate: false,
      showAddressType: false,
      showMemberSince: false,
      showRecentBounties: false,
      showRole: false,
      showGithub: false,
      showDiscord: false,
    },
    onSave: async () => {
      throw null;
    },
  });

  ui.find((n) => n.type === "Button" && n.props.children === "Show all").props.onClick();
  await ui
    .find(
      (n) =>
        n.type === "Button" &&
        Array.isArray(n.props.children) &&
        n.props.children.includes("Save privacy settings"),
    )
    .props.onClick();

  assert.deepEqual(ui.toasts.error, ["Save failed"]);
});

test("does not mark dirty when Show all / Hide all produces no change", () => {
  const allFalse = {
    showAvatar: false,
    showDisplayName: false,
    showBio: false,
    showBadges: false,
    showCompleted: false,
    showCreated: false,
    showEarnings: false,
    showCompletionRate: false,
    showAddressType: false,
    showMemberSince: false,
    showRecentBounties: false,
    showRole: false,
    showGithub: false,
    showDiscord: false,
  };
  const ui = mount({
    bio: "",
    loading: false,
    visibility: allFalse,
    onSave: async () => {},
  });

  ui.find((n) => n.type === "Button" && n.props.children === "Hide all").props.onClick();
  assert.equal(ui.visibilityChanges.length, 0);
  const saveBtn = ui.find(
    (n) =>
      n.type === "Button" &&
      Array.isArray(n.props.children) &&
      n.props.children.includes("Save privacy settings"),
  );
  assert.equal(saveBtn.props.disabled, true);
});
