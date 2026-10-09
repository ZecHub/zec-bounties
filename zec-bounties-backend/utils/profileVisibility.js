const DEFAULT_VISIBILITY = {
  showAvatar: true,
  showDisplayName: true,
  showBio: false,
  showBadges: false,
  showCompleted: false,
  showCreated: false,
  showEarnings: false,
  showCompletionRate: false,
  showAddressType: false,
  showMemberSince: false,
  showRecentBounties: false,
  showRole: false,
  showGithub: false,
};

const VISIBILITY_KEYS = Object.keys(DEFAULT_VISIBILITY);

function mergeVisibility(raw) {
  const incoming =
    raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out = { ...DEFAULT_VISIBILITY };

  for (const key of VISIBILITY_KEYS) {
    if (typeof incoming[key] === "boolean") {
      out[key] = incoming[key];
    }
  }

  return out;
}

module.exports = {
  DEFAULT_VISIBILITY,
  VISIBILITY_KEYS,
  mergeVisibility,
};