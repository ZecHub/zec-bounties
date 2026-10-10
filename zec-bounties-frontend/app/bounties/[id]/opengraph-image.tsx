// Generated share image for /bounties/[id].
//
// File-based metadata: Next wires this into og:image and twitter:image for the
// segment automatically, so generateMetadata does not mention it.

import { fetchBountyPreview } from "@/lib/bountyMeta";
import { OG_CONTENT_TYPE, OG_SIZE, renderBountyOg } from "@/lib/bountyOgImage";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Bounty on ZEC Bounties";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderBountyOg(await fetchBountyPreview(id));
}
