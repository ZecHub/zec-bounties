/**
 * Shared identity matcher for admin user / bounty search.
 * nickname is the unique handle (usually GitHub login).
 */

function userIdentityWhere(q) {
  const term = String(q || "")
    .trim()
    .slice(0, 40)
    .replace(/[%_]/g, "");
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
  if (!userWhere) return null;
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
