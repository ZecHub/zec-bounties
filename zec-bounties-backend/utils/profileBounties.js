/**
 * Where clauses for the bounty lists and counts on a user profile.
 * The recent lists carry titles, so they leave private bounties out unless
 * the viewer may see them (profile owner or admin), the same rule the bounty
 * list and GET /api/bounties/:id apply.
 */

function assignedDoneWhere(userId, chain) {
  return {
    status: "DONE",
    chain,
    OR: [{ assignee: userId }, { assignees: { some: { userId } } }],
  };
}

function recentCompletedWhere(userId, chain, includePrivate) {
  return {
    ...assignedDoneWhere(userId, chain),
    ...(includePrivate ? {} : { isPrivate: false }),
  };
}

function recentCreatedWhere(userId, chain, includePrivate) {
  return {
    createdBy: userId,
    chain,
    ...(includePrivate ? {} : { isPrivate: false }),
  };
}

module.exports = {
  assignedDoneWhere,
  recentCompletedWhere,
  recentCreatedWhere,
};
