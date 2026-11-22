import { SiZcash } from "react-icons/si";

// Zcash brand yellow
export const ZCASH_YELLOW = "#F4B728";
export const ZCASH_YELLOW_DARK = "#1a1a1a";

/**
 * Zcash glyph in brand yellow.
 *
 * Size comes from `size` (px, exact) or `className` ("h-5 w-5"). It no longer
 * uses percentage sizing, so the icon looks the same next to "1" as next to
 * "10.5".
 */
export function ZecIcon({
  className = "h-4 w-4",
  size,
}: {
  className?: string;
  size?: number;
  /** kept so existing <ZecIcon filled={...} /> calls still compile */
  filled?: boolean;
}) {
  return (
    <SiZcash
      className={`flex-none shrink-0 ${size ? "" : className}`}
      size={size}
      style={{
        color: ZCASH_YELLOW,
        ...(size
          ? { width: size, height: size, minWidth: size, minHeight: size }
          : null),
      }}
      aria-label="ZEC"
    />
  );
}
