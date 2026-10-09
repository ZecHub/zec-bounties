const { mergeVisibility } = require("./profileVisibility");

function leaderboardPoints(earned, completed) {
  return Math.round(earned * 100) + completed * 10;
}

function serializeLeaderboardEntry(group, user, index, isAdmin = false) {
  const earned = group?._sum?.bountyAmount ?? 0;
  const completed = group?._count?.id ?? 0;
  const base = {
    id: group.assignee,
    rank: index + 1,
  };

  if (isAdmin) {
    return {
      ...base,
      name: user?.name ?? "Unknown",
      nickname: user?.nickname ?? null,
      avatar: user?.avatar ?? null,
      completed,
      earned,
      points: leaderboardPoints(earned, completed),
    };
  }

  const visibility = mergeVisibility(user?.profileVisibility);
  const showDisplayName = visibility.showDisplayName === true;
  const showCompleted = visibility.showCompleted === true;
  const showEarnings = visibility.showEarnings === true;

  return {
    ...base,
    name: showDisplayName ? (user?.name ?? "Unknown") : "Anonymous contributor",
    nickname: showDisplayName ? (user?.nickname ?? null) : null,
    avatar: visibility.showAvatar ? (user?.avatar ?? null) : null,
    completed: showCompleted ? completed : null,
    earned: showEarnings ? earned : null,
    points:
      showCompleted && showEarnings
        ? leaderboardPoints(earned, completed)
        : null,
  };
}

module.exports = {
  leaderboardPoints,
  serializeLeaderboardEntry,
};