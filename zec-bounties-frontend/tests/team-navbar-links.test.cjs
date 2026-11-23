const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const frontendRoot = path.resolve(__dirname, "..");
const teamNavbarPath = path.join(
  frontendRoot,
  "components",
  "layout",
  "teams",
  "navbar.tsx",
);
const teamNavbarSource = fs.readFileSync(teamNavbarPath, "utf8");

function extractStaticInternalHrefs(source) {
  const matches = [];
  const regex = /href="(\/[^"]*)"/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

test("TeamNavbar has no dead /teams/bounties link", () => {
  assert.equal(
    teamNavbarSource.includes('href="/teams/bounties"'),
    false,
    "TeamNavbar must not link to /teams/bounties (captured by /teams/[teamId])",
  );
});

test("TeamNavbar links to /my-bounties in both desktop and mobile menus", () => {
  const hrefs = extractStaticInternalHrefs(teamNavbarSource);
  const myBountiesCount = hrefs.filter((href) => href === "/my-bounties").length;
  assert.equal(
    myBountiesCount,
    2,
    `Expected /my-bounties in both desktop and mobile navs, found ${myBountiesCount}`,
  );
});

test("every static internal Link href in TeamNavbar resolves to an actual app route", () => {
  const hrefs = [...new Set(extractStaticInternalHrefs(teamNavbarSource))];
  assert.ok(hrefs.length > 0, "Expected at least one static internal Link href");

  for (const href of hrefs) {
    const cleanPath = href.split("?")[0].split("#")[0];
    const segments = cleanPath.replace(/^\/+/, "").split("/").filter(Boolean);
    const pageFile = path.join(frontendRoot, "app", ...segments, "page.tsx");
    assert.equal(
      fs.existsSync(pageFile),
      true,
      `Static Link href="${href}" does not have a matching route file at ${path.relative(frontendRoot, pageFile)}`,
    );
  }
});
