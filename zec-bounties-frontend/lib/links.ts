// A submission can hold several deliverable links separated by spaces,
// commas or newlines. Only http(s) links are returned, so other schemes
// such as javascript: never become an href.
export function parseLinks(value: string | null | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split(/[\s,]+/))].filter((part) => {
    try {
      const { protocol } = new URL(part);
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  });
}
