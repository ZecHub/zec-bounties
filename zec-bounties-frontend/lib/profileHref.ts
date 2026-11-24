// The public profile route resolves /users/<key> by id or by the unique
// nickname, never by display name. Nicknames may contain dots ("alice.1234"
// is what a second GitHub "alice" signs up as), so they are used as is.
export function profileHref(user: { id: string; nickname?: string | null }) {
  const nickname = user.nickname?.trim();
  // "." and ".." would be read as path segments by the browser.
  if (nickname && nickname !== "." && nickname !== "..") {
    return `/users/${encodeURIComponent(nickname)}`;
  }
  return `/users/${encodeURIComponent(user.id)}`;
}
