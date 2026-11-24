const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function mount(options = {}) {
  const state = [];
  const refs = [];
  const effectRecords = [];
  let stateCursor = 0;
  let refCursor = 0;
  let effectCursor = 0;
  let currentContext = options.initialContext || {
    isLoading: false,
    currentUser: { id: "user-a" },
  };
  const activeTimers = new Map();
  let nextTimerId = 1;
  const clearedTimers = [];

  const components = new Proxy({}, { get: (_, name) => name });
  const filename = path.resolve(__dirname, "../components/payout-keys-card.tsx");
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
        const i = stateCursor++;
        if (!(i in state)) state[i] = initial;
        return [
          state[i],
          (value) => {
            state[i] = typeof value === "function" ? value(state[i]) : value;
          },
        ];
      },
      useRef(initial) {
        const i = refCursor++;
        if (!(i in refs)) refs[i] = { current: initial };
        return refs[i];
      },
      useEffect(fn, deps) {
        const i = effectCursor++;
        const prev = effectRecords[i];
        const changed =
          !prev ||
          !deps ||
          !prev.deps ||
          deps.length !== prev.deps.length ||
          deps.some((d, idx) => !Object.is(d, prev.deps[idx]));
        if (changed) {
          if (prev?.cleanup) prev.cleanup();
          const cleanup = fn();
          effectRecords[i] = { deps, cleanup: typeof cleanup === "function" ? cleanup : null };
        }
      },
    },
    "react/jsx-runtime": {
      Fragment: "Fragment",
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
    },
    sonner: {
      toast: { success() {}, error() {} },
    },
    "@/lib/bounty-context": {
      useBounty: () => currentContext,
    },
    "@/lib/displayName": {
      displayName: (u) => u?.nickname || u?.name || "Approver",
    },
    "@/lib/payout-passkeys": {
      listPayoutKeys: (...args) => options.listPayoutKeys(...args),
      enrollPayoutKey: async () => ({
        id: "k-new",
        activatesAt: "2026-12-01T00:00:00Z",
      }),
      revokePayoutKey: async () => undefined,
    },
  };

  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      Date,
      console,
      setTimeout(fn, ms) {
        const id = nextTimerId++;
        activeTimers.set(id, { fn, ms });
        return id;
      },
      clearTimeout(id) {
        clearedTimers.push(id);
        activeTimers.delete(id);
      },
      require(id) {
        if (Object.hasOwn(dependencies, id)) return dependencies[id];
        if (id.startsWith("@/components/") || id === "lucide-react")
          return components;
        throw new Error(`Unexpected dependency: ${id}`);
      },
    },
    { filename },
  );

  function render(nextContext) {
    if (nextContext) currentContext = nextContext;
    stateCursor = 0;
    refCursor = 0;
    effectCursor = 0;
    return module.exports.PayoutKeysCard();
  }

  function unmount() {
    for (const rec of effectRecords) {
      if (rec?.cleanup) rec.cleanup();
    }
  }

  function flushTimers() {
    for (const [id, entry] of [...activeTimers.entries()]) {
      activeTimers.delete(id);
      entry.fn();
    }
  }

  const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

  return { render, unmount, flushTimers, flushMicrotasks, state, activeTimers, clearedTimers };
}

test("switching currentUser clears previous user's keys and ignores stale out-of-order responses", async () => {
  const resolvers = [];
  const ui = mount({
    initialContext: { isLoading: false, currentUser: { id: "user-a" } },
    listPayoutKeys: () =>
      new Promise((resolve) => {
        resolvers.push(resolve);
      }),
  });

  // Mount for user A
  ui.render();
  assert.equal(resolvers.length, 1);

  // Switch to user B before user A's fetch resolves
  ui.render({ isLoading: false, currentUser: { id: "user-b" } });
  assert.equal(resolvers.length, 2);

  // User B resolves first
  resolvers[1]({
    mine: [{ id: "key-b", label: "User B Key", activatesAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" }],
    pending: [],
  });
  await ui.flushMicrotasks();
  ui.flushTimers();
  await ui.flushMicrotasks();

  // Stale User A response arrives late
  resolvers[0]({
    mine: [{ id: "key-a", label: "User A Key", activatesAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" }],
    pending: [{ id: "pend-a", activatesAt: "2027-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" }],
  });
  await ui.flushMicrotasks();

  // state[0] = mine, state[1] = pending, state[3] = loading
  assert.deepEqual(
    Array.from(ui.state[0], (k) => k.id),
    ["key-b"],
  );
  assert.equal(ui.state[1].length, 0);
  assert.equal(ui.state[3], false);
});

test("signing out clears keys and exits loading state", async () => {
  const ui = mount({
    initialContext: { isLoading: false, currentUser: { id: "user-a" } },
    listPayoutKeys: async () => ({
      mine: [{ id: "key-a", label: "A", activatesAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" }],
      pending: [],
    }),
  });

  ui.render();
  await ui.flushMicrotasks();
  ui.flushTimers();
  await ui.flushMicrotasks();
  assert.equal(ui.state[0].length, 1);

  ui.render({ isLoading: false, currentUser: null });
  assert.equal(ui.state[0].length, 0);
  assert.equal(ui.state[1].length, 0);
  assert.equal(ui.state[3], false);
});

test("unmounting clears the minimum-loading timer and skips post-unmount state updates", async () => {
  const ui = mount({
    initialContext: { isLoading: false, currentUser: { id: "user-a" } },
    listPayoutKeys: async () => ({
      mine: [{ id: "key-a", label: "A", activatesAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" }],
      pending: [],
    }),
  });

  ui.render();
  await ui.flushMicrotasks();

  // MIN_LOADING_MS timer is currently armed
  assert.equal(ui.activeTimers.size, 1);
  assert.equal(ui.state[3], true);

  ui.unmount();
  assert.equal(ui.activeTimers.size, 0);
  assert.equal(ui.clearedTimers.length, 1);
  assert.equal(ui.state[3], true);
});
