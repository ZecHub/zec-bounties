const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function findAll(node, pred, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) findAll(item, pred, out);
    return out;
  }
  if (pred(node)) out.push(node);
  if (node.props && node.props.children) findAll(node.props.children, pred, out);
  return out;
}

function loadHeroCarousel({ taskCreationBlocked = false } = {}) {
  const filename = path.resolve(__dirname, "../components/hero-carousel.tsx");
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
  const components = new Proxy({}, { get: (_, name) => name });
  const dependencies = {
    react: {
      useCallback: (fn) => fn,
      useEffect: () => {},
      useRef: (init) => ({ current: init }),
      useState: (init) => [init, () => {}],
    },
    "react/jsx-runtime": {
      Fragment: "Fragment",
      jsx: (type, props, key) => ({ type, props, key }),
      jsxs: (type, props, key) => ({ type, props, key }),
    },
    "next/link": { default: "Link" },
    "next/navigation": { useRouter: () => ({ push: () => {} }) },
    "react-icons/rx": components,
    "@/lib/configENV": { discordInviteUrl: "https://discord.gg/example" },
    "@/hooks/use-task-creation-blocked": {
      useTaskCreationBlocked: () => taskCreationBlocked,
    },
  };

  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      require(id) {
        if (Object.hasOwn(dependencies, id)) return dependencies[id];
        if (id.startsWith("@/components/") || id === "lucide-react") return components;
        throw new Error(`Unexpected dependency: ${id}`);
      },
    },
    { filename },
  );

  return module.exports;
}

test("getSwipeThreshold and getSwipeDirection fall back safely when container width is zero", () => {
  const mod = loadHeroCarousel();
  assert.equal(mod.getSwipeThreshold(0), 120);
  assert.equal(mod.getSwipeThreshold(-50), 120);
  assert.equal(mod.getSwipeThreshold(200), 70);
  assert.equal(mod.getSwipeThreshold(1000), 120);

  assert.equal(mod.getSwipeDirection(0, 0), null);
  assert.equal(mod.getSwipeDirection(-50, 0), null);
  assert.equal(mod.getSwipeDirection(-120, 0), "next");
  assert.equal(mod.getSwipeDirection(70, 200), "prev");
});

test("HeroCarousel disables blocked New bounty CTA, guards click handler, and sets aria-current on active dot", () => {
  let newBountyCalls = 0;
  const mod = loadHeroCarousel({ taskCreationBlocked: true });
  const tree = mod.HeroCarousel({
    onNewBounty: () => {
      newBountyCalls += 1;
    },
  });

  const actionButtons = findAll(tree, (n) => n.type === "Button" && typeof n.props.onClick === "function");
  assert.equal(actionButtons.length, 1);
  assert.equal(actionButtons[0].props.disabled, true);
  actionButtons[0].props.onClick();
  assert.equal(newBountyCalls, 0);

  const dots = findAll(
    tree,
    (n) => n.type === "button" && typeof n.props["aria-label"] === "string" && n.props["aria-label"].startsWith("Go to slide"),
  );
  assert.equal(dots.length, 4);
  assert.equal(dots[0].props["aria-current"], "true");
  assert.equal(dots[1].props["aria-current"], undefined);
});
