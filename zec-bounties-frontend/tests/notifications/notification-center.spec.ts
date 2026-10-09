import { test, expect, type Page } from "@playwright/test";

const user = {
  id: "notification-hunter",
  name: "Notification Tester",
  nickname: "notification-tester",
  role: "HUNTER",
  UA_address: "fixture-only",
};

const baseNotification = {
  id: "notification-1",
  type: "BOUNTY_ASSIGNED",
  title: "Application accepted",
  body: "You've been assigned to Notification bounty",
  url: null,
  readAt: null as string | null,
  createdAt: "2026-10-07T12:00:00.000Z",
};

async function openBoard(page: Page) {
  let notification = { ...baseNotification };
  let unreadCount = 1;
  let markAllCalls = 0;

  await page.addInitScript((currentUser) => {
    localStorage.setItem("authToken", "notification-fixture-token");
    localStorage.setItem("currentUser", JSON.stringify(currentUser));
    localStorage.removeItem("zecBountiesPushAttempted");
  }, user);

  await page.routeWebSocket("ws://localhost:9000/**", () => {});

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.origin === "http://127.0.0.1:3128") {
      return route.continue();
    }

    if (url.origin !== "http://localhost:9000") {
      return route.abort();
    }

    if (request.method() === "GET" && url.pathname === "/auth/me") {
      return route.fulfill({ json: { user } });
    }

    if (
      request.method() === "GET" &&
      url.pathname === "/api/bounties/categories"
    ) {
      return route.fulfill({
        json: [{ id: "Web Development", name: "Web Development" }],
      });
    }

    if (request.method() === "GET" && url.pathname === "/api/bounties") {
      return route.fulfill({
        json: { data: [], total: 0, page: 1, limit: 10 },
      });
    }

    if (
      request.method() === "GET" &&
      url.pathname === "/api/notifications"
    ) {
      return route.fulfill({
        json: { notifications: [notification], unreadCount },
      });
    }

    if (
      request.method() === "PATCH" &&
      url.pathname === "/api/notifications/read-all"
    ) {
      markAllCalls += 1;
      unreadCount = 0;
      notification = {
        ...notification,
        readAt: "2026-10-07T12:05:00.000Z",
      };
      return route.fulfill({ json: { success: true, updated: 1 } });
    }

    if (
      request.method() === "PATCH" &&
      url.pathname === `/api/notifications/${notification.id}/read`
    ) {
      unreadCount = 0;
      notification = {
        ...notification,
        readAt: "2026-10-07T12:05:00.000Z",
      };
      return route.fulfill({ json: { notification } });
    }

    if (request.method() === "GET") {
      return route.fulfill({ json: [] });
    }

    return route.fulfill({ json: { success: true } });
  });

  await page.goto("/home");
  await expect(
    page.getByRole("heading", { name: "All Bounties" }),
  ).toBeVisible();

  return {
    getMarkAllCalls: () => markAllCalls,
  };
}

test("desktop bell opens notification center and unread state can be cleared", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const fixture = await openBoard(page);

  const bell = page.getByRole("button", {
    name: "Notifications, 1 unread",
  });
  await expect(bell).toBeVisible();

  await bell.click();

  await expect(
    page.getByRole("heading", { name: "Notifications" }),
  ).toBeVisible();
  await expect(page.getByText("Application accepted")).toBeVisible();
  await expect(page.getByText("1 unread")).toBeVisible();

  await page.getByRole("button", { name: "Mark all read" }).click();

  await expect.poll(fixture.getMarkAllCalls).toBe(1);
  await expect(page.getByText("You're all caught up")).toBeVisible();
  await expect(page.getByRole("button", { name: "Notifications" })).toBeVisible();

  expect(
    await page.evaluate(() =>
      localStorage.getItem("zecBountiesPushAttempted"),
    ),
  ).toBeNull();
});

test("mobile Notifications button opens the same notification center", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBoard(page);

  await page.getByRole("button", { name: "Toggle menu" }).click();

  const notificationsButton = page.getByRole("button", {
    name: "Notifications, 1 unread",
  });
  await expect(notificationsButton).toBeVisible();
  await notificationsButton.click();

  await expect(
    page.getByRole("heading", { name: "Notifications" }),
  ).toBeVisible();
  await expect(page.getByText("Application accepted")).toBeVisible();
});
