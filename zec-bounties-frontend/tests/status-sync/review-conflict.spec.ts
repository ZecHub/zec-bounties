import { expect, test } from "@playwright/test";
import { admin, Backend, hunter } from "./fixtures";

// Another reviewer approved the submission first, so this review gets 409.
// The admin sees the reason, and the dialog reloads to show that decision
// instead of offering review buttons for a decided submission.
test("a review refused with 409 shows why and reloads the submissions", async ({ page }) => {
  const api = new Backend(1);
  api.rows[0].status = "IN_REVIEW";
  api.submissions = [{ id: "review-conflict", bountyId: "sync-1", submittedBy: hunter.id,
    submitterUser: hunter, status: "pending", submittedAt: new Date(Date.now() - 3600000).toISOString(),
    description: "Fixture ready for review", deliverableUrl: "https://example.invalid/work" }];
  await api.open(page, "/admin", admin);
  await page.route("**/api/bounties/submissions/review-conflict/review", async route => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204 });
    api.submissions[0].status = "approved";
    await route.fulfill({ status: 409, json: { error: "This submission has already been reviewed" } });
  });

  await page.getByRole("button", { name: "Actions for Status bounty 1", exact: true }).click();
  await page.getByRole("menuitem", { name: /Review Submissions/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Reject", exact: true }).click();

  await expect(page.getByText("This submission has already been reviewed")).toBeVisible();
  await expect(dialog.getByText("Approved", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Reject", exact: true })).toHaveCount(0);
});
