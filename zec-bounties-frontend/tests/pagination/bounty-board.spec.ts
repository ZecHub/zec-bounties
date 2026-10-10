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

async function openBoard(
  page: Page,
  count: number,
  options: {
    rows?: ReturnType<typeof bounty>[];
    teams?: Array<{ id: string; name: string }>;
    path?: string;
  } = {},
) {
  const rows = options.rows ?? Array.from({ length: count }, (_, i) => bounty(i + 1));
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
    if (url.pathname === "/api/teams/public") {
      json = options.teams ?? [];
    }
    if (url.pathname === "/api/notifications") {
      json = { notifications: [], unreadCount: 0 };
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

  await page.goto(options.path ?? "/home");
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

test("combines shareable bounty filters and keeps them when reopened on mobile", async ({ page }) => {
  const rows = Array.from({ length: 10 }, (_, index) => {
    const row = bounty(index + 1);
    return {
      ...row,
      title: `Pagination bounty ${String(index + 1).padStart(2, "0")}`,
      bountyAmount: index === 0 ? 0.25 : index === 1 ? 4 : 0.25,
      dateCreated: new Date(Date.UTC(2026, 8, index + 1, 12)).toISOString(),
      timeToComplete: new Date(
        Date.UTC(2026, 9, index === 0 ? 7 : 20),
      ).toISOString(),
      status:
        index === 2
          ? "IN_PROGRESS"
          : index === 3
            ? "IN_REVIEW"
            : "TO_DO",
      teamId: index === 4 ? "team-b" : "team-a",
      team: {
        id: index === 4 ? "team-b" : "team-a",
        name: index === 4 ? "Beta Team" : "Alpha Team",
      },
      targetRepo: index === 0 || index === 9 ? "namada" : null,
      description:
        index === 0 || index === 9 ? "A shielded wallet task" : "Other work",
    };
  });
  const fixture = await openBoard(page, rows.length, {
    rows,
    teams: [
      { id: "team-a", name: "Alpha Team" },
      { id: "team-b", name: "Beta Team" },
    ],
  });

  const status = page.getByRole("combobox", { name: "Status" });
  await status.selectOption("assigned");
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByText("Pagination bounty 03", { exact: true })).toBeVisible();
  await status.selectOption("in_review");
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByText("Pagination bounty 04", { exact: true })).toBeVisible();
  await status.selectOption("open");

  await page.getByRole("combobox", { name: "Team" }).selectOption("team-a");
  await page.getByRole("button", { name: /^Web Development/ }).click();
  await page.getByRole("spinbutton", { name: "Minimum reward" }).fill("0.2");
  await page.getByRole("spinbutton", { name: "Maximum reward" }).fill("0.5");
  await page.getByLabel("Deadline on or before").fill("2026-10-07");
  await page.getByRole("combobox", { name: "Status" }).selectOption("open");
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.getByPlaceholder("Search bounties...").last().fill("wallet alpha");
  await page.getByRole("tab", { name: /Namada/ }).click();

  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByText("Pagination bounty 01", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/team=team-a/);
  await expect(page).toHaveURL(/min=0.2/);
  await expect(page).toHaveURL(/max=0.5/);
  await expect(page).toHaveURL(/due=2026-10-07/);
  await expect(page).toHaveURL(/status=open/);
  await expect(page).toHaveURL(/q=wallet\+alpha/);
  await expect(page).toHaveURL(/repo=namada/);
  await expect(page).toHaveURL(/category=Web\+Development/);
  expect(fixture.requestedPages).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("combobox", { name: "Sort bounties" })).toBeVisible();
  const sharedUrl = page.url();
  await page.goto(sharedUrl);
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByRole("combobox", { name: "Team" })).toHaveValue("team-a");
  await expect(page.getByRole("combobox", { name: "Status" })).toHaveValue("open");
  await expect(page.getByRole("spinbutton", { name: "Minimum reward" })).toHaveValue("0.2");

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(cards(page)).toHaveCount(10);
  await expect(page).toHaveURL("http://127.0.0.1:3127/home");
});

test("sorts the full bounty set by reward and deadline", async ({ page }) => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    ...bounty(index + 1),
    title: `Pagination bounty ${String(index + 1).padStart(2, "0")}`,
    bountyAmount: 12 - index,
    timeToComplete: new Date(
      Date.UTC(2026, 9, 20 - index),
    ).toISOString(),
  }));
  await openBoard(page, rows.length, {
    rows,
    path: "/home?sort=highest_reward",
  });

  await expect(cards(page)).toHaveCount(rows.length);
  await expect(cards(page).first()).toHaveText("Pagination bounty 01");
  await expect(page).toHaveURL(/sort=highest_reward/);
  await page.getByRole("combobox", { name: "Sort bounties" }).selectOption("soonest_deadline");
  await expect(cards(page).first()).toHaveText("Pagination bounty 12");
  await expect(page).toHaveURL(/sort=soonest_deadline/);
});

for (const total of [20, 25]) {
  test(`refresh after loading 20 still allows all ${total} bounties`, async ({ page }, testInfo) => {
    const fixture = await openBoard(page, total);
    await expect(cards(page)).toHaveCount(10);
    await scrollForMore(page);
    await expect(cards(page)).toHaveCount(20);
    await page.evaluate(() => window.scrollTo(0, 0));

    // A user update refreshes the board through fetchBounties() with a reset.
    fixture.send("user_updated", { id: user.id });
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
