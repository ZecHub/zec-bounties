import type { Team } from "@/lib/types";

export function getUserRole(
  team: Team,
  userId: string,
  isGlobalAdmin: boolean,
): string {
  const member = team.members.find((m) => m.userId === userId);
  if (member) return member.role;
  return isGlobalAdmin ? "ADMIN" : "MEMBER";
}
