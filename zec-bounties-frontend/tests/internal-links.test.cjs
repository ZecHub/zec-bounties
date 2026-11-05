const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Every fixed internal link written in the app (href="/...", href={"/..."},
// router.push("/...")) must reach a page or a public file. A fixed path that
// only matches a dynamic segment, such as /teams/[teamId], is a broken link:
// that page looks the segment up as an id and shows "not found".
const root = path.resolve(__dirname, "..");
const appDir = path.join(root, "app");
const publicDir = path.join(root, "public");

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const LINK = /(?:href=\{?|\.(?:push|replace)\()\s*["'](\/[^"'\s]*)["']/g;

function internalLinks() {
  const links = [];
  for (const file of [...sourceFiles(appDir), ...sourceFiles(path.join(root, "components"))]) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(LINK)) {
      const line = text.slice(0, match.index).split("\n").length;
      links.push({ href: match[1], where: `${path.relative(root, file)}:${line}` });
    }
  }
  return links;
}

function resolves(href) {
  const pathname = href.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (pathname.startsWith("//")) return true; // protocol-relative, not ours
  if (fs.existsSync(path.join(publicDir, pathname)) &&
      fs.statSync(path.join(publicDir, pathname)).isFile()) return true;
  // Route groups such as (marketing) are not part of the URL.
  const segments = pathname.split("/").filter(Boolean);
  const search = (dir, rest) => {
    if (rest.length === 0) {
      return ["page.tsx", "page.ts", "route.ts"].some((f) => fs.existsSync(path.join(dir, f)));
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
    return entries.some((e) =>
      (e.name === rest[0] && search(path.join(dir, e.name), rest.slice(1))) ||
      (/^\(.+\)$/.test(e.name) && search(path.join(dir, e.name), rest)),
    );
  };
  return search(appDir, segments);
}

test("the scan finds the app's internal links", () => {
  const hrefs = internalLinks().map((l) => l.href);
  assert.ok(hrefs.includes("/my-bounties"));
  assert.ok(hrefs.includes("/teams/profile"));
});

test("every fixed internal link reaches a page or a public file", () => {
  const broken = internalLinks().filter((link) => !resolves(link.href));
  assert.deepEqual(broken.map((l) => `${l.href} (${l.where})`), []);
});
