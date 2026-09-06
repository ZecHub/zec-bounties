import { test, expect, type Page } from "@playwright/test";

const fixtureUser = {
  id: "a11y-fixture-user",
  name: "Accessibility Test User",
  nickname: "A11y Tester",
  email: "a11y-fixture@example.invalid",
  role: "HUNTER",
  avatar: null,
  UA_address: "fixture-not-a-real-zcash-address",
  z_address: null,
  isRobin: false,
};

async function mockAuthenticatedBackend(page: Page) {
  await page.addInitScript((user) => {
    localStorage.setItem("authToken", "a11y-fixture-token");
    localStorage.setItem("currentUser", JSON.stringify(user));
  }, fixtureUser);

  await page.route("**/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: fixtureUser }),
    });
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/bounties/categories") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: 1, name: "Development" },
          { id: 2, name: "Design" },
        ]),
      });
      return;
    }

    if (
      url.pathname === "/api/bounties" ||
      url.pathname.startsWith("/api/bounties?")
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

async function openCreateBountyDialog(page: Page) {
  await page.goto("/home");
  await page.waitForLoadState("domcontentloaded");

  const trigger = page
    .getByRole("button", { name: /new bounty/i })
    .first();

  await expect(trigger).toBeVisible({ timeout: 15000 });

  // Open with keyboard, not mouse.
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  return { trigger, dialog };
}


const applicationBountyFixture = {
  id: "a11y-application-bounty",
  title: "Accessibility Application Fixture",
  description: "Fixture bounty used only for keyboard accessibility testing.",
  createdBy: "fixture-creator",
  bountyAmount: 0.01,
  dateCreated: "2026-09-01T12:00:00.000Z",
  timeToComplete: "2026-12-01T12:00:00.000Z",
  status: "TO_DO",
  isApproved: true,
  isPaid: false,
  isPrivate: false,
  paymentAuthorized: false,
  difficulty: "Easy",
  chain: "TEST",
  categoryId: "Development",
  createdByUser: {
    id: "fixture-creator",
    name: "Fixture Creator",
    email: "creator@example.invalid",
    role: "HUNTER",
    isRobin: false,
  },
};

const workSubmissionBountyFixture = {
  ...applicationBountyFixture,
  id: "a11y-work-submission-bounty",
  title: "Accessibility Work Submission Fixture",
  status: "IN_PROGRESS",
  assignee: fixtureUser.id,
};

async function useBountyFixture(
  page: Page,
  bounty: Record<string, unknown>,
) {
  await page.unroute("**/api/**");

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/api/bounties/categories") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: 1, name: "Development" },
          { id: 2, name: "Design" },
        ]),
      });
      return;
    }

    if (url.pathname === "/api/bounties") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([bounty]),
      });
      return;
    }

    if (url.pathname === `/api/bounties/${String(bounty.id)}`) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(bounty),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

test.describe("keyboard accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedBackend(page);
  });

  test("Create Bounty errors are announced and focus moves to the first invalid field", async ({
    page,
  }) => {
    const { dialog } = await openCreateBountyDialog(page);

    const submitButton = dialog.getByRole("button", {
      name: "Create Bounty",
    });

    await submitButton.focus();
    await page.keyboard.press("Enter");

    const alert = dialog.getByRole("alert");

    await expect(alert).toContainText(
      "Please correct the highlighted fields before continuing.",
    );

    const title = dialog.locator("#title");

    await expect(title).toBeFocused();
    await expect(title).toHaveAttribute("aria-invalid", "true");
    await expect(title).toHaveAttribute(
      "aria-describedby",
      "title-error",
    );

    await expect(dialog.locator("#title-error")).toHaveText(
      "Enter a bounty title.",
    );

    await expect(dialog.locator("#category")).toHaveAttribute(
      "aria-invalid",
      "true",
    );

    await expect(dialog.locator("#reward")).toHaveAttribute(
      "aria-invalid",
      "true",
    );

    await expect(dialog.locator("#description")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  test("Create Bounty modal traps focus, shows keyboard focus, and restores focus after Escape", async ({
    page,
  }) => {
    const { trigger, dialog } = await openCreateBountyDialog(page);

    // Radix Dialog should keep keyboard focus inside the modal.
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press("Tab");

      const focusIsInsideDialog = await page.evaluate(() => {
        return Boolean(
          document.activeElement?.closest('[role="dialog"]'),
        );
      });

      expect(focusIsInsideDialog).toBe(true);
    }

    // The focused control should have a visible focus indicator.
    const hasVisibleFocusIndicator = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;

      if (!element) return false;

      const styles = window.getComputedStyle(element);

      const hasOutline =
        styles.outlineStyle !== "none" &&
        parseFloat(styles.outlineWidth || "0") > 0;

      const hasBoxShadow =
        styles.boxShadow !== "none" &&
        styles.boxShadow !== "";

      return hasOutline || hasBoxShadow;
    });

    expect(hasVisibleFocusIndicator).toBe(true);

    // Escape must close the dialog.
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();

    // Focus should return to the control that opened it.
    await expect(trigger).toBeFocused();
  });

  test("Application errors are announced and focus moves to the invalid message", async ({
    page,
  }) => {
    await useBountyFixture(page, applicationBountyFixture);

    await page.goto("/home?bounty=a11y-application-bounty");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(dialog).toContainText("Accessibility Application Fixture");

    const message = dialog.locator("#application-message");
    const submit = dialog.getByRole("button", {
      name: "Submit Application",
    });

    await expect(submit).toBeVisible();
    await submit.focus();
    await page.keyboard.press("Enter");

    const alert = dialog.getByRole("alert");

    await expect(alert).toHaveText("Enter an application message.");
    await expect(message).toBeFocused();
    await expect(message).toHaveAttribute("aria-invalid", "true");
    await expect(message).toHaveAttribute(
      "aria-describedby",
      "application-message-error",
    );
    await expect(dialog.locator("#application-message-error")).toHaveText(
      "Enter an application message.",
    );
  });

  test("Work submission errors are announced and focus moves to the first invalid field", async ({
    page,
  }) => {
    await useBountyFixture(page, workSubmissionBountyFixture);

    await page.goto("/home?bounty=a11y-work-submission-bounty");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await expect(dialog).toContainText(
      "Accessibility Work Submission Fixture",
    );

    const submit = dialog.getByRole("button", {
      name: "Submit Work",
    });

    await expect(submit).toBeVisible({ timeout: 15000 });
    await submit.focus();
    await page.keyboard.press("Enter");

    const alert = dialog.getByRole("alert");

    await expect(alert).toContainText(
      "Please correct the highlighted work submission fields.",
    );

    const description = dialog.locator("#submission-description");
    const deliverable = dialog.locator("#deliverable-url");

    await expect(description).toBeFocused();
    await expect(description).toHaveAttribute("aria-invalid", "true");
    await expect(description).toHaveAttribute(
      "aria-describedby",
      "submission-description-error",
    );

    await expect(dialog.locator("#submission-description-error")).toHaveText(
      "Describe the work you completed.",
    );

    await expect(deliverable).toHaveAttribute("aria-invalid", "true");
    await expect(deliverable).toHaveAttribute(
      "aria-describedby",
      "deliverable-url-help deliverable-url-error",
    );

    await expect(dialog.locator("#deliverable-url-error")).toHaveText(
      "Enter a deliverable URL.",
    );
  });

});
