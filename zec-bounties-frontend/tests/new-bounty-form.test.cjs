const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Compile a TS/TSX file from the frontend and run it with the given require.
function loadTs(relative, requireFixture, globals = {}) {
  const filename = path.resolve(__dirname, "..", relative);
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, []);
  const module = { exports: {} };
  vm.runInNewContext(result.outputText, {
    module, exports: module.exports, require: requireFixture, Date, console, Number, isNaN,
    ...globals,
  }, { filename });
  return module.exports;
}

const noDeps = (id) => { throw new Error(`Unexpected dependency: ${id}`); };
const form = loadTs("lib/new-bounty-form.ts", noDeps);
const utils = loadTs("lib/utils.ts", (id) => {
  if (id === "clsx") return { clsx: () => "" };
  if (id === "tailwind-merge") return { twMerge: () => "" };
  return noDeps(id);
});

const day = (y, m, d) => new Date(y, m - 1, d);
const ymd = (date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()];

// ─── Helpers ────────────────────────────────────────────────────────────────

test("default deadline is 14 days out, at local midnight", () => {
  const deadline = form.defaultDeadline(new Date(2026, 9, 14, 23, 30));
  assert.deepEqual(ymd(deadline), [2026, 10, 28]);
  assert.equal(deadline.getHours(), 0);
});

test("default deadline crosses month and year ends", () => {
  assert.deepEqual(ymd(form.defaultDeadline(day(2026, 12, 25))), [2027, 1, 8]);
  assert.deepEqual(ymd(form.defaultDeadline(day(2028, 2, 20))), [2028, 3, 5]);
});

test("reward of 0, negative, empty or non-numeric is rejected", () => {
  for (const value of [0, -1, NaN, Infinity, Number.parseFloat(""), Number.parseFloat("abc")]) {
    assert.equal(form.validateReward(value), "Enter a reward greater than 0 ZEC.", String(value));
  }
});

test("positive rewards are accepted", () => {
  for (const value of [0.01, 0.055, 1, 25]) {
    assert.equal(form.validateReward(value), undefined, String(value));
  }
});

test("past deadlines are rejected; today and later are accepted", () => {
  const now = new Date(2026, 9, 14, 15, 0);
  assert.equal(form.validateDeadline(day(2026, 10, 13), now), "The deadline can't be in the past.");
  assert.equal(form.validateDeadline(day(2025, 12, 31), now), "The deadline can't be in the past.");
  assert.equal(form.validateDeadline(day(2026, 10, 14), now), undefined);
  assert.equal(form.validateDeadline(day(2026, 10, 15), now), undefined);
});

test("a missing or cleared deadline is rejected", () => {
  assert.equal(form.validateDeadline(new Date(NaN)), "Choose a deadline.");
  assert.equal(form.validateDeadline(undefined), "Choose a deadline.");
  assert.equal(form.validateDeadline(utils.parseDateInputValue("")), "Choose a deadline.");
});

test("quota status reads 'X of Y used, resets on [date]'", () => {
  const quota = { limit: 3, used: 1, remaining: 2, resetsAt: "2026-10-19T00:00:00.000Z" };
  assert.equal(form.formatQuotaStatus(quota, "en-US"), "1 of 3 used, resets on Mon, Oct 19");
});

test("reset date uses UTC, matching the server's Monday 00:00 UTC week", () => {
  // Late Sunday in the Americas is already Monday in UTC; the label must say Monday.
  assert.equal(form.formatQuotaResetDate("2026-10-19T00:00:00.000Z", "en-US"), "Mon, Oct 19");
});

test("quota status without a reset date falls back to 'this week'", () => {
  const quota = { limit: 3, used: 3, remaining: 0, resetsAt: null };
  assert.equal(form.formatQuotaStatus(quota, "en-US"), "3 of 3 used this week");
});

test("no quota status for unlimited users or before the quota loads", () => {
  assert.equal(form.formatQuotaStatus(null), null);
  assert.equal(form.formatQuotaStatus({ limit: null, used: 4, remaining: null, resetsAt: null }), null);
});

test("quota is reached at 0 remaining, never for admins or unlimited users", () => {
  const full = { limit: 3, used: 3, remaining: 0, resetsAt: null };
  const open = { limit: 3, used: 2, remaining: 1, resetsAt: null };
  assert.equal(form.isQuotaReached(full, false), true);
  assert.equal(form.isQuotaReached(open, false), false);
  assert.equal(form.isQuotaReached(full, true), false);
  assert.equal(form.isQuotaReached(null, false), false);
  assert.equal(form.isQuotaReached({ limit: null, used: 9, remaining: null, resetsAt: null }, false), false);
  assert.equal(form.isQuotaReached({ limit: 3, used: 3, remaining: null, resetsAt: null }, false), true);
});

// ─── The real modal component ───────────────────────────────────────────────
// Hooks are replaced by a tiny state store; JSX becomes a plain object tree.

function mountModal({ quota = null, role = "TEAM_USER", createBounty = async () => ({}) } = {}) {
  const state = [];
  let cursor = 0;
  const toasts = [];
  const created = [];
  const components = new Proxy({}, { get: (_, name) => name });
  const icons = new Proxy({}, { get: (_, name) => name });

  const { NewBountyModal } = loadTs("components/new-bounty-modal.tsx", (id) => {
    if (id === "react") return {
      useState(initial) {
        const i = cursor++;
        if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
        return [state[i], (value) => { state[i] = typeof value === "function" ? value(state[i]) : value; }];
      },
      useEffect() {},
      useRef: (value) => ({ current: value }),
    };
    if (id === "react/jsx-runtime") {
      const jsx = (type, props) => ({ type, props });
      return { jsx, jsxs: jsx, Fragment: "Fragment" };
    }
    if (id === "@/lib/utils") return utils;
    if (id === "@/lib/new-bounty-form") return form;
    if (id === "@/lib/repos") return { REPOS: [] };
    if (id === "@/lib/bounty-context") return { useBounty: () => ({
      createBounty: async (data) => { created.push(data); return createBounty(data); },
      currentUser: { role, canCreateTasks: true },
      categories: [{ name: "Development" }],
      bountyQuota: quota,
      fetchBountyQuota: () => {},
      communities: [],
      fetchCommunities: () => {},
    }) };
    if (id === "sonner") return { toast: {
      error: (title, opts) => toasts.push(["error", title, opts]),
      success: (title, opts) => toasts.push(["success", title, opts]),
    } };
    if (id.startsWith("@/components/")) return components;
    if (id === "lucide-react" || id === "react-icons/si") return icons;
    return noDeps(id);
  }, {
    requestAnimationFrame: (fn) => fn(),
    document: { getElementById: () => ({ focus() {} }), activeElement: null, body: {} },
  });

  const render = () => {
    cursor = 0;
    return NewBountyModal({ open: true, onOpenChange() {}, onCancel() {} });
  };
  return { render, toasts, created };
}

function* walk(node) {
  if (Array.isArray(node)) { for (const n of node) yield* walk(n); return; }
  if (!node || typeof node !== "object") return;
  yield node;
  yield* walk(node.props?.children);
}
const byId = (tree, id) => [...walk(tree)].find((n) => n.props?.id === id);
function flatText(children) {
  if (children == null || children === false) return "";
  if (Array.isArray(children)) return children.map(flatText).join("");
  if (typeof children === "object") return flatText(children.props?.children);
  return String(children);
}
const labelFor = (tree, id) => [...walk(tree)].find((n) => n.type === "Label" && n.props.htmlFor === id);
const submitButton = (tree) => [...walk(tree)].find((n) => n.type === "Button" && n.props.type === "submit");
const form_ = (tree) => [...walk(tree)].find((n) => n.type === "form");
const quotaPill = (tree) => [...walk(tree)].find((n) => n.props?.role === "status");
const submit = async (m) => form_(m.render()).props.onSubmit({ preventDefault() {} });
const fill = (m, values) => {
  if (values.title !== undefined) byId(m.render(), "title").props.onChange({ target: { value: values.title } });
  if (values.description !== undefined) byId(m.render(), "description").props.onChange({ target: { value: values.description } });
  if (values.category !== undefined) [...walk(m.render())].find((n) => n.type === "Select" && n.props.value === "").props.onValueChange(values.category);
  if (values.reward !== undefined) byId(m.render(), "reward").props.onChange({ target: { value: values.reward } });
  if (values.date !== undefined) byId(m.render(), "date").props.onChange({ target: { value: values.date } });
};

test("modal: deadline field is labelled 'Deadline' and defaults to 14 days out", () => {
  const tree = mountModal().render();
  assert.match(flatText(labelFor(tree, "date").props.children), /^Deadline$/);
  assert.equal(byId(tree, "date").props.value, utils.toDateInputValue(form.defaultDeadline()));
  assert.equal(byId(tree, "date").props.min, utils.toDateInputValue(new Date()));
});

test("modal: reward starts empty, not 0", () => {
  assert.equal(byId(mountModal().render(), "reward").props.value, "");
});

test("modal: reward of 0 and a past deadline show inline errors and nothing is created", async () => {
  const m = mountModal();
  fill(m, { title: "Fix it", description: "Details", category: "Development", reward: "0", date: "2020-01-01" });
  await submit(m);
  const tree = m.render();
  assert.equal(flatText(byId(tree, "reward-error").props.children), "Enter a reward greater than 0 ZEC.");
  assert.equal(flatText(byId(tree, "date-error").props.children), "The deadline can't be in the past.");
  assert.equal(byId(tree, "reward").props["aria-invalid"], true);
  assert.equal(byId(tree, "reward").props["aria-describedby"], "reward-error");
  assert.equal(byId(tree, "date").props["aria-invalid"], true);
  assert.equal(byId(tree, "date").props["aria-describedby"], "date-error");
  assert.deepEqual(m.created, []);
});

test("modal: an empty reward and a cleared deadline are blocked too", async () => {
  const m = mountModal();
  fill(m, { title: "Fix it", description: "Details", category: "Development", date: "" });
  await submit(m);
  const tree = m.render();
  assert.equal(flatText(byId(tree, "reward-error").props.children), "Enter a reward greater than 0 ZEC.");
  assert.equal(flatText(byId(tree, "date-error").props.children), "Choose a deadline.");
  assert.deepEqual(m.created, []);
});

test("modal: changing the date clears its error", async () => {
  const m = mountModal();
  fill(m, { date: "2020-01-01" });
  await submit(m);
  assert.ok(byId(m.render(), "date-error"));
  fill(m, { date: utils.toDateInputValue(form.defaultDeadline()) });
  assert.equal(byId(m.render(), "date-error"), undefined);
});

test("modal: a valid form submits the parsed reward and the chosen deadline", async () => {
  const m = mountModal();
  fill(m, { title: "Fix it", description: "Details", category: "Development", reward: "0.055" });
  await submit(m);
  assert.equal(m.created.length, 1);
  assert.equal(m.created[0].bountyAmount, 0.055);
  assert.equal(m.created[0].reward, undefined);
  assert.equal(utils.toDateInputValue(m.created[0].timeToComplete), utils.toDateInputValue(form.defaultDeadline()));
  // The form resets to fresh defaults afterwards.
  assert.equal(byId(m.render(), "reward").props.value, "");
});

test("modal: quota pill shows 'X of Y used, resets on [date]'", () => {
  const quota = { limit: 3, used: 1, remaining: 2, resetsAt: "2026-10-19T00:00:00.000Z" };
  const tree = mountModal({ quota }).render();
  const text = flatText(quotaPill(tree).props.children);
  assert.equal(text, `Weekly limit: ${form.formatQuotaStatus(quota)}`);
  assert.match(text, /1 of 3 used, resets on /);
  assert.equal(submitButton(tree).props.disabled, false);
});

test("modal: at the weekly limit the submit button is disabled", async () => {
  const quota = { limit: 3, used: 3, remaining: 0, resetsAt: "2026-10-19T00:00:00.000Z" };
  const m = mountModal({ quota });
  const tree = m.render();
  assert.equal(submitButton(tree).props.disabled, true);
  assert.equal(flatText(submitButton(tree).props.children), "Weekly limit reached");
  assert.match(flatText(quotaPill(tree).props.children), /^Weekly limit reached: 3 of 3 used, resets on /);
  // Even a forced submit (e.g. Enter key) creates nothing.
  fill(m, { title: "Fix it", description: "Details", category: "Development", reward: "1" });
  await submit(m);
  assert.deepEqual(m.created, []);
});

test("modal: admins see no quota pill and are never blocked", () => {
  const quota = { limit: 3, used: 3, remaining: 0, resetsAt: "2026-10-19T00:00:00.000Z" };
  const tree = mountModal({ quota, role: "ADMIN" }).render();
  assert.equal(quotaPill(tree), undefined);
  assert.equal(submitButton(tree).props.disabled, false);
});
