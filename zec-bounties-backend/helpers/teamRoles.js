/**
 * Team membership roles.
 *
 * OWNER is deliberately NOT in the set a member-management route may assign.
 * Ownership is established at team creation and only ever moves via an
 * explicit, owner-initiated transfer — never by a team admin setting a role.
 * Allowing OWNER here let any team ADMIN (who passes requireTeamAdmin) promote
 * themselves to OWNER and take over the team.
 */
const SETTABLE_MEMBER_ROLES = ["ADMIN", "MEMBER"];

function isSettableMemberRole(role) {
  return SETTABLE_MEMBER_ROLES.includes(role);
}

module.exports = { SETTABLE_MEMBER_ROLES, isSettableMemberRole };
