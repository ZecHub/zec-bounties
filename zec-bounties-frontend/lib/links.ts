export const MAX_LINKS = 5;

// Deliverable links are stored newline-separated in the deliverableUrl column
export const parseLinks = (s?: string | null) =>
  (s ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

export const splitLinks = (s?: string | null) => {
  const links = parseLinks(s);
  return links.length ? links : [""];
};

export const joinLinks = (links: string[]) =>
  links
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
