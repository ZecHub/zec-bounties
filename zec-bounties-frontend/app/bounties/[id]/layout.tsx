// Server-rendered share metadata for /bounties/[id], the full bounty page.
//
// A layout rather than the page: page.tsx is "use client", and Next cannot export generateMetadata from a
// client component. The canonical URL still points at /bounty/<id> so both
// routes share one identity when a link is reposted.
//
// Without this, a link pasted into X, Discord or Telegram shows the site-wide
// title and nothing about the bounty, because the crawler never runs the
// client code that would have filled the page in.

import type { Metadata } from "next";
import { fetchBountyPreview, previewDescription } from "@/lib/bountyMeta";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const preview = await fetchBountyPreview(id);

  // Missing, private, or the backend is down: fall back to the site defaults
  // from the root layout rather than inventing anything.
  if (!preview) return {};

  const description = previewDescription(preview);
  const url = `/bounty/${preview.id}`;

  return {
    title: preview.title,
    description,
    openGraph: {
      title: preview.title,
      description,
      url,
      type: "article",
      siteName: "ZEC Bounties",
    },
    twitter: {
      // Without this X renders a small thumbnail instead of the card.
      card: "summary_large_image",
      title: preview.title,
      description,
    },
    alternates: { canonical: url },
  };
}

export default function BountyMetadataLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
