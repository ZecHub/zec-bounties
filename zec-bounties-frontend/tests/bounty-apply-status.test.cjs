const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function renderComponent(file, exportName, context, props = {}) {
  const components = new Proxy({}, { get: (_, name) => name });
  const filename = path.resolve(__dirname, "..", file);
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
      useState: (initial) => [
        typeof initial === "function" ? initial() : initial,
        () => {},
      ],
      useRef: (initial) => ({ current: initial }),
      useEffect: () => {},
      useMemo: (fn) => fn(),
      useCallback: (fn) => fn,
    },
    "react/jsx-runtime": {
      jsx: (type, p) => ({ type, props: p }),
      jsxs: (type, p) => ({ type, props: p }),
      Fragment: "Fragment",
    },
    "@/lib/bounty-context": { useBounty: () => context },
    "@/lib/errors": { getErrorMessage: (_err, fallback) => fallback },
    "@/lib/utils": { formatStatus: (s) => s },
    "@/lib/configENV": { discordInviteUrl: "https://discord.example" },
    "@/lib/displayName": {
      bountyCreatorName: () => "Creator",
      bountyCreatorInitial: () => "C",
      bountyCreatorAvatarSrc: () => null,
    },
    "@/lib/links": {
      MAX_LINKS: 5,
      parseLinks: () => [],
      splitLinks: () => [],
      joinLinks: () => "",
      hasInvalidLinks: () => false,
    },
    "date-fns": {
      format: () => "Jan 1, 2027",
      formatDistanceToNow: () => "in 1 day",
      isPast: () => false,
      isWithinInterval: () => false,
      addDays: (d) => d,
    },
    "next/link": { default: "a" },
    sonner: { toast: {} },
    "react-icons/rx": components,
    "./ZecToUsd": components,
  };

  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      console,
      require(id) {
        if (Object.hasOwn(dependencies, id)) return dependencies[id];
        if (id.startsWith("@/components/") || id === "lucide-react")
          return components;
        throw new Error(`Unexpected dependency: ${id}`);
      },
    },
    { filename },
  );

  return text(module.exports[exportName](props));
}

function text(node) {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (!node || typeof node === "boolean") return "";
  if (typeof node === "object") return text(node.props?.children);
  return String(node);
}

const hunter = {
  id: "hunter-1",
  name: "Hunter One",
  role: "HUNTER",
  UA_address: "u1valid",
};

function makeBounty(overrides = {}) {
  return {
    id: "b1",
    title: "Fix status check",
    description: "Ensure only TO_DO accepts applications.",
    createdBy: "admin-1",
    createdByUser: { id: "admin-1", name: "Admin", role: "ADMIN" },
    bountyAmount: 0.25,
    dateCreated: "2026-11-20T00:00:00.000Z",
    timeToComplete: "2027-01-15T00:00:00.000Z",
    status: "TO_DO",
    isApproved: true,
    isPaid: false,
    isPrivate: false,
    difficulty: "MEDIUM",
    categoryId: "Development",
    chain: "MAIN",
    assignees: [],
    ...overrides,
  };
}

function baseContext(currentUser = hunter) {
  return {
    currentUser,
    teams: [],
    favoriteTeamIds: new Set(),
    applyToBounty: async () => {},
    withdrawApplication: async () => {},
    getUserApplicationForBounty: () => null,
    getAllApplicationForBounty: () => [],
    submitWork: async () => {},
    editSubmission: async () => ({}),
    updateBounty: async () => {},
    fetchWorkSubmissions: async () => [],
  };
}

test("BountyDetailModal shows the apply form only for TO_DO and shows Applications closed otherwise", () => {
  const todoText = renderComponent(
    "components/bounty-detail-modal.tsx",
    "BountyDetailModal",
    baseContext(hunter),
    { bounty: makeBounty({ status: "TO_DO" }), open: true, onOpenChange: () => {} },
  );
  assert.ok(todoText.includes("Submit application"), todoText);
  assert.ok(!todoText.includes("Applications closed"), todoText);

  for (const status of ["IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]) {
    const rendered = renderComponent(
      "components/bounty-detail-modal.tsx",
      "BountyDetailModal",
      baseContext(hunter),
      { bounty: makeBounty({ status }), open: true, onOpenChange: () => {} },
    );
    assert.ok(!rendered.includes("Submit application"), `${status}: ${rendered}`);
    assert.ok(rendered.includes("Applications closed"), `${status}: ${rendered}`);
    assert.ok(
      rendered.includes("Only bounties in Todo accept applications."),
      `${status}: ${rendered}`,
    );
  }
});

test("BountyDetailModal does not prompt guests or missing-UA hunters to log in / set UA on non-TO_DO bounties", () => {
  const guestRendered = renderComponent(
    "components/bounty-detail-modal.tsx",
    "BountyDetailModal",
    baseContext(null),
    { bounty: makeBounty({ status: "IN_PROGRESS" }), open: true, onOpenChange: () => {} },
  );
  assert.ok(guestRendered.includes("Applications closed"), guestRendered);
  assert.ok(!guestRendered.includes("Please log in to apply"), guestRendered);

  const noUaRendered = renderComponent(
    "components/bounty-detail-modal.tsx",
    "BountyDetailModal",
    baseContext({ ...hunter, UA_address: null }),
    { bounty: makeBounty({ status: "DONE" }), open: true, onOpenChange: () => {} },
  );
  assert.ok(noUaRendered.includes("Applications closed"), noUaRendered);
  assert.ok(!noUaRendered.includes("Unified Address required"), noUaRendered);
});

test("TeamBountyDetailModal restricts applications to TO_DO status", () => {
  const todoText = renderComponent(
    "components/teams/bounty-detail-modal.tsx",
    "TeamBountyDetailModal",
    baseContext(hunter),
    { bounty: makeBounty({ status: "TO_DO" }), open: true, onOpenChange: () => {} },
  );
  assert.ok(todoText.includes("Submit Application"), todoText);

  for (const status of ["IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]) {
    const rendered = renderComponent(
      "components/teams/bounty-detail-modal.tsx",
      "TeamBountyDetailModal",
      baseContext(hunter),
      { bounty: makeBounty({ status }), open: true, onOpenChange: () => {} },
    );
    assert.ok(!rendered.includes("Submit Application"), `${status}: ${rendered}`);
    assert.ok(rendered.includes("Applications closed"), `${status}: ${rendered}`);
  }
});

test("BountyCard only advertises open applications on TO_DO bounties in list and grid modes", () => {
  const todoList = renderComponent(
    "components/bounty-card.tsx",
    "BountyCard",
    baseContext(hunter),
    { bounty: makeBounty({ status: "TO_DO" }), viewMode: "list" },
  );
  assert.ok(todoList.includes("Open for applications"), todoList);

  const closedList = renderComponent(
    "components/bounty-card.tsx",
    "BountyCard",
    baseContext(hunter),
    { bounty: makeBounty({ status: "IN_PROGRESS" }), viewMode: "list" },
  );
  assert.ok(!closedList.includes("Open for applications"), closedList);
  assert.ok(closedList.includes("Not accepting applications"), closedList);

  const todoGrid = renderComponent(
    "components/bounty-card.tsx",
    "BountyCard",
    baseContext(hunter),
    { bounty: makeBounty({ status: "TO_DO" }), viewMode: "grid" },
  );
  assert.ok(todoGrid.includes("Apply"), todoGrid);

  const closedGrid = renderComponent(
    "components/bounty-card.tsx",
    "BountyCard",
    baseContext(hunter),
    { bounty: makeBounty({ status: "CANCELLED" }), viewMode: "grid" },
  );
  assert.ok(!closedGrid.includes("Apply"), closedGrid);
  assert.ok(closedGrid.includes("Closed"), closedGrid);

  const suggestedGrid = renderComponent(
    "components/bounty-card.tsx",
    "BountyCard",
    baseContext(hunter),
    {
      bounty: makeBounty({
        status: "TO_DO",
        createdByUser: { id: "h2", name: "Suggester", role: "HUNTER" },
      }),
      viewMode: "grid",
    },
  );
  assert.ok(suggestedGrid.includes("Invite Only"), suggestedGrid);
});
