// JSON Feed 1.1 of open bounties: /feed.json
//
// The listing asks for a JSON feed so bots do not have to parse XML. JSON Feed
// rather than an ad-hoc shape, because it is a published spec with existing
// reader support and costs nothing extra to follow.

import {
  FEED_DESCRIPTION,
  FEED_REVALIDATE_SECONDS,
  FEED_TITLE,
  bountyUrl,
  backendUnavailable,
  feedHeaders,
  fetchFeedBounties,
  formatReward,
  statusLabel,
  summaryFor,
  toIso,
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

  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: FEED_TITLE,
    description: FEED_DESCRIPTION,
    home_page_url: origin,
    feed_url: `${origin}/feed.json`,
    language: "en",
    items: bounties.map((b) => ({
      id: bountyUrl(origin, b.id),
      url: bountyUrl(origin, b.id),
      title: b.title ?? "Untitled bounty",
      content_text: summaryFor(b),
      date_published: toIso(b.dateCreated),
      // Not part of the spec's required fields, but the whole point of a JSON
      // feed here is that a bot can act on it without scraping the summary.
      _zec_bounties: {
        reward: formatReward(b.bountyAmount),
        reward_zec: typeof b.bountyAmount === "number" ? b.bountyAmount : null,
        status: statusLabel(b.status),
        deadline: b.timeToComplete ? toIso(b.timeToComplete) : null,
      },
    })),
  };

  return new Response(JSON.stringify(feed, null, 2), {
    headers: feedHeaders("application/feed+json"),
  });
}
