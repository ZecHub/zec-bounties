// RSS 2.0 feed of open bounties: /feed.xml
//
// Built by hand rather than with a feed library. The markup is twenty lines and
// adding a dependency to someone else's project should buy more than that.

import {
  FEED_DESCRIPTION,
  FEED_REVALIDATE_SECONDS,
  FEED_TITLE,
  bountyUrl,
  backendUnavailable,
  escapeXml,
  feedHeaders,
  fetchFeedBounties,
  summaryFor,
  toRfc822,
} from "@/lib/feeds";

export const revalidate = FEED_REVALIDATE_SECONDS;

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;

  let bounties;
  try {
    bounties = await fetchFeedBounties();
  } catch {
    return backendUnavailable();
  }

  const items = bounties
    .map((b) => {
      const link = bountyUrl(origin, b.id);
      return [
        "    <item>",
        `      <title>${escapeXml(b.title ?? "Untitled bounty")}</title>`,
        `      <link>${escapeXml(link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `      <pubDate>${toRfc822(b.dateCreated)}</pubDate>`,
        `      <description>${escapeXml(summaryFor(b))}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(FEED_TITLE)}</title>`,
    `    <link>${escapeXml(origin)}</link>`,
    `    <description>${escapeXml(FEED_DESCRIPTION)}</description>`,
    "    <language>en</language>",
    `    <lastBuildDate>${toRfc822(bounties[0]?.dateCreated)}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(`${origin}/feed.xml`)}" rel="self" type="application/rss+xml" />`,
    items,
    "  </channel>",
    "</rss>",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return new Response(xml, { headers: feedHeaders("application/rss+xml") });
}
