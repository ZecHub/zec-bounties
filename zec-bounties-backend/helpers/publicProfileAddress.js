// The public profile (GET /users/:idOrNickname/public) may advertise the KIND
// of address a contributor uses (the showAddressType toggle), but the raw
// address STRING is sensitive: it links a pseudonymous profile to an on-chain
// ZEC receiver. So the raw UA_address/z_address is returned only to the profile
// owner or an admin; every other viewer gets just the coarse
// addressType/hasUnifiedAddress/hasShieldedAddress flags.
//
// Returns the address fields to merge into the public profile object (empty for
// anyone who is neither the owner nor an admin). Prefers the unified address.
//
// @param {{ UA_address?: string|null, z_address?: string|null }} user
// @param {{ isOwner?: boolean, isAdmin?: boolean }} viewer
// @returns {{ UA_address?: string } | { z_address?: string } | {}}
function rawAddressFields(user, { isOwner = false, isAdmin = false } = {}) {
  if (!user || !(isOwner || isAdmin)) return {};
  if (user.UA_address) return { UA_address: user.UA_address };
  if (user.z_address) return { z_address: user.z_address };
  return {};
}

module.exports = { rawAddressFields };
