import { expect, test } from "@playwright/test";

import {
  escapeXml,
  formatReward,
  isFeedEligible,
  statusLabel,
  summaryFor,
  toRfc822,
} from "../../lib/feeds";

// Two kinds of test here, on purpose.
//
// The pure-function tests need nothing running and are where the real rules
// live: which bounties a public feed may carry, and how creator-written text
// is escaped. These must always run.
//
// The HTTP tests check the contract the routes promise. They assert BOTH
// possible honest answers — a feed, or a 503 when the backend is unreachable —
// because the backend is a separate service that will often not be running
// alongside the frontend. What they never tolerate is a 200 carrying a broken
// document.

test.describe("feed eligibility", () => {
  const base = { id: "x", title: "T", status: "TO_DO", isApproved: true, isPrivate: false };

  test("accepts an open, approved, public bounty", () => {
    expect(isFeedEligible(base)).toBe(true);
  });

  test("rejects a private bounty", () => {
    // The single most important assertion in this file. A private bounty in a
    // public feed cannot be un-syndicated.
    expect(isFeedEligible({ ...base, isPrivate: true })).toBe(false);
  });

  test("rejects an unapproved bounty", () => {
    expect(isFeedEligible({ ...base, isApproved: false })).toBe(false);
    expect(isFeedEligible({ ...base, isApproved: null })).toBe(false);
  });

  test("rejects anything not open", () => {
    for (const status of ["IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]) {
      expect(isFeedEligible({ ...base, status })).toBe(false);
    }
  });

  test("rejects a bounty with no status", () => {
    expect(isFeedEligible({ ...base, status: null })).toBe(false);
  });
});

test.describe("escaping and formatting", () => {
  test("escapes the characters that break XML", () => {
    expect(escapeXml('Fix & "quote" <tag>')).toBe(
      "Fix &amp; &quot;quote&quot; &lt;tag&gt;",
    );
  });

  test("strips control characters XML forbids", () => {
    expect(escapeXml("a\u0000b\u0008c")).toBe("abc");
  });

  test("writes a reward without trailing zeros", () => {
    expect(formatReward(0.1)).toBe("0.1 ZEC");
    expect(formatReward(0.035)).toBe("0.035 ZEC");
  });

  test("does not invent a reward it does not have", () => {
    expect(formatReward(null)).toBe("Unspecified reward");
    expect(formatReward(Number.NaN)).toBe("Unspecified reward");
  });

  test("labels TO_DO as open", () => {
    expect(statusLabel("TO_DO")).toBe("Open");
  });

  test("passes an unknown status through rather than hiding it", () => {
    expect(statusLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });

  test("summarises reward, status and deadline", () => {
    const s = summaryFor({
      id: "x",
      title: "T",
      bountyAmount: 0.1,
      status: "TO_DO",
      timeToComplete: "2026-10-15T00:00:00.000Z",
    });
    expect(s).toContain("0.1 ZEC");
    expect(s).toContain("Open");
    expect(s).toContain("2026-10-15");
  });

  test("produces an RFC 822 date for RSS", () => {
    expect(toRfc822("2026-10-07T12:00:00.000Z")).toBe("Wed, 07 Oct 2026 12:00:00 GMT");
  });

  test("falls back to now rather than emitting an invalid date", () => {
    expect(Number.isNaN(new Date(toRfc822("not a date")).getTime())).toBe(false);
  });
});

test.describe("feed routes", () => {
  test("/feed.xml serves RSS or an honest 503", async ({ request }) => {
    const res = await request.get("/feed.xml");
    if (res.status() === 503) {
      expect(await res.text()).toContain("unavailable");
      return;
    }
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/rss+xml");

    const xml = await res.text();
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain("<rss version=\"2.0\"");
    expect(xml).toContain("</rss>");
    // Equal numbers of opening and closing item tags: a truncated document is
    // the failure a reader reports as "feed is broken".
    expect((xml.match(/<item>/g) ?? []).length).toBe((xml.match(/<\/item>/g) ?? []).length);
  });

  test("/atom.xml serves Atom or an honest 503", async ({ request }) => {
    const res = await request.get("/atom.xml");
    if (res.status() === 503) return;
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/atom+xml");

    const xml = await res.text();
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect(xml).toContain("</feed>");
    expect((xml.match(/<entry>/g) ?? []).length).toBe((xml.match(/<\/entry>/g) ?? []).length);
  });

  test("/feed.json serves JSON Feed 1.1 or an honest 503", async ({ request }) => {
    const res = await request.get("/feed.json");
    if (res.status() === 503) return;
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/feed+json");

    const feed = await res.json();
    expect(feed.version).toBe("https://jsonfeed.org/version/1.1");
    expect(Array.isArray(feed.items)).toBe(true);
    for (const item of feed.items) {
      expect(typeof item.id).toBe("string");
      expect(item.url).toContain("/bounty/");
      expect(typeof item.title).toBe("string");
    }
  });

  test("the three feeds are discoverable from the homepage", async ({ request }) => {
    const html = await (await request.get("/")).text();
    expect(html).toContain("/feed.xml");
    expect(html).toContain("/atom.xml");
    expect(html).toContain("/feed.json");
  });
});
