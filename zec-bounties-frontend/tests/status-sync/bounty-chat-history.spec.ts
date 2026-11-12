import { test, expect } from "@playwright/test";
import { Backend } from "./fixtures";

// A bounty chat longer than one page (30 messages): the oldest messages must be
// reachable from the chat window, not silently cut off.
const message = (n: number) => ({
  id: `msg-${String(n).padStart(3, "0")}`,
  bountyId: "sync-1",
  senderId: "sync-admin",
  content: `Chat line ${n}`,
  imageData: null,
  createdAt: new Date(Date.UTC(2026, 9, 1, 0, n)).toISOString(),
  sender: { id: "sync-admin", name: "Sync Admin", avatar: null },
});

test("a long bounty chat loads its earlier messages on request", async ({ page }) => {
  const backend = new Backend(1);
  await backend.open(page);
  const all = Array.from({ length: 35 }, (_, i) => message(i + 1));
  const cursors: string[] = [];
  await page.route(/localhost:900[01]\/api\/bounties\/sync-1\/chat/, async route => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204 });
    const before = new URL(route.request().url()).searchParams.get("before");
    if (before) cursors.push(before);
    const end = before ? all.findIndex(m => m.id === before) : all.length;
    const start = Math.max(0, end - 30);
    await route.fulfill({ json: { messages: all.slice(start, end), hasMore: start > 0 } });
  });

  await page.getByText("Status bounty 1", { exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Chat line 35", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Chat line 5", { exact: true })).toHaveCount(0);

  const earlier = dialog.getByRole("button", { name: "Load earlier messages" });
  await earlier.click();
  await expect(dialog.getByText("Chat line 1", { exact: true })).toBeAttached();
  await expect(dialog.getByText("Chat line 35", { exact: true })).toBeAttached();
  await expect(earlier).toHaveCount(0);
  expect(cursors).toEqual(["msg-006"]);
});

test("an earlier-page request that fails after another bounty opened shows no error there", async ({ page }) => {
  const backend = new Backend(2);
  await backend.attach(page);
  const first = Array.from({ length: 35 }, (_, i) => message(i + 1));
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(/localhost:900[01]\/api\/bounties\/sync-[12]\/chat/, async route => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204 });
    const url = new URL(route.request().url());
    if (url.pathname.includes("sync-2")) {
      return route.fulfill({ json: { messages: [{ ...message(1), id: "b-1", bountyId: "sync-2", content: "Bounty two chat" }], hasMore: false } });
    }
    if (url.searchParams.get("before")) {
      await held;
      return route.fulfill({ status: 500, json: { error: "Bounty one earlier page failed" } });
    }
    await route.fulfill({ json: { messages: first.slice(5), hasMore: true } });
  });
  await page.goto("/home?bounty=sync-1");

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Chat line 35", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Load earlier messages" }).click();
  // the same open dialog switches to the other bounty, as a ?bounty= link does
  await page.evaluate(() => (window as any).next.router.push("/home?bounty=sync-2"));
  await expect(dialog.getByText("Bounty two chat", { exact: true })).toBeVisible();
  release();
  await page.waitForLoadState("networkidle");
  await expect(dialog.getByText("Bounty two chat", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Bounty one earlier page failed")).toHaveCount(0);
});

test("a short bounty chat shows no load-earlier control", async ({ page }) => {
  const backend = new Backend(1);
  await backend.open(page);
  await page.route(/localhost:900[01]\/api\/bounties\/sync-1\/chat/, async route => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204 });
    await route.fulfill({ json: { messages: [message(1), message(2)], hasMore: false } });
  });
  await page.getByText("Status bounty 1", { exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Chat line 2", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Load earlier messages" })).toHaveCount(0);
});
