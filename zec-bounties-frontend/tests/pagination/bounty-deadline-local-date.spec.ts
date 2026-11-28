import { expect, test } from "@playwright/test";

const user = {
  id: "deadline-fixture",
  name: "Deadline Fixture",
  role: "HUNTER",
  canCreateTasks: true,
  UA_address: "fixture-only",
};

for (const example of [
  { timezoneId: "America/Los_Angeles", now: "2026-11-28T02:15:00Z", today: "2026-11-27", yesterday: "2026-11-26" },
  { timezoneId: "Asia/Shanghai", now: "2026-11-27T18:15:00Z", today: "2026-11-28", yesterday: "2026-11-27" },
]) {
  test.describe(example.timezoneId, () => {
    test.use({ timezoneId: example.timezoneId });

    test("uses the local date for the deadline input minimum", async ({ page }) => {
      await page.clock.setFixedTime(new Date(example.now));
      await page.addInitScript((fixture) => {
        localStorage.setItem("authToken", "deadline-fixture-token");
        localStorage.setItem("currentUser", JSON.stringify(fixture));
        localStorage.setItem("zecBountiesPushAttempted", String(Date.now()));
      }, user);
      await page.routeWebSocket("ws://localhost:9000/**", () => {});
      await page.routeWebSocket("ws://localhost:9001/**", () => {});
      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin === "http://127.0.0.1:3127") return route.continue();
        if (!["http://localhost:9000", "http://localhost:9001"].includes(url.origin)) return route.abort();
        if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204 });
        if (route.request().method() !== "GET") return route.abort();

        let json: unknown = [];
        if (url.pathname === "/auth/me") json = { user };
        if (url.pathname === "/api/bounties") json = { data: [], total: 0, page: 1, limit: 50 };
        if (url.pathname === "/api/notifications") json = { notifications: [], unreadCount: 0 };
        await route.fulfill({ json });
      });

      await page.goto("/home");
      await page.getByRole("button", { name: "New Bounty", exact: true }).first().click();
      const deadline = page.getByRole("dialog").getByLabel("Time to Complete");
      await expect(deadline).toHaveValue(example.today);
      await expect(deadline).toHaveAttribute("min", example.today);

      expect(await deadline.evaluate((input: HTMLInputElement) => input.validity.rangeUnderflow)).toBe(false);
      await deadline.fill(example.yesterday);
      expect(await deadline.evaluate((input: HTMLInputElement) => input.validity.rangeUnderflow)).toBe(true);
    });
  });
}
