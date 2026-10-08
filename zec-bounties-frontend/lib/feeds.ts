// Shared plumbing for the RSS, Atom and JSON feeds.
//
// One module so the three feeds cannot disagree about which bounties are
// public, how a reward is written, or what a status is called. They differ
// only in markup.

import { backendUrl } from "@/lib/configENV";

/**
 * Only the fields the feeds read.
 *
 * Deliberately not the full `Bounty` type from lib/types: that describes what
 * the client context holds after its own massaging, while this describes what
 * GET /api/bounties actually puts on the wire. Keeping them separate means a
 * change to one cannot silently misrepresent the other.
 */
export interface FeedBounty {
  id: string;
  title: string;
  description?: string | null;
  bountyAmount?: number | null;
  timeToComplete?: string | null;
  dateCreated?: string | null;
  status?: string | null;
  isApproved?: boolean | null;
  isPrivate?: boolean | null;
}

/** How many entries a feed carries. Enough to be useful, short enough to stay small. */
export const FEED_LIMIT = 30;

/** Page size of the backend list endpoint; it caps requests at 50. */
const PAGE_SIZE = 50;

/** Give up after this many pages rather than walking an entire board. */
const MAX_PAGES = 3;

/** Feeds are public, so they are cached rather than recomputed per subscriber. */
export const FEED_REVALIDATE_SECONDS = 300;

/** The board's own words for a status. TO_DO is what the UI presents as open. */
export const STATUS_LABELS: Record<string, string> = {
  TO_DO: "Open",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

export function statusLabel(status?: string | null): string {
  if (!status) return "Unknown";
  return STATUS_LABELS[status] ?? status;
}

/**
 * Is this bounty one the feeds may carry?
 *
 * Open, approved, public, and (by virtue of the chain=MAIN request) mainnet.
 *
 * The backend already excludes private bounties for an anonymous caller, and
 * the feeds are anonymous, so in practice `isPrivate` never arrives true here.
 * The check stays anyway: a syndicated feed is the worst possible place to
 * discover that assumption had stopped holding, and the cost is one comparison.
 */
export function isFeedEligible(b: FeedBounty): boolean {
  return b.status === "TO_DO" && b.isApproved === true && b.isPrivate !== true;
}

/**
 * Fetch the newest eligible bounties, newest first.
 *
 * The list endpoint cannot filter on status or approval, so this pages through
 * it and filters here, stopping as soon as it has enough. The endpoint already
 * orders by dateCreated desc, so the first match is the newest.
 *
 * Throws if the backend is unreachable. Callers answer with 503 rather than an
 * empty feed — see the route handlers for why.
 */
export async function fetchFeedBounties(): Promise<FeedBounty[]> {
  const out: FeedBounty[] = [];

  for (let page = 1; page <= MAX_PAGES && out.length < FEED_LIMIT; page++) {
    const url = `${backendUrl}/api/bounties?chain=MAIN&page=${page}&limit=${PAGE_SIZE}`;
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      next: { revalidate: FEED_REVALIDATE_SECONDS },
    });
    if (!res.ok) throw new Error(`backend responded ${res.status} for ${url}`);

    const body = (await res.json()) as { data?: FeedBounty[] };
    const batch = Array.isArray(body?.data) ? body.data : [];
    out.push(...batch.filter(isFeedEligible));

    // A short page means there is nothing after it.
    if (batch.length < PAGE_SIZE) break;
  }

  return out.slice(0, FEED_LIMIT);
}

/**
 * Escape text for XML content and attributes.
 *
 * Both feeds carry creator-written titles and descriptions, so this is the
 * boundary where a stray `&` or `<` stops being a character and starts being
 * malformed markup that a reader rejects outright. Control characters are
 * dropped because XML 1.0 forbids them and some readers hard-fail on them.
 */
export function escapeXml(input: string): string {
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Reward as the board writes it. */
export function formatReward(amount?: number | null): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "Unspecified reward";
  // Trim trailing zeros so 0.1000 reads as 0.1, matching the board's cards.
  const trimmed = String(Number(amount.toFixed(4)));
  return `${trimmed} ZEC`;
}

/** A date a human can read, or null if it is missing or junk. */
export function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** RFC 822, which RSS 2.0 requires for pubDate. */
export function toRfc822(value?: string | null): string {
  const d = value ? new Date(value) : new Date();
  return (Number.isNaN(d.getTime()) ? new Date() : d).toUTCString();
}

/** ISO 8601, which Atom and JSON Feed require. */
export function toIso(value?: string | null): string {
  const d = value ? new Date(value) : new Date();
  return (Number.isNaN(d.getTime()) ? new Date() : d).toISOString();
}

/**
 * The canonical public link for a bounty.
 *
 * /bounty/<id> rather than /bounties/<id>: the short route is what gets shared,
 * and it is the one that carries share metadata.
 */
export function bountyUrl(origin: string, id: string): string {
  return `${origin}/bounty/${id}`;
}

/** One-line summary used as the feed entry body. */
export function summaryFor(b: FeedBounty): string {
  const parts = [`Reward: ${formatReward(b.bountyAmount)}`, `Status: ${statusLabel(b.status)}`];
  const due = formatDate(b.timeToComplete);
  if (due) parts.push(`Deadline: ${due}`);

  const desc = (b.description ?? "").trim().replace(/\s+/g, " ");
  const trimmed = desc.length > 400 ? `${desc.slice(0, 399)}…` : desc;

  return trimmed ? `${parts.join(" · ")}\n\n${trimmed}` : parts.join(" · ");
}

export const FEED_TITLE = "ZEC Bounties — open bounties";
export const FEED_DESCRIPTION =
  "Open, approved bounties on ZEC Bounties, paid in shielded ZEC.";

/**
 * Headers every feed shares.
 *
 * Cached at the edge for the same window the fetch is revalidated on, so a
 * popular feed costs one backend read per window rather than one per reader.
 */
export function feedHeaders(contentType: string): HeadersInit {
  return {
    "content-type": `${contentType}; charset=utf-8`,
    "cache-control": `public, s-maxage=${FEED_REVALIDATE_SECONDS}, stale-while-revalidate=600`,
  };
}

/**
 * What to answer when the backend is down.
 *
 * Not an empty feed: several readers treat an empty document as "every item
 * was deleted" and will drop the bounties a subscriber already has. A 503 is
 * the honest answer and readers retry it.
 */
export function backendUnavailable(): Response {
  return new Response("Bounty feed temporarily unavailable\n", {
    status: 503,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
