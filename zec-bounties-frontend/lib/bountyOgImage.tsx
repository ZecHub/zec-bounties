// The generated share image for a bounty.
//
// Rendered with next/og, which is part of Next and needs no dependency. Satori
// backs it and supports only a subset of CSS: flexbox, no grid, every element
// with more than one child needs an explicit display. Kept deliberately plain
// for that reason — this has to render identically on a server with no fonts
// installed and no browser.

import { ImageResponse } from "next/og";
import type { BountyPreview } from "@/lib/bountyMeta";

/** The size every major platform crops from. */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const BG = "#0b0f14";
const FG = "#f5f7fa";
const MUTED = "#93a4b8";
const ACCENT = "#f4b728"; // Zcash yellow

/**
 * Render the card.
 *
 * `preview` is null when the bounty is missing, private, or the backend is
 * unreachable, and the image falls back to a plain branded card. A broken
 * image in a chat app looks worse than a generic one.
 */
export function renderBountyOg(preview: BountyPreview | null): ImageResponse {
  if (!preview) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: BG,
            color: FG,
            fontSize: 64,
            fontWeight: 700,
          }}
        >
          ZEC Bounties
        </div>
      ),
      OG_SIZE,
    );
  }

  const facts = [preview.reward, preview.status];
  if (preview.deadline) facts.push(`Due ${preview.deadline}`);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BG,
          color: FG,
          padding: 64,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 28, color: MUTED }}>
          ZEC Bounties
        </div>

        <div
          style={{
            display: "flex",
            fontSize: preview.title.length > 70 ? 54 : 68,
            fontWeight: 700,
            lineHeight: 1.15,
            // Satori has no line-clamp; the title is trimmed upstream instead.
          }}
        >
          {preview.title}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              display: "flex",
              fontSize: 44,
              fontWeight: 700,
              color: ACCENT,
            }}
          >
            {preview.reward}
          </div>
          <div style={{ display: "flex", fontSize: 30, color: MUTED }}>
            {facts.slice(1).join("  ·  ")}
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
