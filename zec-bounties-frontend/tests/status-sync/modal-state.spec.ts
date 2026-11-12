import { test, expect, type Page } from "@playwright/test";
import { Backend, hunter } from "./fixtures";

async function openBounty(page: Page, index: number) {
  await page.getByText(`Status bounty ${index}`, { exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: `Status bounty ${index}`, exact: true })).toBeVisible();
}

async function closeBounty(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

function submittedBackend() {
  const api = new Backend(2);
  api.rows.forEach(row => { row.status = "IN_REVIEW"; });
  api.submissions = api.rows.map(row => ({
    id: `submission-${row.id}`, bountyId: row.id, submittedBy: hunter.id,
    submitterUser: hunter, status: "pending", submittedAt: new Date().toISOString(),
    description: `Delivered ${row.title}`, deliverableUrl: `https://example.invalid/${row.id}`,
  }));
  return api;
}

for (const path of ["/home", "/my-bounties"]) {
  test(`${path}: editing one submission does not carry its draft into another bounty`, async ({ page }, info) => {
    const api = submittedBackend();
    await api.open(page, path);
    await openBounty(page, 1);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Edit", exact: true }).click();
    await dialog.getByLabel("Work description", { exact: true }).fill("Unsent revision for bounty one only");
    await closeBounty(page);
    await openBounty(page, 2);
    await page.screenshot({ path: info.outputPath("different-submission.png"), fullPage: true });
    await expect(dialog.getByText("Delivered Status bounty 2", { exact: true })).toBeVisible();
    await expect(dialog.getByLabel("Work description", { exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(dialog.getByLabel("Work description", { exact: true })).toHaveValue("Delivered Status bounty 2");
    await expect(dialog.getByLabel("Link 1", { exact: true })).toHaveValue("https://example.invalid/sync-2");
  });

  test(`${path}: a late submission response cannot replace the next bounty's draft`, async ({ page }, info) => {
    const api = new Backend(2);
    await api.open(page, path);
    await openBounty(page, 1);
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("What did you deliver?").fill("Delivered bounty one");
    await dialog.getByLabel("Link 1", { exact: true }).fill("https://example.invalid/one");
    api.hold.set(page, "/api/bounties/sync-1/submit");
    await dialog.getByRole("button", { name: "Submit work", exact: true }).click();
    await expect.poll(() => api.held.has(page)).toBe(true);
    try {
      await closeBounty(page);
      await openBounty(page, 2);
      await dialog.getByLabel("What did you deliver?").fill("Draft for bounty two");
      await dialog.getByLabel("Link 1", { exact: true }).fill("https://example.invalid/two");
      await api.release(page);
      // The toast confirms the first request finished; its local state must
      // not create a submitted-work panel on the second bounty.
      await expect(page.locator('[data-sonner-toast]').filter({ hasText: "Work submitted" })).toBeVisible();
      await page.screenshot({ path: info.outputPath("late-response.png"), fullPage: true });
      await expect(dialog.getByLabel("What did you deliver?")).toHaveValue("Draft for bounty two");
      await expect(dialog.getByLabel("Link 1", { exact: true })).toHaveValue("https://example.invalid/two");
      await expect(dialog.getByRole("button", { name: "Submit work", exact: true })).toBeEnabled();
      await expect(dialog.getByText("Delivered bounty one", { exact: true })).toHaveCount(0);
      expect(api.submissions).toHaveLength(1);
      expect(api.submissions[0].bountyId).toBe("sync-1");
    } finally {
      if (api.held.has(page)) await api.release(page);
    }
  });

  test(`${path}: validation errors belong to the bounty where submission was attempted`, async ({ page }) => {
    const api = new Backend(2);
    await api.open(page, path);
    await openBounty(page, 1);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Submit work", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Please correct");
    await closeBounty(page);
    await openBounty(page, 2);
    await expect(dialog.getByLabel("What did you deliver?")).toBeVisible();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await expect(dialog.getByLabel("What did you deliver?")).toHaveAttribute("aria-invalid", "false");
  });

  test(`${path}: reopening the same bounty preserves its existing submission edit`, async ({ page }) => {
    const api = submittedBackend();
    await api.open(page, path);
    await openBounty(page, 1);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Edit", exact: true }).click();
    await dialog.getByLabel("Work description", { exact: true }).fill("Still editing this same submission");
    await closeBounty(page);
    await openBounty(page, 1);
    await expect(dialog.getByLabel("Work description", { exact: true })).toHaveValue("Still editing this same submission");
  });
}
