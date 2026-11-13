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

// Earnings go to the paid assignee only. Marking a multi-assignee bounty Done
// keeps every roster row but sets `assignee` to the winner, who is paid.
function earnedDoneWhere(userId, chain) {
  return { status: "DONE", chain, assignee: userId };
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
  earnedDoneWhere,
  recentCompletedWhere,
  recentCreatedWhere,
};
