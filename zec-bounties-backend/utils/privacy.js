// Shared public-profile redaction.
// profileVisibility is the source of truth. Missing keys default false
// except showAvatar and showDisplayName, which default true (same as users.js).

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
  showDiscord: false,
};

function mergeVisibility(raw) {
  const incoming =
    raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out = { ...DEFAULT_VISIBILITY };
  for (const key of Object.keys(DEFAULT_VISIBILITY)) {
    if (typeof incoming[key] === "boolean") {
      out[key] = incoming[key];
    }
  }
  return out;
}

// Minimal identity object for cards and lists. forceFull skips redaction
// (admin or owner viewing their own data).
function redactPublicUser(user, { forceFull = false } = {}) {
  if (!user) return null;
  if (forceFull) {
    return {
      id: user.id,
      name: user.name ?? null,
      nickname: user.nickname ?? null,
      avatar: user.avatar ?? null,
    };
  }

  const vis = mergeVisibility(user.profileVisibility);
  const out = { id: user.id };

  if (vis.showDisplayName) {
    out.name = user.name ?? null;
    out.nickname = user.nickname ?? null;
  } else {
    out.name = "Anonymous contributor";
    out.nickname = null;
  }

  if (vis.showAvatar) {
    out.avatar = user.avatar ?? null;
  } else {
    out.avatar = null;
  }

  return out;
}

// Leaderboard row. Numeric fields are null when the corresponding flag is off
// so the client can distinguish "hidden" from zero. points is withheld unless
// both completed and earned are visible (points is derived from both).
function redactLeaderboardRow(row, user, { forceFull = false } = {}) {
  if (forceFull) {
    return {
      id: row.id,
      rank: row.rank,
      name: user?.name ?? row.name ?? "Unknown",
      nickname: user?.nickname ?? null,
      avatar: user?.avatar ?? null,
      completed: row.completed,
      earned: row.earned,
      points: row.points,
    };
  }

  const vis = mergeVisibility(user?.profileVisibility);
  const showName = vis.showDisplayName;
  const showAvatar = vis.showAvatar;
  const showCompleted = vis.showCompleted;
  const showEarnings = vis.showEarnings;

  return {
    id: row.id,
    rank: row.rank,
    name: showName
      ? user?.name ?? row.name ?? "Unknown"
      : "Anonymous contributor",
    nickname: showName ? user?.nickname ?? null : null,
    avatar: showAvatar ? user?.avatar ?? null : null,
    completed: showCompleted ? row.completed : null,
    earned: showEarnings ? row.earned : null,
    points: showCompleted && showEarnings ? row.points : null,
  };
}

module.exports = {
  DEFAULT_VISIBILITY,
  mergeVisibility,
  redactPublicUser,
  redactLeaderboardRow,
};
