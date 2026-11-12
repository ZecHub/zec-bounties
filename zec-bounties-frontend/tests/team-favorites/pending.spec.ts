import { test, expect, type Page } from "@playwright/test";
import { Backend, APP_URL } from "../status-sync/fixtures";

const teams = ["Alpha", "Beta"].map(name => ({
  id: name.toLowerCase(), name, description: "Local favorite regression fixture",
  logo: null, banner: null, twitterUrl: null, discordUrl: null, additionalLinks: [],
  isVerified: true, createdAt: "2026-10-01T12:00:00Z", memberCount: 1,
  communityCount: 0, donationAddress: null,
}));

async function openTeams(page: Page, path = "/explore", initiallyFavorite = false) {
  const api = new Backend(1);
  await api.attach(page);
  const saved = new Set(initiallyFavorite ? ["alpha"] : []);
  const writes: Array<{ id: string; method: string }> = [];
  let release: (status: number) => void = () => {};
  let held = false;
  await page.route("**/api/teams/**", async route => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (method === "OPTIONS") return route.fulfill({ status: 204 });
    if (url.pathname === "/api/teams/public") return route.fulfill({ json: teams });
    if (url.pathname === "/api/teams/favorites") return route.fulfill({ json: { favorites: [...saved] } });
    const match = url.pathname.match(/^\/api\/teams\/([^/]+)\/(overview|favorite)$/);
    if (!match) return route.fallback();
    if (match[2] === "overview") return route.fulfill({ json: teams.find(t => t.id === match[1]) });
    const id = match[1];
    writes.push({ id, method });
    let status = 200;
    if (id === "alpha" && !held) {
      held = true;
      status = await new Promise<number>(resolve => { release = resolve; });
    }
    if (status === 200) method === "POST" ? saved.add(id) : saved.delete(id);
    return route.fulfill({ status, json: status === 200 ? { success: true } : { error: "Fixture failure" } });
  });
  await page.goto(APP_URL + path);
  if (path === "/explore") await expect(page.getByRole("link").filter({ hasText: "Alpha" })).toBeVisible();
  else await expect(page.getByRole("heading", { name: "Alpha", exact: true })).toBeVisible();
  await expect(favorite(page, path, "alpha", initiallyFavorite)).toBeVisible();
  return { saved, writes, release: (status = 200) => release(status) };
}

function favorite(page: Page, path: string, teamId = "alpha", selected = false) {
  if (path !== "/explore") return page.getByRole("button", { name: selected ? "Favorited" : "Favorite", exact: true });
  return page.getByRole("link").filter({ hasText: teamId === "alpha" ? "Alpha" : "Beta" })
    .getByRole("button", { name: selected ? "Remove from favorites" : "Add to favorites", exact: true });
}

for (const path of ["/explore", "/explore/alpha"]) {
  test(`pending favorite cannot send a conflicting toggle on ${path}`, async ({ page }) => {
    const fixture = await openTeams(page, path);
    try {
      await favorite(page, path).click();
      await expect.poll(() => fixture.writes.length).toBe(1);
      const pending = favorite(page, path, "alpha", true);
      await expect(pending).toBeDisabled();
      await expect(pending).toHaveAttribute("aria-busy", "true");
      // Native click() also respects disabled. Before the fix this sends DELETE.
      await pending.evaluate((button: HTMLButtonElement) => button.click());
      fixture.release();
      await expect(pending).toBeEnabled();
      expect(fixture.writes).toEqual([{ id: "alpha", method: "POST" }]);
      expect(fixture.saved.has("alpha")).toBe(true);
      await page.screenshot({ path: test.info().outputPath("favorite-saved.png") });
    } finally { fixture.release(); }
  });
}

test("removing a favorite is guarded until the delete settles", async ({ page }) => {
  const fixture = await openTeams(page, "/explore", true);
  try {
    await favorite(page, "/explore", "alpha", true).click();
    await expect.poll(() => fixture.writes.length).toBe(1);
    const pending = favorite(page, "/explore");
    await expect(pending).toBeDisabled();
    fixture.release();
    await expect(pending).toBeEnabled();
    expect(fixture.saved.has("alpha")).toBe(false);
    expect(fixture.writes).toEqual([{ id: "alpha", method: "DELETE" }]);
  } finally { fixture.release(); }
});

test("a late add response cannot leave a saved favorite hidden", async ({ page }) => {
  const fixture = await openTeams(page);
  try {
    await favorite(page, "/explore").click();
    await expect.poll(() => fixture.writes.length).toBe(1);
    const pending = favorite(page, "/explore", "alpha", true);
    const canToggleAgain = await pending.isEnabled();
    await pending.evaluate((button: HTMLButtonElement) => button.click());
    // On the old UI the second DELETE is processed before the held POST.
    if (canToggleAgain) await expect.poll(() => fixture.writes.length).toBe(2);
    fixture.release();
    await expect.poll(() => fixture.saved.has("alpha")).toBe(true);
    await expect(favorite(page, "/explore", "alpha", true)).toBeEnabled();
  } finally { fixture.release(); }
});

test("a failed save rolls back and permits a successful retry", async ({ page }) => {
  const fixture = await openTeams(page);
  await favorite(page, "/explore").click();
  await expect.poll(() => fixture.writes.length).toBe(1);
  fixture.release(503);
  await expect(favorite(page, "/explore")).toBeEnabled();
  expect(fixture.saved.has("alpha")).toBe(false);
  await favorite(page, "/explore").click();
  await expect(favorite(page, "/explore", "alpha", true)).toBeEnabled();
  await expect.poll(() => fixture.saved.has("alpha")).toBe(true);
  expect(fixture.writes).toEqual([{ id: "alpha", method: "POST" }, { id: "alpha", method: "POST" }]);
});

test("another team can be saved while the first team is pending", async ({ page }) => {
  const fixture = await openTeams(page);
  try {
    await favorite(page, "/explore").click();
    await expect.poll(() => fixture.writes.length).toBe(1);
    await favorite(page, "/explore", "beta").click();
    await expect.poll(() => fixture.saved.has("beta")).toBe(true);
    await expect(favorite(page, "/explore", "beta", true)).toBeEnabled();
    fixture.release();
    await expect(favorite(page, "/explore", "alpha", true)).toBeEnabled();
    expect([...fixture.saved].sort()).toEqual(["alpha", "beta"]);
  } finally { fixture.release(); }
});
