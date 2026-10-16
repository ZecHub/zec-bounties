import { test, expect } from "@playwright/test";
import { Backend, admin, bounty, column, hunter } from "./fixtures";

test("bounty approval applies the response without reloading the list", async ({ page }) => {
  const api = new Backend();
  api.rows[0] = bounty(1, "TO_DO");
  await api.open(page, "/admin", admin);
  const pagesBefore = api.listCalls(page).length;
  const actions = page.getByRole("button", { name: "Actions for Status bounty 1", exact: true });

  await actions.click();
  await expect(page.getByRole("menuitem", { name: "Approve Bounty", exact: true })).toBeEnabled();
  const response = page.waitForResponse(res =>
    res.request().method() === "PUT" && res.url().endsWith("/api/bounties/sync-1"),
  );
  await page.getByRole("menuitem", { name: "Approve Bounty", exact: true }).click();
  await response;

  await actions.click();
  await expect(page.getByRole("menuitem", { name: "Approve Bounty", exact: true })).toBeDisabled();
  await expect(page.getByRole("menuitem", { name: "Reject Bounty", exact: true })).toBeEnabled();
  expect(api.listCalls(page)).toHaveLength(pagesBefore);
});

test("task-access changes remain effective alongside bounty status events", async ({ page }) => {
  const api = new Backend();
  await api.open(page);
  const create = page.getByRole("button", { name: "New Bounty", exact: true }).filter({ visible: true }).first();

  api.broadcast("user_task_access_changed", { userId: hunter.id, canCreateTasks: false });
  await expect(create).toHaveAttribute("title", "An admin has disabled task creation for your account");
  await create.click();
  await expect(page.getByText("Task creation disabled", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  api.broadcast("bounty_updated", api.change("sync-1", "IN_REVIEW"));
  await expect(column(page, "In Review").getByText("Status bounty 1", { exact: true })).toBeVisible();
  await expect(create).toHaveAttribute("title", "An admin has disabled task creation for your account");

  api.broadcast("user_task_access_changed", { userId: hunter.id, canCreateTasks: true });
  await expect(create).not.toHaveAttribute("title");
  await create.click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Create New Bounty" })).toBeVisible();
});
