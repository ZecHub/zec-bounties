/**
 * Shared identity matcher for admin user / bounty search.
 * nickname is the unique handle (usually GitHub login).
 */

function userIdentityWhere(q) {
  if (typeof q !== "string") return null;
  const term = q
    .replace(/[%_]/g, "")
    .trim()
    .slice(0, 40)
    .trim();
  if (term.length < 2) return null;
  return {
    OR: [
      { nickname: { contains: term, mode: "insensitive" } },
      { name: { contains: term, mode: "insensitive" } },
      { discordUsername: { contains: term, mode: "insensitive" } },
      { discordGlobalName: { contains: term, mode: "insensitive" } },
    ],
  };
}

function bountyInvolvesUserWhere(userWhere) {
  if (
    !userWhere ||
    typeof userWhere !== "object" ||
    Array.isArray(userWhere) ||
    Object.keys(userWhere).length === 0
  ) {
    return null;
  }
  return {
    OR: [
      { createdByUser: userWhere },
      { assigneeUser: userWhere },
      { assignees: { some: { user: userWhere } } },
      { applications: { some: { applicantUser: userWhere } } },
    ],
  };
}

module.exports = { userIdentityWhere, bountyInvolvesUserWhere };
