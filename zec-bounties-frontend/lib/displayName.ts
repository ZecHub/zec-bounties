export interface DisplayNameUser {
  nickname?: string | null;
  name?: string | null;
}

export function displayName(user?: DisplayNameUser | null): string {
  return user?.nickname || user?.name || "User";
}
