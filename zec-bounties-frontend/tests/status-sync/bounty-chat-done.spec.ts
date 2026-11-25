import { test, expect } from "@playwright/test";
import { Backend } from "./fixtures";

// A completed bounty keeps its chat (the server still returns it and refuses new
// messages), so the closed chat must not tell people its messages were deleted.
test("a completed bounty's chat shows its history and says it is closed for new messages", async ({ page }) => {
  const backend = new Backend(1);
  backend.rows[0] = { ...backend.rows[0], status: "DONE" };
  await backend.attach(page);
  await page.route(/localhost:900[01]\/api\/bounties\/sync-1\/chat/, async route => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204 });
    await route.fulfill({ json: { messages: [{
      id: "done-1", bountyId: "sync-1", senderId: "sync-admin", content: "Thanks, paid out", imageData: null,
      createdAt: "2026-10-01T10:00:00.000Z", sender: { id: "sync-admin", name: "Sync Admin", avatar: null },
    }] } });
  });
  await page.goto("/home?bounty=sync-1");

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Thanks, paid out", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/closed for new messages/i)).toBeVisible();
  await expect(dialog.getByText(/cleared/i)).toHaveCount(0);
});
