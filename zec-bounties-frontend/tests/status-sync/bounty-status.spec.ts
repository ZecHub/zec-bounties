import { test, expect } from "@playwright/test";
import { Backend, admin, bounty, cards, column, copy, creator, hunter, loadTwenty, pill } from "./fixtures";

test("All Bounties already moves a loaded card on a direct status event", async ({ page }) => {
  const api = new Backend(25);
  await api.open(page);
  await loadTwenty(page);
  const pagesBefore = api.listCalls(page).map(c => c.page);
  api.broadcast("bounty_status_changed", api.change("sync-15", "IN_REVIEW"));
  await expect(column(page, "In Review").getByText("Status bounty 15", { exact: true })).toBeVisible();
  await expect(cards(page)).toHaveCount(20);
  expect(api.listCalls(page).map(c => c.page)).toEqual(pagesBefore);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(cards(page)).toHaveCount(25);
  expect(new Set(await cards(page).allTextContents()).size).toBe(25);
});

test("My Bounties updates counts and filters without adding unrelated records", async ({ page }, info) => {
  const api = new Backend();
  await api.open(page, "/my-bounties");
  const requests = api.calls.get(page)!.length;
  // Selecting a filter is not a status mutation or a fetch.
  await pill(page, "In Review").click();
  await expect(page.getByText("No bounties with this status.")).toBeVisible();
  await pill(page, "In Progress").click();
  expect(api.calls.get(page)!.length).toBe(requests);
  expect(api.rows[0].status).toBe("IN_PROGRESS");

  api.broadcast("bounty_status_changed", api.change("sync-1", "IN_REVIEW"));
  await expect(pill(page, "In Progress")).toHaveText("In Progress0");
  await expect(pill(page, "In Review")).toHaveText("In Review1");
  await expect(page.getByText("No bounties with this status.")).toBeVisible();
  await pill(page, "In Review").click();
  await expect(page.getByText("Status bounty 1", { exact: true })).toBeVisible();

  const unrelated = { ...bounty(99, "DONE"), createdBy: "someone-else", assignee: "someone-else", assignees: [] };
  api.broadcast("bounty_updated", unrelated);
  api.broadcast("bounty_updated", api.rows[0]); // repeated events must not duplicate rows
  await pill(page, "All").click();
  await expect(pill(page, "All")).toHaveText("All1");
  await expect(page.getByText("Status bounty 99", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("my-bounties-updated.png"), fullPage: true });
});

for (const path of ["/home", "/my-bounties"]) {
  test(path + " ignores an unversioned event before the first dated update", async ({ page }) => {
    const api = new Backend();
    await api.open(page, path);
    api.broadcast("bounty_updated", { ...api.rows[0], status: "DONE", updatedAt: undefined });
    // A following dated, partial event proves both messages were processed.
    // Its missing status must come from the current record, not the rejected event.
    const updated = api.change("sync-1", "IN_PROGRESS");
    api.broadcast("bounty_updated", {
      id: updated.id, updatedAt: updated.updatedAt, title: "After unversioned update",
    });
    await expect(page.getByText("After unversioned update", { exact: true })).toBeVisible();
    if (path === "/home") {
      await expect(column(page, "In Progress").getByText("After unversioned update", { exact: true })).toBeVisible();
      await expect(column(page, "Done").getByText("After unversioned update", { exact: true })).toHaveCount(0);
    } else {
      await expect(pill(page, "In Progress")).toHaveText("In Progress1");
      await expect(pill(page, "Done")).toHaveText("Done0");
    }
  });

  test(path + " keeps open bounty details current after remote changes", async ({ page }) => {
    const api = new Backend();
    api.rows[0] = bounty(1, "TO_DO");
    await api.open(page, path);
    await page.getByText("Status bounty 1", { exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Bounty not yet approved")).toBeVisible();
    api.broadcast("bounty_status_changed", api.change("sync-1", "IN_PROGRESS"));
    await expect(dialog.getByRole("button", { name: "Submit work", exact: true })).toBeVisible();
    api.broadcast("bounty_status_changed", api.change("sync-1", "DONE"));
    await expect(dialog.getByRole("button", { name: "Submit work", exact: true })).toHaveCount(0);
    await expect(dialog).toBeVisible();
  });

  test(path + " applies a submission response for the actor and broadcasts to another user", async ({ page, browser }, info) => {
    const api = new Backend(25);
    const target = api.rows[14];
    api.staleDetails.set(target.id, copy(target));
    await api.open(page, path);
    if (path === "/home") await loadTwenty(page);
    const other = await browser.newPage({ baseURL: "http://127.0.0.1:3128", serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
    try {
      await api.open(other, "/home", creator);
      await loadTwenty(other);
      const pagesBefore = api.listCalls(other).map(c => c.page);
      await page.getByText(target.title, { exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("What did you deliver?").fill("Completed the fixture task.");
      await dialog.getByLabel("Link to your work").fill("https://example.invalid/work");
      await dialog.getByRole("button", { name: "Submit work", exact: true }).click();
      await expect(dialog.getByText("Work submitted", { exact: true })).toBeVisible();
      if (path === "/home") {
        await expect(column(page, "In Review").getByText(target.title, { exact: true })).toHaveCount(1);
        await expect(cards(page)).toHaveCount(20);
      } else {
        await expect(pill(page, "In Review")).toHaveText("In Review1");
        await expect(pill(page, "In Progress")).toHaveText("In Progress24");
      }
      await expect(column(other, "In Review").getByText(target.title, { exact: true })).toBeVisible();
      await expect(cards(other)).toHaveCount(20);
      expect(api.listCalls(other).map(c => c.page)).toEqual(pagesBefore);
      // The mutation response has the fresh bounty; a second detail GET is unnecessary.
      expect(api.calls.get(page)!.filter(c => c.method === "GET" && c.path === "/api/bounties/" + target.id)).toHaveLength(0);
      await other.screenshot({ path: info.outputPath("connected-viewer-after-submission.png"), fullPage: true });
      await other.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect(cards(other)).toHaveCount(25);
      expect(new Set(await cards(other).allTextContents()).size).toBe(25);
    } finally {
      await other.close();
    }
  });
}

test("a late My Bounties response cannot undo an event received while loading", async ({ page }) => {
  const api = new Backend();
  await api.open(page, "/my-bounties");
  await page.getByText("Status bounty 1", { exact: true }).click();
  api.hold.set(page, "/api/bounties/mine");
  await page.keyboard.press("Escape");
  await expect.poll(() => api.held.has(page) && api.sockets.has(page)).toBe(true);
  api.broadcast("bounty_updated", api.change("sync-1", "DONE"));
  await api.release(page);
  await expect(pill(page, "Done")).toHaveText("Done1");
  await expect(pill(page, "In Progress")).toHaveText("In Progress0");
});

test("a delayed next page keeps newer statuses and pagination deduplication", async ({ page }) => {
  const api = new Backend(24);
  await api.open(page);
  await expect(cards(page)).toHaveCount(10);
  // A new result shifts the API offsets so page 2 overlaps the loaded page.
  api.rows.unshift(bounty(0));
  api.hold.set(page, "/api/bounties");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => api.held.has(page)).toBe(true);
  api.broadcast("bounty_updated", api.change("sync-15", "IN_REVIEW"));
  await api.release(page);
  await expect(column(page, "In Review").getByText("Status bounty 15", { exact: true })).toBeVisible();
  await expect(cards(page)).toHaveCount(19);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(cards(page)).toHaveCount(24);
  expect(new Set(await cards(page).allTextContents()).size).toBe(24);
  expect(api.listCalls(page).filter(c => c.page > 1).map(c => c.page)).toEqual([2, 3]);
});

test("direct status mutations update the actor and My Bounties, ignoring older events and responses", async ({ page, browser }, info) => {
  const api = new Backend();
  api.rows[0] = bounty(1, "TO_DO");
  await api.open(page, "/admin", admin);
  const viewer = await browser.newPage({ baseURL: "http://127.0.0.1:3128", serviceWorkers: "block" });
  try {
    await api.open(viewer, "/my-bounties");
    const pagesBefore = api.listCalls(page).length;
    for (const [menu, label] of [["Set In Progress", "In Progress"], ["Set In Review", "In Review"], ["Set To Do", "Todo"]]) {
      await page.getByRole("button", { name: "Actions for Status bounty 1", exact: true }).click();
      await page.getByRole("menuitem", { name: menu, exact: true }).click();
      await expect(page.getByRole("row").filter({ hasText: "Status bounty 1" }).getByText(label === "Todo" ? "To Do" : label, { exact: true })).toBeVisible();
      await expect(pill(viewer, label)).toHaveText(label + "1");
    }

    api.hold.set(page, "/api/bounties/sync-1/status");
    await page.getByRole("button", { name: "Actions for Status bounty 1", exact: true }).click();
    await page.getByRole("menuitem", { name: "Set In Review", exact: true }).click();
    await expect.poll(() => api.held.has(page)).toBe(true);
    const old = copy(api.rows[0]);
    api.broadcast("bounty_status_changed", api.change("sync-1", "DONE"));
    await expect(pill(viewer, "Done")).toHaveText("Done1");
    await api.release(page); // The actor's older mutation response arrives last.
    api.broadcast("bounty_updated", old);
    await expect(page.getByRole("row").filter({ hasText: "Status bounty 1" }).getByText("Done", { exact: true })).toBeVisible();
    await expect(pill(viewer, "Done")).toHaveText("Done1");
    expect(api.listCalls(page)).toHaveLength(pagesBefore);
    await expect(page.getByRole("button", { name: /Active Bounties/ })).toContainText("0");
    await viewer.screenshot({ path: info.outputPath("direct-status-my-bounties.png"), fullPage: true });
  } finally {
    await viewer.close();
  }
});

for (const path of ["/home", "/my-bounties"]) {
  test(path + " resubmission uses the returned bounty for the actor and the event for another user", async ({ page, browser }) => {
    const api = new Backend();
    api.submissions = [{ id: "revision-fixture", bountyId: "sync-1", submittedBy: hunter.id,
      submitterUser: hunter, status: "needs_revision", submittedAt: new Date(Date.now() - 3600000).toISOString(),
      description: "Initial work", deliverableUrl: "https://example.invalid/work", reviewNotes: "Please update this work" }];
    await api.open(page, path);
    const other = await browser.newPage({ baseURL: "http://127.0.0.1:3128", serviceWorkers: "block" });
    try {
      await api.open(other, "/my-bounties", creator);
      await page.getByText("Status bounty 1", { exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("Edit and resubmit")).toBeVisible();
      await dialog.getByRole("button", { name: "Edit", exact: true }).click();
      await dialog.getByLabel("Work description").fill("Completed the requested revision");
      await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(dialog.getByText("Completed the requested revision")).toBeVisible();
      await expect(dialog.getByText("Edit and resubmit")).toHaveCount(0);
      if (path === "/home") {
        await expect(column(page, "In Review").getByText("Status bounty 1", { exact: true })).toHaveCount(1);
      } else {
        await expect(pill(page, "In Review")).toHaveText("In Review1");
      }
      await expect(pill(other, "In Review")).toHaveText("In Review1");
    } finally {
      await other.close();
    }
  });
}

for (const action of ["Approve", "Revise", "Reject"]) {
  test("review " + action + " updates the actor and both viewer pages without resetting lists", async ({ page, browser }, info) => {
    const api = new Backend(25);
    api.rows[14].status = "IN_REVIEW";
    api.submissions = [{ id: "review-fixture", bountyId: "sync-15", submittedBy: hunter.id,
      submitterUser: hunter, status: "pending", submittedAt: new Date(Date.now() - 3600000).toISOString(),
      description: "Fixture ready for review", deliverableUrl: "https://example.invalid/work" }];
    await api.open(page, "/admin", admin);
    const viewers = await Promise.all(["/home", "/my-bounties"].map(async path => {
      const viewer = await browser.newPage({ baseURL: "http://127.0.0.1:3128", serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
      await api.open(viewer, path);
      if (path === "/home") await loadTwenty(viewer);
      return viewer;
    }));
    const pagesBefore = api.listCalls(viewers[0]).map(c => c.page);
    try {
      await viewers[1].getByText("Status bounty 15", { exact: true }).click();
      await expect(viewers[1].getByRole("dialog").getByText("Work submitted", { exact: true })).toBeVisible();
      await expect(viewers[1].getByRole("dialog").getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const actions = page.getByRole("button", { name: "Actions for Status bounty 15", exact: true });
      await expect(actions).toBeVisible();
      await actions.click();
      await page.getByRole("menuitem", { name: /Review Submissions/ }).click();
      await page.getByRole("dialog").getByRole("button", { name: action, exact: true }).click();
      const status = action === "Approve" ? "Done" : "In Progress";
      const row = page.getByRole("row", { includeHidden: true }).filter({ hasText: "Status bounty 15" });
      await expect(row.getByText(status, { exact: true })).toHaveCount(1);
      await expect(column(viewers[0], status).getByText("Status bounty 15", { exact: true })).toBeVisible();
      await expect(cards(viewers[0])).toHaveCount(20);
      await expect(pill(viewers[1], "In Review")).toHaveText("In Review0");
      await expect(pill(viewers[1], status)).toHaveText(status + (action === "Approve" ? "1" : "25"));
      expect(api.listCalls(viewers[0]).map(c => c.page)).toEqual(pagesBefore);
      if (action === "Revise") {
        await expect(viewers[1].getByRole("dialog").getByText("Edit and resubmit")).toBeVisible();
      }
      await viewers[1].screenshot({ path: info.outputPath("my-bounties-after-review.png"), fullPage: true });
    } finally {
      await Promise.all(viewers.map(viewer => viewer.close()));
    }
  });
}
