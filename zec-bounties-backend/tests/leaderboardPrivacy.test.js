const test = require("node:test");
const assert = require("node:assert/strict");

const {
  leaderboardPoints,
  serializeLeaderboardEntry,
} = require("../utils/leaderboardPrivacy");
const {
  DEFAULT_VISIBILITY,
  mergeVisibility,
} = require("../utils/profileVisibility");

const group = {
  assignee: "user-1",
  _sum: { bountyAmount: 1.25 },
  _count: { id: 7 },
};

const user = {
  id: "user-1",
  name: "Private Hunter",
  nickname: "hunter",
  avatar: "https://example.com/avatar.png",
};

test("profile visibility defaults keep identity public but hide stats", () => {
  const entry = serializeLeaderboardEntry(group, user, 0, false);

  assert.equal(entry.name, "Private Hunter");
  assert.equal(entry.nickname, "hunter");
  assert.equal(entry.avatar, "https://example.com/avatar.png");
  assert.equal(entry.completed, null);
  assert.equal(entry.earned, null);
  assert.equal(entry.points, null);
});

test("public leaderboard removes fields disabled by profile privacy", () => {
  const entry = serializeLeaderboardEntry(
    group,
    {
      ...user,
      profileVisibility: {
        showDisplayName: false,
        showAvatar: false,
        showCompleted: false,
        showEarnings: false,
      },
    },
    2,
    false,
  );

  assert.deepEqual(entry, {
    id: "user-1",
    rank: 3,
    name: "Anonymous contributor",
    nickname: null,
    avatar: null,
    completed: null,
    earned: null,
    points: null,
  });
});

test("public leaderboard exposes only fields the user enabled", () => {
  const entry = serializeLeaderboardEntry(
    group,
    {
      ...user,
      profileVisibility: {
        showDisplayName: true,
        showAvatar: false,
        showCompleted: true,
        showEarnings: true,
      },
    },
    0,
    false,
  );

  assert.equal(entry.name, "Private Hunter");
  assert.equal(entry.nickname, "hunter");
  assert.equal(entry.avatar, null);
  assert.equal(entry.completed, 7);
  assert.equal(entry.earned, 1.25);
  assert.equal(entry.points, leaderboardPoints(1.25, 7));
});

test("derived points stay private if either source stat is hidden", () => {
  const onlyCompleted = serializeLeaderboardEntry(
    group,
    {
      ...user,
      profileVisibility: {
        showCompleted: true,
        showEarnings: false,
      },
    },
    0,
    false,
  );

  const onlyEarnings = serializeLeaderboardEntry(
    group,
    {
      ...user,
      profileVisibility: {
        showCompleted: false,
        showEarnings: true,
      },
    },
    0,
    false,
  );

  assert.equal(onlyCompleted.completed, 7);
  assert.equal(onlyCompleted.earned, null);
  assert.equal(onlyCompleted.points, null);

  assert.equal(onlyEarnings.completed, null);
  assert.equal(onlyEarnings.earned, 1.25);
  assert.equal(onlyEarnings.points, null);
});

test("admin leaderboard keeps the full record regardless of public privacy", () => {
  const entry = serializeLeaderboardEntry(
    group,
    {
      ...user,
      profileVisibility: {
        showDisplayName: false,
        showAvatar: false,
        showCompleted: false,
        showEarnings: false,
      },
    },
    0,
    true,
  );

  assert.equal(entry.name, "Private Hunter");
  assert.equal(entry.nickname, "hunter");
  assert.equal(entry.avatar, "https://example.com/avatar.png");
  assert.equal(entry.completed, 7);
  assert.equal(entry.earned, 1.25);
  assert.equal(entry.points, leaderboardPoints(1.25, 7));
});

test("mergeVisibility ignores unknown values and preserves privacy defaults", () => {
  const visibility = mergeVisibility({
    showDisplayName: false,
    showCompleted: true,
    showEarnings: "yes",
    unexpected: true,
  });

  assert.equal(visibility.showDisplayName, false);
  assert.equal(visibility.showCompleted, true);
  assert.equal(visibility.showEarnings, DEFAULT_VISIBILITY.showEarnings);
  assert.equal(visibility.unexpected, undefined);
});