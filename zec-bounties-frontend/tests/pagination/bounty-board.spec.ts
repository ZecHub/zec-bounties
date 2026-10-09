import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";

const user = {
  id: "pagination-hunter",
  name: "Pagination Tester",
  role: "HUNTER",
  UA_address: "fixture-only",
};

function bounty(index: number) {
  return {
    id: `pagination-${index}`,
    title: `Pagination bounty ${String(index).padStart(2, "0")}`,
    description: "Local pagination regression fixture",
    createdBy: "fixture-creator",
    createdByUser: {
      id: "fixture-creator",
      name: "Fixture Creator",
      role: "ADMIN",
    },
    bountyAmount: 0.01,
    dateCreated: new Date(Date.UTC(2026, 8, 29, 12, -index)).toISOString(),
    timeToComplete: "2099-10-06T12:00:00.000Z",
    status: "TO_DO",
    isApproved: true,
    isPaid: false,
    isPrivate: false,
    difficulty: "EASY",
    categoryId: "Web Development",
    chain: "MAIN",
  };
}

async function openBoard(page: Page, count: number) {
  const rows = Array.from({ length: count }, (_, i) => bounty(i + 1));
  const requestedPages: number[] = [];
  let socket: WebSocketRoute | undefined;

  await page.addInitScript((user) => {
    localStorage.setItem("authToken", "pagination-fixture-token");
    localStorage.setItem("currentUser", JSON.stringify(user));
    // Avoid prompting for notification permission during the test.
    localStorage.setItem("zecBountiesPushAttempted", String(Date.now()));
  }, user);

  await page.routeWebSocket("ws://localhost:9000/**", (ws) => {
    socket = ws;
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === "http://127.0.0.1:3127") return route.continue();
    // All backend traffic is local test data; never contact the live service.
    if (url.origin !== "http://localhost:9000") return route.abort();
    if (route.request().method() !== "GET") return route.abort();

    let json: unknown = [];
    if (url.pathname === "/auth/me") json = { user };
    if (url.pathname === "/api/bounties/categories") {
      json = [{ id: "Web Development", name: "Web Development" }];
    }
    if (url.pathname === "/api/bounties") {
      const pageNumber = Number(url.searchParams.get("page"));
      const limit = Number(url.searchParams.get("limit"));
      requestedPages.push(pageNumber);
      json = {
        data: rows.slice((pageNumber - 1) * limit, pageNumber * limit),
        total: rows.length,
        page: pageNumber,
        limit,
      };
    }
    await route.fulfill({ json });
  });

  await page.goto("/home");
  await expect(page.getByRole("heading", { name: "All Bounties" })).toBeVisible();
  await expect.poll(() => Boolean(socket)).toBe(true);

  // React Strict Mode may run the initial fetch twice in development.
  expect(requestedPages.every((pageNumber) => pageNumber === 1)).toBe(true);
  requestedPages.length = 0;

  return {
    rows,
    requestedPages,
    send: (type: string, payload: unknown = {}) =>
      socket!.send(JSON.stringify({ type, payload })),
  };
}

const cards = (page: Page) => page.getByText(/^Pagination bounty \d+$/);
const loadMore = (page: Page) =>
  page.locator("div.relative.group")
    .filter({ hasText: "Load more" })
    .getByRole("button");

async function scrollForMore(page: Page) {
  // Exercise the board's real IntersectionObserver, rather than replacing it.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
}

for (const total of [20, 25]) {
  test(`refresh after loading 20 still allows all ${total} bounties`, async ({ page }, testInfo) => {
    const fixture = await openBoard(page, total);
    await expect(cards(page)).toHaveCount(10);
    await scrollForMore(page);
    await expect(cards(page)).toHaveCount(20);
    await page.evaluate(() => window.scrollTo(0, 0));

    // This real event handler calls fetchBounties() with its default reset.
    fixture.send("bounty_assignees_updated");
    await expect(cards(page)).toHaveCount(10);
    await expect(loadMore(page)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("after-refresh.png") });

    await scrollForMore(page);
    await expect(cards(page)).toHaveCount(20);
    if (total > 20) {
      await scrollForMore(page);
      await expect(cards(page)).toHaveCount(total);
    }
    await expect(loadMore(page)).toHaveCount(0);
    expect(fixture.requestedPages).toEqual(
      total === 20 ? [2, 1, 2] : [2, 1, 2, 3],
    );
    expect(new Set(await cards(page).allTextContents()).size).toBe(total);
    await page.screenshot({
      path: testInfo.outputPath("all-bounties.png"),
      fullPage: true,
    });
  });
}

for (const total of [0, 5, 10]) {
  test(`${total} results stop without requesting another page`, async ({ page }) => {
    const fixture = await openBoard(page, total);
    await expect(cards(page)).toHaveCount(total);
    await expect(loadMore(page)).toHaveCount(0);
    if (total === 0) {
      await expect(page.getByText("No bounties found.")).toBeVisible();
    }
    await scrollForMore(page);
    // Give the observer several rendering frames to react to the scroll.
    await page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    expect(fixture.requestedPages).toEqual([]);
  });
}

test("a live insertion and overlapping page do not duplicate cards or hide the final page", async ({ page }) => {
  const fixture = await openBoard(page, 20);
  await expect(cards(page)).toHaveCount(10);

  const added = bounty(0);
  fixture.rows.unshift(added);
  fixture.send("new_bounties", added);
  await expect(cards(page)).toHaveCount(11);

  // Page 2 now includes bounty 10 again. It must be deduplicated, but the
  // 21 displayed/API rows must not be mistaken for 21 consumed API offsets.
  await scrollForMore(page);
  await expect(cards(page)).toHaveCount(20);
  await scrollForMore(page);
  await expect(cards(page)).toHaveCount(21);
  await expect(loadMore(page)).toHaveCount(0);
  expect(new Set(await cards(page).allTextContents()).size).toBe(21);
  expect(fixture.requestedPages).toEqual([2, 3]);
});
