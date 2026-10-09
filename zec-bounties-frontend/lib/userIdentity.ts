/** Client-side identity helpers for admin bounty search. */

export function parseUserSearchQuery(raw: string): {
  text: string;
  user: string | null;
} {
  const q = String(raw || "").trim().slice(0, 40);
  if (!q) return { text: "", user: null };

  const prefixed = q.match(/^(?:user:|@)(\S+)/i);
  if (prefixed) {
    return { text: "", user: prefixed[1] };
  }

  // Bare handle: no spaces, looks like a login.
  if (/^[A-Za-z0-9._-]{2,40}$/.test(q)) {
    return { text: q, user: q };
  }

  return { text: q, user: null };
}

function haystack(user?: {
  name?: string | null;
  nickname?: string | null;
  discordUsername?: string | null;
  discordGlobalName?: string | null;
} | null): string {
  if (!user) return "";
  return [
    user.name,
    user.nickname,
    user.discordUsername,
    user.discordGlobalName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function bountyMatchesQuery(
  bounty: {
    title?: string | null;
    description?: string | null;
    createdByUser?: {
      name?: string | null;
      nickname?: string | null;
      discordUsername?: string | null;
      discordGlobalName?: string | null;
    } | null;
    assigneeUser?: {
      name?: string | null;
      nickname?: string | null;
      discordUsername?: string | null;
      discordGlobalName?: string | null;
    } | null;
    assignees?: Array<{
      user?: {
        name?: string | null;
        nickname?: string | null;
        discordUsername?: string | null;
        discordGlobalName?: string | null;
      } | null;
    }>;
  },
  raw: string,
): boolean {
  const { text, user } = parseUserSearchQuery(raw);
  const needles = [text, user].filter(Boolean).map((s) => s!.toLowerCase());
  if (needles.length === 0) return true;

  const people = [
    haystack(bounty.createdByUser),
    haystack(bounty.assigneeUser),
    ...(bounty.assignees || []).map((row) => haystack(row.user)),
  ].join(" ");

  const blob = `${bounty.title || ""} ${bounty.description || ""} ${people}`.toLowerCase();
  return needles.every((n) => blob.includes(n));
}
