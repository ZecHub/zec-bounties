// Fetch a single bounty on the server, for share previews.
//
// This runs for crawlers — X, Discord, Telegram, Slack — which arrive with no
// session. That shapes every decision here.

import { backendUrl } from "@/lib/configENV";
import {
  type FeedBounty,
  FEED_REVALIDATE_SECONDS,
  formatDate,
  formatReward,
  statusLabel,
} from "@/lib/feeds";

export interface BountyPreview {
  id: string;
  title: string;
  reward: string;
  status: string;
  deadline: string | null;
  description: string;
}

/**
 * Fetch a bounty as an anonymous caller sees it, or null.
 *
 * Never throws. A preview is decoration: if the backend is down or the id is
 * wrong, the page must still render with the site's default metadata rather
 * than failing to build.
 *
 * Privacy: GET /api/bounties/:id answers 404 for a private bounty when the
 * request carries no session, and this request deliberately carries none. The
 * isPrivate check below is therefore redundant today and kept anyway — a
 * private bounty's title rendered into an Open Graph card would be cached and
 * displayed by every chat app the link was pasted into, which is not a mistake
 * that can be taken back.
 */
export async function fetchBountyPreview(id: string): Promise<BountyPreview | null> {
  if (!id) return null;

  try {
    const res = await fetch(`${backendUrl}/api/bounties/${encodeURIComponent(id)}`, {
      headers: { accept: "application/json" },
      next: { revalidate: FEED_REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;

    // This endpoint returns the bounty itself, not a { data } envelope as the
    // list endpoint does. Not a detail to assume.
    const b = (await res.json()) as FeedBounty | null;
    if (!b || typeof b.id !== "string") return null;
    if (b.isPrivate === true) return null;

    const description = (b.description ?? "").trim().replace(/\s+/g, " ");

    return {
      id: b.id,
      title: (b.title ?? "").trim() || "Untitled bounty",
      reward: formatReward(b.bountyAmount),
      status: statusLabel(b.status),
      deadline: formatDate(b.timeToComplete),
      description: description.length > 200 ? `${description.slice(0, 199)}…` : description,
    };
  } catch {
    return null;
  }
}

/** The one-line summary that becomes og:description. */
export function previewDescription(p: BountyPreview): string {
  const facts = [p.reward, p.status];
  if (p.deadline) facts.push(`due ${p.deadline}`);
  const head = facts.join(" · ");
  return p.description ? `${head} — ${p.description}` : head;
}
