import { test, expect, type Page, type Route } from "@playwright/test";

const user = { id: "leaderboard-fixture", name: "Local Hunter", role: "HUNTER" };

function rows(earned: number) {
  return [{ ...user, rank: 1, nickname: "LocalHunter", earned, points: earned, completed: 1 }];
}

async function openLeaderboard(page: Page) {
  const pending = new Map<string, Route>();
  await page.addInitScript((user) => {
    localStorage.setItem("authToken", "local-fixture-token");
    localStorage.setItem("currentUser", JSON.stringify(user));
    localStorage.setItem("zecBountiesPushAttempted", String(Date.now()));
  }, user);
  await page.routeWebSocket("ws://localhost:9000/**", () => {});
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === "http://127.0.0.1:3127") return route.continue();
    if (url.origin !== "http://localhost:9000") return route.abort();
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204 });
    if (route.request().method() !== "GET") return route.abort();
    if (url.pathname === "/api/leaderboard") {
      const range = url.searchParams.get("timeRange")!;
      if (range !== "all") { pending.set(range, route); return; }
      return route.fulfill({ json: rows(111) });
    }
    let json: unknown = [];
    if (url.pathname === "/auth/me") json = { user };
    if (url.pathname === "/api/notifications") json = { notifications: [], unreadCount: 0 };
    if (url.pathname === "/api/bounties") json = { data: [], total: 0, page: 1, limit: 10 };
    return route.fulfill({ json });
  });
  await page.goto("/leaderboard");
  await expect(page.getByText("111 ZEC", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Last 30 Days" }).click();
  await expect.poll(() => pending.has("30d")).toBe(true);
  await page.getByRole("button", { name: "Last 90 Days" }).click();
  await expect.poll(() => pending.has("90d")).toBe(true);

  async function finish(range: string, status: number, earned: number) {
    const response = page.waitForResponse((r) =>
      r.url().includes("/api/leaderboard?") && new URL(r.url()).searchParams.get("timeRange") === range,
    );
    await pending.get(range)!.fulfill({ status, json: status === 200 ? rows(earned) : { error: "fixture failure" } });
    await (await response).finished();
    // Let the fetch continuation and React render run before checking a stale result.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  }
  return { finish };
}

for (const staleStatus of [200, 500]) {
  test(`late ${staleStatus} from a previous range cannot replace current results`, async ({ page }) => {
    const { finish } = await openLeaderboard(page);
    await finish("90d", 200, 999);
    await expect(page.getByText("999 ZEC", { exact: true }).first()).toBeVisible();
    await finish("30d", staleStatus, 333);
    await expect(page.getByText("999 ZEC", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("333 ZEC", { exact: true })).toHaveCount(0);
  });

  test(`earlier ${staleStatus} cannot clear loading for the selected range`, async ({ page }) => {
    const { finish } = await openLeaderboard(page);
    await finish("30d", staleStatus, 333);
    await expect(page.getByText("Loading leaderboard…", { exact: true })).toBeVisible();
    await finish("90d", 200, 999);
    await expect(page.getByText("999 ZEC", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Loading leaderboard…", { exact: true })).toHaveCount(0);
  });
}

test("the selected range still handles its own failure", async ({ page }) => {
  const { finish } = await openLeaderboard(page);
  await finish("30d", 200, 333);
  await finish("90d", 500, 999);
  await expect(page.getByText(/No completed bounties yet/)).toBeVisible();
  await expect(page.getByText("Loading leaderboard…", { exact: true })).toHaveCount(0);
});
