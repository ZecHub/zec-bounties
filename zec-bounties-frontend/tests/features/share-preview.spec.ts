import { expect, test } from "@playwright/test";

// Share previews have to be in the HTML the SERVER sends, because the crawlers
// that read them — X, Discord, Telegram, Slack — do not run JavaScript. So
// every assertion here reads the raw response body rather than a rendered page.
// Using page.goto() would pass even if the tags were added by client code,
// which is precisely the bug being fixed.

test.describe("share previews", () => {
  test("the site has a default title to fall back to", async ({ request }) => {
    const html = await (await request.get("/")).text();
    expect(html).toContain("ZEC Bounties");
  });

  test("a bounty page carries server-rendered Open Graph tags", async ({ request }) => {
    // Find a real bounty through the public feed rather than hardcoding an id.
    const feedRes = await request.get("/feed.json");
    test.skip(
      feedRes.status() !== 200,
      "backend unreachable, so there is no bounty to preview",
    );

    const feed = await feedRes.json();
    test.skip(!feed.items?.length, "no open bounties to preview");

    const url: string = feed.items[0].url;
    const path = new URL(url).pathname;

    const res = await request.get(path);
    expect(res.status()).toBe(200);
    const html = await res.text();

    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:description"');
    // summary_large_image is what makes X render a card rather than a thumbnail.
    expect(html).toContain("summary_large_image");
    expect(html).toContain("og:image");
  });

  test("an unknown bounty id still renders without error", async ({ request }) => {
    // Falls back to the site defaults. The page must not 500 just because a
    // link was mistyped.
    const res = await request.get("/bounty/does-not-exist-000000");
    expect(res.status()).toBeLessThan(500);
    expect(await res.text()).toContain("ZEC Bounties");
  });

  test("the generated preview image responds as a PNG", async ({ request }) => {
    const res = await request.get("/bounty/does-not-exist-000000/opengraph-image");
    // Even for an unknown id this renders the fallback card rather than failing.
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  });
});
