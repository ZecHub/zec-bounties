// Atom 1.0 feed of open bounties: /atom.xml
//
// Atom alongside RSS because some readers and bots accept only one of the two,
// and the listing asks for both.

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
  toIso,
} from "@/lib/feeds";

export const revalidate = FEED_REVALIDATE_SECONDS;

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const self = `${origin}/atom.xml`;

  let bounties;
  try {
    bounties = await fetchFeedBounties();
  } catch {
    return backendUnavailable();
  }

  const entries = bounties
    .map((b) => {
      const link = bountyUrl(origin, b.id);
      return [
        "  <entry>",
        `    <title>${escapeXml(b.title ?? "Untitled bounty")}</title>`,
        `    <link href="${escapeXml(link)}" />`,
        // The id must be a stable permanent identifier, so it is the URL rather
        // than the raw cuid: a reader that sees both feeds treats them as one item.
        `    <id>${escapeXml(link)}</id>`,
        `    <updated>${toIso(b.dateCreated)}</updated>`,
        `    <summary>${escapeXml(summaryFor(b))}</summary>`,
        "  </entry>",
      ].join("\n");
    })
    .join("\n");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <title>${escapeXml(FEED_TITLE)}</title>`,
    `  <subtitle>${escapeXml(FEED_DESCRIPTION)}</subtitle>`,
    `  <link href="${escapeXml(self)}" rel="self" />`,
    `  <link href="${escapeXml(origin)}" />`,
    `  <id>${escapeXml(`${origin}/`)}</id>`,
    `  <updated>${toIso(bounties[0]?.dateCreated)}</updated>`,
    entries,
    "</feed>",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return new Response(xml, { headers: feedHeaders("application/atom+xml") });
}
