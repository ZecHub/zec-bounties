import { expect, test } from "@playwright/test";
import { Backend } from "./fixtures";

for (const viewport of [{ width: 1200, height: 840 }, { width: 390, height: 820 }]) {
  test(`sort can be selected with the keyboard at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await new Backend().attach(page);
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: "Open Bounties" })).toBeVisible();
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    const filters = page.getByRole("dialog", { name: "Filters" });
    const sort = filters.getByRole("button", { name: "Sort by" });
    const choices = page.getByRole("listbox", { name: "Sort by" });

    await sort.focus();
    await page.keyboard.press("Enter");
    await expect(choices.getByRole("option", { name: "Newest" })).toBeFocused({ timeout: 1200 });
    await page.keyboard.press("ArrowDown");
    const highest = choices.getByRole("option", { name: "Highest reward" });
    await expect(highest).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(choices).toHaveCount(0);
    await expect(sort).toHaveText("Highest reward");
    await expect(sort).toBeFocused();
    await expect(page).toHaveURL(/sort=highest_reward/);

    await page.keyboard.press("ArrowDown");
    await expect(highest).toBeFocused();
    await page.keyboard.press("End");
    await expect(choices.getByRole("option", { name: "Soonest deadline" })).toBeFocused();
    await page.keyboard.press("Home");
    await expect(choices.getByRole("option", { name: "Newest" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(choices).toHaveCount(0);
    await expect(filters).toBeVisible();
    await expect(sort).toBeFocused();
    await expect(sort).toHaveText("Highest reward");

    await page.keyboard.press("ArrowDown");
    await expect(highest).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(choices).toHaveCount(0);
    await expect(filters.getByRole("button", { name: "Team", exact: true })).toBeFocused();

    await sort.click();
    await choices.getByRole("option", { name: "Newest" }).click();
    await expect(sort).toHaveText("Newest");
    await expect(page).not.toHaveURL(/sort=/);
  });
}
