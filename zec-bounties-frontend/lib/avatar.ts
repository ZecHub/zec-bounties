const PALETTE = [
  "#7F77DD",
  "#1D9E75",
  "#D85A30",
  "#185FA5",
  "#BA7517",
  "#993556",
  "#639922",
  "#853535",
];

export function nameToColor(name: string | null | undefined): string {
  const safeName = typeof name === "string" ? name : "";
  let h = 0;
  for (let i = 0; i < safeName.length; i++) {
    h = (h * 31 + safeName.charCodeAt(i)) & 0xffffffff;
  }
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function firstChar(part: string): string {
  return Array.from(part)[0] ?? "";
}

export function nameToInitials(name: string | null | undefined): string {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return firstChar(parts[0]).toUpperCase() || "?";
  return (firstChar(parts[0]) + firstChar(parts[parts.length - 1])).toUpperCase() || "?";
}
