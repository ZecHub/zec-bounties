// A private team's bounty board is members-only. A self-service favourite must
// NOT substitute for membership: POST /:teamId/favorite has no privacy/
// membership gate, so treating a favourite ("community") as access let any
// hunter read any private team's bounties. Only a global admin or an actual
// member of the team may access a private team; public teams are open to all
// (their bounties are public anyway).
//
// @param {{ isPrivate?: boolean, isAdmin?: boolean, isMember?: boolean }} ctx
// @returns {boolean}
function canAccessTeamBoard({ isPrivate = false, isAdmin = false, isMember = false } = {}) {
  if (!isPrivate) return true;
  return Boolean(isAdmin || isMember);
}

module.exports = { canAccessTeamBoard };
