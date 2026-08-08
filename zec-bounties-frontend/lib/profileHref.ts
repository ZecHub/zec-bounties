export function profileHref(user: {
  id: string;
  name?: string | null;
  nickname?: string | null;
}) {
  const candidates = [user.nickname, user.name];
  for (const c of candidates) {
    const slug = c?.trim();
    if (slug && /^[a-zA-Z0-9_-]+$/.test(slug)) {
      return `/users/${slug}`;
    }
  }
  return `/users/${user.id}`;
}