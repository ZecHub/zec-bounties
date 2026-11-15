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
    // The admin modal registers a window event listener in an effect; a no-op
    // stub lets that effect run harmlessly instead of being special-cased out.
    window: { addEventListener() {}, removeEventListener() {} },
  }, { filename });
  return module.exports;
}

function mount(kind) {
  const bounty = {
    id: "b1", title: "Expired fixture", description: "A valid expired bounty fixture.",
    bountyAmount: 1, timeToComplete: "2000-01-02T03:45:12.000Z",
    createdBy: "owner", teamId: kind === "teams" ? "team-1" : null,
    status: "TO_DO", chain: "MAIN", assignees: [],
  };
  const h = loadRoutes({ bounty: {
    findUnique: async () => ({ ...bounty }),
    update: async ({ data }) => { Object.assign(bounty, data); return { ...bounty }; },
  } });
  const state = [];
  const effects = [];
  const NODEPS = Symbol("nodeps");
  let cursor = 0, effectCursor = 0, payload, response;
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
      // Record each effect with its deps; render() runs it and re-runs it only
      // when its deps change (so switching to the Assignees tab loads the team
      // directory). This follows real useEffect semantics instead of matching
      // effect source text, so it survives refactors of the components.
      useEffect(fn, deps) {
        const i = effectCursor++;
        const rec = effects[i] || (effects[i] = { deps: NODEPS });
        rec.fn = fn;
        rec.nextDeps = deps;
      },
      // Teams modal memoizes the directory lookup; compute it immediately.
      useMemo(fn) { return fn(); },
    };
    if (id === "react/jsx-runtime") {
      const jsx = (type, props) => ({ type, props });
      return { jsx, jsxs: jsx, Fragment: "Fragment" };
    }
    if (id === "@/lib/utils") return utils;
    if (id === "@/lib/displayName") return { displayName: user => user.name };
    if (id === "@/lib/configENV") return { IS_DEV: false };
    if (id === "@/lib/bounty-context") return { useBounty: () => ({
      currentUser: { id: "admin", role: "ADMIN" },
      fetchBountyActivity: async () => [],
      // Sync thenable so the teams directory effect can set users before the next render.
      fetchTeamDirectory: () => ({
        then(resolve) { resolve([{ id: "hunter", name: "Hunter", hasUnifiedAddress: true, hasShieldedAddress: true }]); return this; },
        finally(fn) { fn(); return this; },
      }),
      nonAdminUsers: [{ id: "hunter", name: "Hunter", UA_address: "fixture", z_address: "fixture" }],
      updateBounty: async (_id, body) => {
        // Match the HTTP JSON boundary: omit undefined, serialize Date values.
        payload = JSON.parse(JSON.stringify(body));
        response = await h.request("edit", payload);
      },
    }) };
    if (id.startsWith("@/components/ui/") || id === "lucide-react" || id === "../ZecToUsd") return components;
    if (id === "@/components/repo-filter" || id === "@/components/bounty-chat") return components;
    if (id === "@/components/bounty-edit-modal") return loadTs("components/bounty-edit-modal.tsx", innerId => {
      if (innerId === "react") return {
        useState(initial) {
          const i = cursor++;
          if (!(i in state)) state[i] = initial;
          return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }];
        },
        useEffect(fn, deps) {
          const i = effectCursor++;
          const rec = effects[i] || (effects[i] = { deps: NODEPS });
          rec.fn = fn;
          rec.nextDeps = deps;
        },
        useMemo(fn) { return fn(); },
      };
      if (innerId === "react/jsx-runtime") {
        const jsx = (type, props) => ({ type, props });
        return { jsx, jsxs: jsx, Fragment: "Fragment" };
      }
      if (innerId.startsWith("@/components/ui/") || innerId === "lucide-react" || innerId === "../ZecToUsd" || innerId === "@/components/ZecToUsd") return components;
      if (innerId === "@/components/repo-filter" || innerId === "@/components/bounty-chat") return components;
      if (innerId === "next/link") return { __esModule: true, default: "Link" };
      if (innerId === "@/lib/utils") return utils;
      if (innerId === "@/lib/displayName") return { displayName: user => user.name };
      if (innerId === "@/lib/configENV") return { IS_DEV: false };
      if (innerId === "@/lib/bounty-context") return { useBounty: () => ({
        currentUser: { id: "admin", role: "ADMIN" },
        fetchBountyActivity: async () => [],
        fetchTeamDirectory: () => ({ then(resolve) { resolve([]); return this; }, finally(fn) { fn(); return this; } }),
        nonAdminUsers: [{ id: "hunter", name: "Hunter", UA_address: "fixture", z_address: "fixture" }],
        updateBounty: async () => {},
      }) };
      if (innerId === "@/lib/repos") return { REPOS: [] };
      if (innerId === "@/lib/types") return {};
      throw new Error("Unexpected bounty-edit-modal dependency: " + innerId);
    });
    if (id === "next/link") return { __esModule: true, default: "Link" };
    if (id === "@/lib/repos") return loadTs("lib/repos.ts", dependency => {
      throw new Error(`Unexpected repos dependency: ${dependency}`);
    });
    throw new Error(`Unexpected modal dependency: ${id}`);
  });
  const shared = loadTs("components/bounty-edit-modal.tsx", id => {
    if (id === "react") return {
      useState(initial) {
        const i = cursor++;
        if (!(i in state)) state[i] = initial;
        return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }];
      },
      useEffect(fn, deps) {
        const i = effectCursor++;
        const rec = effects[i] || (effects[i] = { deps: NODEPS });
        rec.fn = fn;
        rec.nextDeps = deps;
      },
      useMemo(fn) { return fn(); },
    };
    if (id === "react/jsx-runtime") {
      const jsx = (type, props) => ({ type, props });
      return { jsx, jsxs: jsx, Fragment: "Fragment" };
    }
    if (id.startsWith("@/components/ui/") || id === "lucide-react" || id === "@/components/ZecToUsd") return components;
    if (id === "@/components/repo-filter" || id === "@/components/bounty-chat") return components;
    if (id === "next/link") return { __esModule: true, default: "Link" };
    if (id === "@/lib/utils") return utils;
    if (id === "@/lib/displayName") return { displayName: user => user.name };
    if (id === "@/lib/configENV") return { IS_DEV: false };
    if (id === "@/lib/bounty-context") return { useBounty: () => ({
      currentUser: { id: "admin", role: "ADMIN" },
      fetchBountyActivity: async () => [],
      fetchTeamDirectory: () => ({ then(r) { r([{ id: "hunter", name: "Hunter", hasUnifiedAddress: true, hasShieldedAddress: true }]); return this; }, finally(fn) { fn(); return this; } }),
      nonAdminUsers: [{ id: "hunter", name: "Hunter", UA_address: "fixture", z_address: "fixture" }],
      updateBounty: async (_id, body) => {
        payload = JSON.parse(JSON.stringify(body));
        response = await h.request("edit", payload);
      },
    }) };
    if (id === "@/lib/repos") return { REPOS: [] };
    if (id === "@/lib/types") return {};
    throw new Error("Unexpected shared modal dependency: " + id);
  });
  const Component = (props) => shared.BountyEditModal({ variant: kind === "admin" ? "admin" : "team", ...props });
  function render() {
    let tree;
    // Render, then flush effects whose deps changed, re-rendering until the
    // effects settle (bounded so a misbehaving effect can't loop forever).
    for (let pass = 0; pass < 20; pass++) {
      cursor = 0;
      effectCursor = 0;
      tree = Component({ bounty, open: true, onOpenChange() {} });
      let ran = false;
      for (const rec of effects) {
        const next = rec.nextDeps;
        const prev = rec.deps;
        const changed =
          prev === NODEPS || !next || !prev ||
          next.length !== prev.length || next.some((x, j) => !Object.is(x, prev[j]));
        if (changed) {
          if (typeof rec.cleanup === "function") rec.cleanup();
          rec.cleanup = rec.fn();
          rec.deps = next;
          ran = true;
        }
      }
      if (!ran) break;
    }
    return tree;
  }
  function find(predicate, node = render(), depth = 0) {
    if (!node || typeof node !== "object" || depth > 80) return;
    if (Array.isArray(node)) return node.map(child => find(predicate, child, depth + 1)).find(Boolean);
    if (predicate(node)) return node;
    return find(predicate, node.props?.children ?? null, depth + 1);
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
      form.find(node => (node.type === "button" || node.type === "Button") && JSON.stringify(node.props?.children ?? "").includes("assignees"))
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
