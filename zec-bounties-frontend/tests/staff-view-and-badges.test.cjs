const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function loadTs(relative, requireFixture, globals = {}) {
  const filename = path.resolve(__dirname, "..", relative);
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, []);
  const module = { exports: {} };
  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      require: requireFixture,
      Date,
      console,
      URLSearchParams,
      window: { addEventListener() {}, removeEventListener() {} },
      ...globals,
    },
    { filename },
  );
  return module.exports;
}

function textOf(node) {
  if (Array.isArray(node)) return node.map(textOf).filter(Boolean).join(" ");
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "object") return textOf(node.props?.children);
  return String(node);
}

function find(predicate, node) {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map((child) => find(predicate, child)).find(Boolean);
  if (predicate(node)) return node;
  return find(predicate, node.props?.children ?? null);
}

function findAll(predicate, node, acc = []) {
  if (!node || typeof node !== "object") return acc;
  if (Array.isArray(node)) {
    for (const child of node) findAll(predicate, child, acc);
    return acc;
  }
  if (predicate(node)) acc.push(node);
  findAll(predicate, node.props?.children ?? null, acc);
  return acc;
}

test("StaffViewCard: badge edit Link is not nested inside the header toggle button and sections show total counts and None fallback", () => {
  const state = [];
  let cursor = 0;
  const components = new Proxy({}, { get: (_, name) => name });
  const exports = loadTs("components/profile/staff-view-card.tsx", (id) => {
    if (id === "react") {
      return {
        useState(initial) {
          const i = cursor++;
          if (!(i in state)) state[i] = initial;
          return [state[i], (v) => { state[i] = typeof v === "function" ? v(state[i]) : v; }];
        },
        useEffect() {},
      };
    }
    if (id === "react/jsx-runtime") {
      const jsx = (type, props) => ({ type, props });
      return { jsx, jsxs: jsx, Fragment: "Fragment" };
    }
    if (id === "next/link") return { __esModule: true, default: "Link" };
    if (id === "@/hooks/use-toast") return { useToast: () => ({ toast() {} }) };
    if (id === "@/lib/utils") return { fmt: (n) => Number(n).toFixed(2) };
    if (id === "@/lib/bounty-context") {
      return {
        useBounty: () => ({
          fetchBountyById: async () => null,
          users: [],
          setUserTaskAccess: async () => {},
        }),
      };
    }
    if (id === "@/components/admin/edit-bounty-modal") return { EditBountyModal: "EditBountyModal" };
    if (id.startsWith("@/components/ui/") || id === "lucide-react") return components;
    throw new Error(`Unexpected StaffViewCard dependency: ${id}`);
  });

  const data = {
    userId: "user-42",
    name: "Sam Doe",
    nickname: "sam",
    displayName: "Sam Doe",
    chain: "MAIN",
    limit: 100,
    bountyCount: 150,
    zecEarned: 2.5,
    zecCompleted: 3.0,
    statusCounts: { TO_DO: 0, IN_PROGRESS: 0, IN_REVIEW: 0, DONE: 150, CANCELLED: 0 },
    open: [],
    openTotal: 0,
    openNextOffset: null,
    history: [
      {
        id: "b1",
        title: "Personal task",
        status: "DONE",
        chain: "MAIN",
        bountyAmount: 2.5,
        isPrivate: false,
        isPaid: true,
        isApproved: true,
        dateCreated: "2026-10-01T00:00:00Z",
        completedAt: "2026-10-02T00:00:00Z",
        paidAt: "2026-10-03T00:00:00Z",
        teamName: null,
        relations: ["assigned"],
        applicationStatus: null,
      },
    ],
    historyTotal: 150,
    historyNextOffset: 100,
  };

  const render = () => {
    cursor = 0;
    return exports.StaffViewCard({ chain: "MAIN", loading: false, error: null, data });
  };

  let tree = render();
  const toggleBtn = find((n) => n.type === "button" && n.props?.["aria-expanded"] !== undefined, tree);
  assert.ok(toggleBtn, "header toggle button should exist");
  // Link must NOT be a descendant of the toggle <button>
  const nestedLink = find((n) => n.type === "Link", toggleBtn);
  assert.equal(nestedLink, undefined, "Link must not be nested inside <button>");

  const siblingLink = find((n) => n.type === "Link" && n.props?.href === "/admin/kpis?editBadges=user-42", tree);
  assert.ok(siblingLink, "badge edit Link should be rendered in the header");

  // Expand the StaffViewCard
  toggleBtn.props.onClick();
  tree = render();
  const renderedText = textOf(tree).replace(/\s+/g, " ");
  assert.ok(renderedText.includes("Open ( 0 )"), "Open section should show count");
  assert.ok(renderedText.includes("None"), "Empty Open section should show None placeholder");
  assert.ok(renderedText.includes("History ( 1 of 150 )"), "History section should show loaded of total count");
});

test("TeamsEditBountyModal: shows Name (@nickname) when they differ and matches search by either", () => {
  const state = [];
  const effects = [];
  const NODEPS = Symbol("nodeps");
  let cursor = 0;
  let effectCursor = 0;
  const components = new Proxy({}, { get: (_, name) => name });
  const exports = loadTs("components/teams/edit-bounty-modal.tsx", (id) => {
    if (id === "react") {
      return {
        useState(initial) {
          const i = cursor++;
          if (!(i in state)) state[i] = initial;
          return [state[i], (v) => { state[i] = typeof v === "function" ? v(state[i]) : v; }];
        },
        useEffect(fn, deps) {
          const i = effectCursor++;
          const rec = effects[i] || (effects[i] = { deps: NODEPS });
          rec.fn = fn;
          rec.nextDeps = deps;
        },
        useMemo(fn) { return fn(); },
      };
    }
    if (id === "react/jsx-runtime") {
      const jsx = (type, props) => ({ type, props });
      return { jsx, jsxs: jsx, Fragment: "Fragment" };
    }
    if (id === "@/lib/displayName") return { displayName: (u) => u.nickname || u.name || "User" };
    if (id === "@/lib/configENV") return { IS_DEV: false };
    if (id === "@/lib/bounty-context") {
      return {
        useBounty: () => ({
          updateBounty: async () => {},
          fetchTeamDirectory: () => ({
            then(resolve) {
              resolve([
                { id: "u1", name: "Alice Wonder", nickname: "alice_w", hasUnifiedAddress: true },
              ]);
              return this;
            },
            finally(fn) { fn(); return this; },
          }),
        }),
      };
    }
    if (id.startsWith("@/components/ui/") || id === "lucide-react") return components;
    throw new Error(`Unexpected TeamsEditBountyModal dependency: ${id}`);
  });

  const bounty = {
    id: "b1",
    title: "Team task",
    description: "Desc",
    bountyAmount: 1,
    timeToComplete: "2099-01-01T00:00:00.000Z",
    teamId: "team-1",
    status: "TO_DO",
    chain: "MAIN",
    assignees: [{ userId: "u1", user: { id: "u1", name: "Alice Wonder", nickname: "alice_w" } }],
  };

  function render() {
    let tree;
    for (let pass = 0; pass < 10; pass++) {
      cursor = 0;
      effectCursor = 0;
      tree = exports.TeamsEditBountyModal({
        bounty,
        open: true,
        onOpenChange() {},
        defaultSection: "assignees",
      });
      let ran = false;
      for (const rec of effects) {
        const next = rec.nextDeps;
        const prev = rec.deps;
        const changed =
          prev === NODEPS || !next || !prev || next.length !== prev.length || next.some((x, j) => !Object.is(x, prev[j]));
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

  let tree = render();
  assert.ok(textOf(tree).includes("Alice Wonder (@alice_w)"), "should render Name (@nickname)");

  // Searching by real name ("Alice Wonder") must still find the user even though displayName() returns nickname
  const searchInput = find((n) => n.type === "Input" && n.props?.placeholder?.includes("Search"), tree);
  searchInput.props.onChange({ target: { value: "Alice Wonder" } });
  tree = render();
  assert.ok(!textOf(tree).includes("No community members found"), "search by real name should match user");
});

test("KpisDashboard: ?editBadges=<userId> requests all=true so users outside top 25 open in the badge modal", async () => {
  const state = [];
  const effects = [];
  const NODEPS = Symbol("nodeps");
  let cursor = 0;
  let effectCursor = 0;
  const fetchedUrls = [];
  let replacedUrl = null;
  const searchParams = new URLSearchParams("editBadges=non-top-user");
  const components = new Proxy({}, { get: (_, name) => name });

  const exports = loadTs(
    "app/admin/kpis/page.tsx",
    (id) => {
      if (id === "react") {
        return {
          useState(initial) {
            const i = cursor++;
            if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
            return [state[i], (v) => { state[i] = typeof v === "function" ? v(state[i]) : v; }];
          },
          useMemo(fn) { return fn(); },
          useRef(val) { return { current: val }; },
          useEffect(fn, deps) {
            const i = effectCursor++;
            const rec = effects[i] || (effects[i] = { deps: NODEPS });
            rec.fn = fn;
            rec.nextDeps = deps;
          },
        };
      }
      if (id === "react/jsx-runtime") {
        const jsx = (type, props) => ({ type, props });
        return { jsx, jsxs: jsx, Fragment: "Fragment" };
      }
      if (id === "next/navigation") {
        return {
          useSearchParams: () => searchParams,
          useRouter: () => ({
            replace(url) {
              replacedUrl = url;
            },
          }),
        };
      }
      if (id === "next/link") return { __esModule: true, default: "Link" };
      if (id === "sonner") return { toast: { success() {}, error() {} } };
      if (id === "@/lib/bounty-context") {
        return {
          useBounty: () => ({
            currentUser: { id: "admin-1", role: "ADMIN" },
            balance: null,
            syncStatus: null,
            fetchBalance: async () => {},
            rescanWallet: async () => {},
            zcashParams: [],
            teams: [],
            setDefaultWallet: async () => {},
          }),
        };
      }
      if (id === "@/lib/badges") {
        return {
          getBadgeTooltip: () => "",
          matchesBadgeFilter: () => true,
          STAR_KEYS: ["1-task", "5-tasks", "10-tasks", "15-tasks", "25-tasks", "50-tasks"],
        };
      }
      if (id === "@/lib/decodeAddress") {
        return {
          initAddressDecoder: async () => {},
          getAddressReceivers: () => ({ type: "UA only", ironwood: true, sapling: true, transparent: false }),
        };
      }
      if (id === "@/lib/utils") {
        return {
          confirmedTotal: () => 0,
          fmt: (n) => Number(n).toFixed(4),
          cn: (...args) => args.filter(Boolean).join(" "),
        };
      }
      if (id === "@/lib/configENV") return { backendUrl: "http://localhost:4000" };
      if (id === "@/lib/profileHref") return { profileHref: (u) => `/users/${u.id}` };
      if (id === "@/components/address/ua-receiver-icons") {
        return {
          UaReceiverIcons: "UaReceiverIcons",
          UaFilterChips: "UaFilterChips",
          matchesReceiverFilter: () => true,
        };
      }
      if (
        id.startsWith("@/components/") ||
        id === "lucide-react" ||
        id === "recharts"
      ) {
        return components;
      }
      throw new Error(`Unexpected KpisDashboard dependency: ${id}`);
    },
    {
      localStorage: { getItem: () => "token" },
      sessionStorage: { getItem: () => null, setItem() {} },
      document: { addEventListener() {}, removeEventListener() {} },
      fetch: async (url) => {
        fetchedUrls.push(String(url));
        if (String(url).includes("/api/kpis/top-contributors")) {
          const hasAll = String(url).includes("all=true");
          return {
            ok: true,
            json: async () =>
              hasAll
                ? [{ id: "non-top-user", name: "New User", nickname: "newbie", completed: 0, submitted: 0, totalEarned: 0, badges: ["verified"] }]
                : [],
          };
        }
        return { ok: true, json: async () => [] };
      },
    },
  );

  async function renderAndFlush() {
    let tree;
    for (let pass = 0; pass < 10; pass++) {
      cursor = 0;
      effectCursor = 0;
      tree = exports.default();
      let ran = false;
      for (const rec of effects) {
        const next = rec.nextDeps;
        const prev = rec.deps;
        const changed =
          prev === NODEPS || !next || !prev || next.length !== prev.length || next.some((x, j) => !Object.is(x, prev[j]));
        if (changed) {
          if (typeof rec.cleanup === "function") rec.cleanup();
          rec.cleanup = rec.fn();
          rec.deps = next;
          ran = true;
        }
      }
      await new Promise((r) => setTimeout(r, 10));
      if (!ran) break;
    }
    return tree;
  }

  const tree = await renderAndFlush();
  const topContributorsCall = fetchedUrls.find((u) => u.includes("/api/kpis/top-contributors"));
  assert.ok(topContributorsCall?.includes("all=true"), `Expected all=true in ${topContributorsCall}`);
  assert.equal(replacedUrl, "/admin/kpis", "editBadges param should be scrubbed cleanly without trailing '?'");
  const rendered = textOf(tree);
  assert.ok(rendered.includes("Manage User Badges"), "Badge modal should open for non-top-25 user");
  assert.ok(rendered.includes("New User (@newbie)"), "Badge modal should display Name (@nickname)");
});
