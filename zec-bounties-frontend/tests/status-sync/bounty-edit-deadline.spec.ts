import { test, expect } from "@playwright/test";
import { Backend, creator } from "./fixtures";

// West of UTC, the creator's own edit must keep the deadline day: saving the
// form must not move it to the day before.
test.use({ timezoneId: "America/New_York" });

test("a creator's edit in a zone west of UTC keeps the deadline day", async ({ page }) => {
  const backend = new Backend(1);
  // Created a minute ago by this hunter (edits are open for 15 minutes), due 20 Nov
  // local midnight, as the create dialog stores it.
  backend.rows[0] = {
    ...backend.rows[0],
    dateCreated: new Date(Date.now() - 60_000).toISOString(),
    timeToComplete: "2026-11-20T05:00:00.000Z",
  };
  await backend.attach(page, creator);
  let sent: any;
  await page.route(/localhost:900[01]\/api\/bounties\/sync-1$/, async route => {
    if (route.request().method() !== "PUT") return route.fallback();
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { ...backend.rows[0], ...sent } });
  });
  await page.goto("/home?bounty=sync-1");

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Edit bounty" }).click();
  await expect(dialog.locator('input[type="date"]')).toHaveValue("2026-11-20");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(() => sent).toBeTruthy();
  expect(sent.timeToComplete).toBe("2026-11-20T05:00:00.000Z");
});
