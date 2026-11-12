import { test, expect, type Page } from "@playwright/test";
import { Backend, admin, hunter, APP_URL } from "../status-sync/fixtures";

// The real endpoint returns both independently paginated lists, 100 rows each.
const LIMIT = 100;
const TOTAL = 201;

function rows(kind: "Open" | "History", chain = "MAIN") {
  return Array.from({ length: TOTAL }, (_, i) => ({
    id: `${chain}-${kind}-${i + 1}`,
    title: `${chain} ${kind} ${i + 1}`,
    status: kind === "Open" ? "IN_PROGRESS" : "DONE",
    chain,
    bountyAmount: 0.01,
    isPrivate: false, isPaid: kind === "History", isApproved: true,
    dateCreated: "2026-10-01T12:00:00.000Z",
    completedAt: null, paidAt: null, teamName: null,
    relations: ["assigned"], applicationStatus: null,
  }));
}

async function openProfile(page: Page, viewer = admin) {
  const api = new Backend(1);
  await api.attach(page, viewer);
  const calls: Array<{ chain: string; openOffset: number; historyOffset: number }> = [];
  const sets = Object.fromEntries(["MAIN", "TEST"].map(chain =>
    [chain, { open: rows("Open", chain), history: rows("History", chain) }],
  ));
  await page.route("**/api/users/*/public", route => route.fulfill({ json: {
    id: "staff-fixture", name: "Staff Fixture", displayName: "Staff Fixture",
    role: "HUNTER", isAdminViewer: viewer.role === "ADMIN", visibility: {},
    memberSince: "2026-10-01T12:00:00.000Z", receivers: {},
    completed: TOTAL, created: 0, totalEarned: 2.01,
  } }));
  await page.route("**/api/users/*/staff-bounties?*", route => {
    const params = new URL(route.request().url()).searchParams;
    const chain = params.get("chain") || "MAIN";
    const openOffset = Number(params.get("openOffset")) || 0;
    const historyOffset = Number(params.get("historyOffset")) || 0;
    calls.push({ chain, openOffset, historyOffset });
    const { open, history } = sets[chain];
    return route.fulfill({ json: {
      userId: "staff-fixture", displayName: "Staff Fixture", chain,
      limit: LIMIT, bountyCount: TOTAL * 2, zecEarned: 2.01,
      statusCounts: { IN_PROGRESS: TOTAL, DONE: TOTAL },
      open: open.slice(openOffset, openOffset + LIMIT), openTotal: TOTAL,
      openNextOffset: openOffset + LIMIT < TOTAL ? openOffset + LIMIT : null,
      history: history.slice(historyOffset, historyOffset + LIMIT), historyTotal: TOTAL,
      historyNextOffset: historyOffset + LIMIT < TOTAL ? historyOffset + LIMIT : null,
    } });
  });
  await page.goto(APP_URL + "/users/staff-fixture");
  await expect(page.getByRole("heading", { name: "Staff Fixture", exact: true })).toBeVisible();
  if (viewer.role === "ADMIN") {
    await page.getByRole("button", { name: /^Staff view/ }).click();
    await expect(list(page, "Open")).toHaveCount(LIMIT);
    await expect(list(page, "History")).toHaveCount(LIMIT);
  }
  return { calls, sets };
}

const list = (page: Page, kind: string, chain = "MAIN") =>
  page.getByRole("button", { name: new RegExp(`^${chain} ${kind} \\d+( updated)?$`) });

for (const first of ["open", "history"] as const) {
  test(`alternating ${first} and the other list retains each row once`, async ({ page }) => {
    const { calls } = await openProfile(page);
    const second = first === "open" ? "history" : "open";
    await page.getByRole("button", { name: `Load more ${first}`, exact: true }).click();
    await expect(list(page, first === "open" ? "Open" : "History")).toHaveCount(200);
    await page.getByRole("button", { name: `Load more ${second}`, exact: true }).click();
    await expect(list(page, "Open")).toHaveCount(200);
    await expect(list(page, "History")).toHaveCount(200);
    await page.getByRole("button", { name: "Load more open", exact: true }).click();
    await expect(list(page, "Open")).toHaveCount(TOTAL);
    await expect(list(page, "History")).toHaveCount(200);
    await page.getByRole("button", { name: "Load more history", exact: true }).click();
    await expect(list(page, "Open")).toHaveCount(TOTAL);
    await expect(list(page, "History")).toHaveCount(TOTAL);
    await expect(page.getByRole("button", { name: /^Load more (open|history)$/ })).toHaveCount(0);
    expect(await list(page, "Open").allTextContents()).toEqual(rows("Open").map(row => row.title));
    expect(await list(page, "History").allTextContents()).toEqual(rows("History").map(row => row.title));
    expect(calls.at(-1)).toEqual({ chain: "MAIN", openOffset: 200, historyOffset: 200 });
    await page.getByRole("button", { name: "Staff view", exact: false }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath("staff-pagination.png") });
  });
}

test("a repeated page updates existing rows without duplicating them", async ({ page }) => {
  const { sets } = await openProfile(page);
  await page.getByRole("button", { name: "Load more open", exact: true }).click();
  await expect(list(page, "Open")).toHaveCount(200);
  sets.MAIN.open[100].title = "MAIN Open 101 updated";
  await page.getByRole("button", { name: "Load more history", exact: true }).click();
  await expect(list(page, "Open")).toHaveCount(200);
  await expect(page.getByRole("button", { name: "MAIN Open 101 updated", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "MAIN Open 101", exact: true })).toHaveCount(0);
});

test("switching chain starts both lists at their first page", async ({ page }) => {
  const { calls } = await openProfile(page);
  await page.getByRole("button", { name: "Load more open", exact: true }).click();
  await expect(list(page, "Open")).toHaveCount(200);
  await page.getByRole("button", { name: "Testnet", exact: true }).click();
  await expect(list(page, "Open", "TEST")).toHaveCount(LIMIT);
  await expect(list(page, "History", "TEST")).toHaveCount(LIMIT);
  await expect(list(page, "Open")).toHaveCount(0);
  await expect(list(page, "History")).toHaveCount(0);
  expect(calls.at(-1)).toEqual({ chain: "TEST", openOffset: 0, historyOffset: 0 });
});

test("ordinary hunter profile does not request the staff lists", async ({ page }) => {
  const { calls } = await openProfile(page, hunter);
  await expect(page.getByRole("button", { name: /^Staff view/ })).toHaveCount(0);
  expect(calls).toEqual([]);
});
