import { SiZcash } from "react-icons/si";

// Zcash brand yellow
export const ZCASH_YELLOW = "#F4B728";
export const ZCASH_YELLOW_DARK = "#1a1a1a";

export function ZecIcon({
  className = "h-4 w-4",
  filled = true,
}: {
  className?: string;
  filled?: boolean;
}) {
  // Filled = yellow badge with dark glyph (like a token chip); otherwise glyph only
  if (!filled) {
    return (
      <SiZcash
        className={className}
        style={{ color: ZCASH_YELLOW }}
        aria-label="ZEC"
      />
    );
  }
  return (
    <SiZcash className="h-[70%] w-[70%]" style={{ color: ZCASH_YELLOW }} />
  );
}
