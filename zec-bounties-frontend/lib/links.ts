export const MAX_LINKS = 5;

export function isHttpUrl(part: string): boolean {
  try {
    const { protocol } = new URL(part);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

// A submission can hold several deliverable links separated by spaces,
// commas or newlines. Only http(s) links are returned, so other schemes
// such as javascript: never become an href.
export function parseLinks(value: string | null | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split(/[\s,]+/))].filter(isHttpUrl);
}

// Seeds the input list from a stored value
export const splitLinks = (value?: string | null) => {
  const links = parseLinks(value);
  return links.length ? links : [""];
};

// Storage format: one valid link per line, deduped
export const joinLinks = (fields: string[]) =>
  parseLinks(fields.join("\n")).join("\n");

// True if any non-empty token in the raw input isn't a valid http(s) URL
export const hasInvalidLinks = (fields: string[]) =>
  fields
    .join("\n")
    .split(/[\s,]+/)
    .filter(Boolean)
    .some((t) => !isHttpUrl(t));

export type DeliverableLinkValidationError = "invalid" | "too_many";

// Validation shared by initial submission and later edits. Empty input is
// allowed here because the API treats deliverableUrl as optional; callers that
// require a link for a new submission check that separately.
export function validateDeliverableLinks(
  fields: string[],
): DeliverableLinkValidationError | null {
  if (hasInvalidLinks(fields)) return "invalid";
  if (parseLinks(fields.join("\n")).length > MAX_LINKS) return "too_many";
  return null;
}
