const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function transpileAndRun(relPath, mocks = {}, appendCode = "") {
  const filename = path.resolve(__dirname, "..", relPath);
  const source = fs.readFileSync(filename, "utf8");
  const result = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics, []);

  const module = { exports: {} };
  const components = new Proxy({}, {
    get: (_, name) => (props) => ({ type: name, props }),
  });

  const context = {
    module,
    exports: module.exports,
    Date,
    console,
    URLSearchParams,
    require(id) {
      if (mocks[id]) return mocks[id];
      if (id === "next/link") return (props) => ({ type: "Link", props });
      if (id.startsWith("@/components/") || id === "lucide-react") return components;
      if (id === "@/lib/types" || id === "@/lib/errors") return {};
      if (id === "@/lib/explorer") return { getExplorerUrl: () => "https://explorer" };
      if (id === "@/lib/displayName") {
        return {
          displayName: (u) => u?.nickname || u?.name || "User",
          bountyCreatorName: () => "Creator",
          bountyCreatorInitial: () => "C",
          bountyCreatorAvatarSrc: () => null,
        };
      }
      if (id === "date-fns") return { format: () => "Nov 8, 2026" };
      if (id === "sonner") return { toast: { success: () => {}, error: () => {} } };
      throw new Error(`Unexpected dependency in test: ${id}`);
    },
  };

  vm.runInNewContext(result.outputText + "\n" + appendCode, context, { filename });
  return module.exports;
}

function flattenText(node) {
  if (!node) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join(" ");
  let s = "";
  if (node.props?.children) s += flattenText(node.props.children) + " ";
  if (node.props?.label) s += String(node.props.label) + " ";
  if (node.props?.value) s += String(node.props.value) + " ";
  if (node.props?.["aria-label"]) s += String(node.props["aria-label"]) + " ";
  return s;
}

test("app/bounties/[id]: resolves winner as primaryAssignee, sorts winner first, formats handles, and hides email", () => {
  const winnerUser = {
    id: "user-winner",
    name: "Julius Oladejo",
    nickname: "ayolyn",
    email: "secret@example.com",
    UA_address: "u1winner-ua-address",
    z_address: "zwinner-z-address",
  };
  const otherUser = {
    id: "user-other",
    name: "Other Contributor",
    nickname: "othernick",
    email: "other@example.com",
    UA_address: "u1other-ua-address",
    z_address: "zother-z-address",
  };

  const bountyFixture = {
    id: "bounty-12345678-test",
    title: "Implement multi-assignee winner sorting",
    description: "Multi-assignee bounty testing",
    status: "DONE",
    assignee: "user-winner", // winner selected
    chain: "MAIN",
    bountyAmount: 5,
    assignees: [
      { userId: "user-other", user: otherUser },
      { userId: "user-winner", user: winnerUser },
    ],
  };

  // State slots for BountyDetailPage:
  // slot 0: bounty (initialized to bountyFixture)
  // slot 1: loading (initialized to false)
  // slot 2: notFound (initialized to false)
  let callCount = 0;
  const stateValues = [bountyFixture, false, false];

  const mocks = {
    react: {
      useState: (defaultVal) => {
        const val = callCount < stateValues.length ? stateValues[callCount] : defaultVal;
        callCount++;
        return [val, () => {}];
      },
      useEffect: () => {},
    },
    "react/jsx-runtime": {
      jsx: (type, props, key) => ({ type, props, key: key !== undefined ? key : props?.key }),
      jsxs: (type, props, key) => ({ type, props, key: key !== undefined ? key : props?.key }),
    },
    "next/navigation": {
      useParams: () => ({ id: "bounty-12345678-test" }),
      useRouter: () => ({ back: () => {} }),
    },
    "@/lib/bounty-context": {
      useBounty: () => ({
        fetchBountyById: async () => bountyFixture,
      }),
    },
  };

  const exp = transpileAndRun("app/bounties/[id]/page.tsx", mocks);
  const tree = exp.default();
  const allText = flattenText(tree);

  // 1. Payout address on page must show winner's UA address, NOT the other assignee's
  assert.ok(allText.includes("u1winner-ua-address"), "Expected winner UA address in rendered tree");
  assert.ok(!allText.includes("u1other-ua-address"), "Other assignee UA address should not be primary");

  // 2. Private emails must NEVER be rendered on public bounty page
  assert.ok(!allText.includes("secret@example.com"), "Public page leaked winner email");
  assert.ok(!allText.includes("other@example.com"), "Public page leaked other user email");

  // 3. User handle @ayolyn should be shown since name and nickname differ
  assert.ok(allText.includes("ayolyn"), "Expected ayolyn handle to be rendered");
});

test("components/teams/bounty-detail-modal: sorts winner first and uses assigneeLabel", () => {
  const winner = { id: "winner-id", name: "Alice Smith", nickname: "alicesmith" };
  const runnerUp = { id: "runner-id", name: "Bob Jones", nickname: "bobjones" };

  const bounty = {
    id: "bounty-team-1",
    title: "Team Bounty",
    description: "Detailed description for team bounty",
    status: "DONE",
    assignee: "winner-id",
    categoryId: "Engineering",
    difficulty: "Medium",
    bountyAmount: 2.5,
    assignees: [
      { userId: "runner-id", user: runnerUp },
      { userId: "winner-id", user: winner },
    ],
  };

  const mocks = {
    react: {
      useState: (init) => [init, () => {}],
      useEffect: () => {},
    },
    "react/jsx-runtime": {
      jsx: (type, props, key) => ({ type, props, key: key !== undefined ? key : props?.key }),
      jsxs: (type, props, key) => ({ type, props, key: key !== undefined ? key : props?.key }),
    },
    "@/lib/bounty-context": {
      useBounty: () => ({
        currentUser: { id: "viewer-id" },
        applyToBounty: async () => {},
        getUserApplicationForBounty: () => null,
        fetchWorkSubmissions: async () => [],
        submitWork: async () => {},
      }),
    },
  };

  const exp = transpileAndRun("components/teams/bounty-detail-modal.tsx", mocks);
  const tree = exp.TeamBountyDetailModal({
    bounty,
    open: true,
    onOpenChange: () => {},
  });

  function collectAssigneeCards(node) {
    const cards = [];
    function walk(n) {
      if (!n || typeof n !== "object") return;
      if (Array.isArray(n)) return n.forEach(walk);
      if (n.props?.className?.includes("p-2.5 rounded-lg border")) {
        cards.push(n);
      }
      if (n.props?.children) walk(n.props.children);
    }
    walk(node);
    return cards;
  }

  const cards = collectAssigneeCards(tree);
  assert.equal(cards.length, 2);

  // Winner must be sorted first!
  assert.equal(cards[0].key, "winner-id");
  assert.equal(cards[1].key, "runner-id");

  assert.ok(flattenText(cards[0]).includes("Alice Smith (@alicesmith)"));
  assert.ok(flattenText(cards[0]).includes("Selected"));
  assert.ok(flattenText(cards[1]).includes("Bob Jones (@bobjones)"));
});

test("components/admin/select-winner-modal: formats assignee names with handles when they differ", () => {
  const userA = { id: "user-a", name: "David Miller", nickname: "dmiller" };
  const userB = { id: "user-b", name: "Eve", nickname: null };

  const mocks = {
    react: {
      useState: (init) => [init, () => {}],
    },
    "react/jsx-runtime": {
      jsx: (type, props, key) => ({ type, props, key: key !== undefined ? key : props?.key }),
      jsxs: (type, props, key) => ({ type, props, key: key !== undefined ? key : props?.key }),
    },
  };

  const exp = transpileAndRun("components/admin/select-winner-modal.tsx", mocks);
  const tree = exp.SelectWinnerModal({
    bounty: {
      id: "bounty-1",
      assignees: [
        { userId: "user-a", user: userA },
        { userId: "user-b", user: userB },
      ],
    },
    open: true,
    onOpenChange: () => {},
    onConfirm: async () => {},
  });

  const allText = flattenText(tree);
  assert.ok(allText.includes("David Miller (@dmiller)"), "Expected David Miller (@dmiller)");
  assert.ok(allText.includes("Eve"), "Expected Eve");
});
