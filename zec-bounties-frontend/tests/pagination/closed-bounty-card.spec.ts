import { expect, test } from "@playwright/test";

const user = { id: "card-viewer", name: "Card Viewer", role: "HUNTER", UA_address: "fixture-only" };
const rows = [
  { id: "done-fixture", title: "Completed example", status: "DONE" },
  { id: "cancelled-fixture", title: "Cancelled example", status: "CANCELLED" },
  { id: "open-fixture", title: "Open overdue example", status: "TO_DO" },
].map((row) => ({
  ...row,
  description: "Local card status regression fixture",
  createdBy: "fixture-creator",
  createdByUser: { id: "fixture-creator", name: "Fixture Creator", role: "ADMIN" },
  bountyAmount: 0.063,
  dateCreated: "2026-11-20T00:00:00Z",
  timeToComplete: "2026-11-25T00:00:00Z",
  isApproved: true,
  isPaid: false,
  isPrivate: false,
  difficulty: "EASY",
  categoryId: "Web Development",
  chain: "MAIN",
}));

test("shows the terminal state rather than overdue on completed and cancelled cards", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-28T02:00:00Z"));
  await page.addInitScript((fixture) => {
    localStorage.setItem("authToken", "closed-card-fixture-token");
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
    if (url.pathname === "/api/bounties") json = { data: rows, total: rows.length, page: 1, limit: 50 };
    if (url.pathname === "/api/notifications") json = { notifications: [], unreadCount: 0 };
    await route.fulfill({ json });
  });

  await page.goto("/home");
  await page.getByRole("button", { name: "All", exact: true }).click();

  const done = page.getByRole("button", { name: /^Completed example/ });
  const cancelled = page.getByRole("button", { name: /^Cancelled example/ });
  const open = page.getByRole("button", { name: /^Open overdue example/ });
  await expect(done.getByText("Done", { exact: true })).toBeVisible();
  await expect(done.getByText("Overdue", { exact: true })).toHaveCount(0);
  await expect(cancelled.getByText("Cancelled", { exact: true })).toBeVisible();
  await expect(cancelled.getByText("Overdue", { exact: true })).toHaveCount(0);
  await expect(open.getByText("Overdue", { exact: true })).toBeVisible();
});
