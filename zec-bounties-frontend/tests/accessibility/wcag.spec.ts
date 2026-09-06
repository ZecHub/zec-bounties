import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function checkAccessibility(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags([
      "wcag2a",
      "wcag2aa",
      "wcag21a",
      "wcag21aa",
      "wcag22aa",
    ])
    .analyze();

  const blockingViolations = results.violations.filter(
    (violation) =>
      violation.impact === "critical" ||
      violation.impact === "serious"
  );

  if (blockingViolations.length > 0) {
    console.log(
      JSON.stringify(
        blockingViolations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          help: violation.help,
          description: violation.description,
          nodes: violation.nodes.map((node) => ({
            target: node.target,
            failureSummary: node.failureSummary,
          })),
        })),
        null,
        2
      )
    );
  }

  expect(blockingViolations).toEqual([]);
}

const routes = [
  "/",
  "/home",
  "/explore",
  "/login",
  "/docs",
  "/leaderboard",
];

for (const route of routes) {
  test(`${route} has no critical or serious accessibility violations`, async ({
    page,
  }) => {
    await page.goto(route);
    await page.waitForLoadState("domcontentloaded");

    await checkAccessibility(page);
  });
}
