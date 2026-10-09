const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "leaderboard-route-test-secret";

const prismaPath = require.resolve("../prisma/client");
const cachePath = require.resolve("../utils/cache");
const authPath = require.resolve("../middleware/auth");
const routePath = require.resolve("../routes/leaderboard");

let readCacheKey = null;
let writtenCacheKey = null;

const hiddenHunter = {
  id: "hidden-user",
  name: "Real Name",
  nickname: "real-handle",
  avatar: "https://example.com/private-avatar.png",
  role: "HUNTER",
  isRobin: false,
  profileVisibility: {
    showDisplayName: false,
    showAvatar: false,
    showCompleted: false,
    showEarnings: false,
  },
};

require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    user: {
      findMany: async ({ select }) =>
        select?.profileVisibility ? [hiddenHunter] : [{ id: hiddenHunter.id }],
      findUnique: async ({ where }) =>
        where.id === "admin-user"
          ? {
              id: "admin-user",
              name: "Admin",
              nickname: "admin",
              role: "ADMIN",
              isRobin: false,
            }
          : null,
    },
    bounty: {
      groupBy: async () => [
        {
          assignee: hiddenHunter.id,
          _sum: { bountyAmount: 1.5 },
          _count: { id: 9 },
        },
      ],
    },
  },
};

require.cache[cachePath] = {
  id: cachePath,
  filename: cachePath,
  loaded: true,
  exports: {
    getVersion: async (namespace) => (namespace === "bounties" ? 4 : 12),
    getCache: async (key) => {
      readCacheKey = key;
      return null;
    },
    setCache: async (key) => {
      writtenCacheKey = key;
    },
  },
};

delete require.cache[authPath];
delete require.cache[routePath];

const leaderboardRouter = require(routePath);

async function withServer(run) {
  const app = express();
  app.use("/api/leaderboard", leaderboardRouter);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });

  try {
    const address = server.address();
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("unauthenticated leaderboard response cannot recover hidden profile fields", async () => {
  readCacheKey = null;
  writtenCacheKey = null;

  await withServer(async (baseUrl) => {
    const res = await fetch(
      `${baseUrl}/api/leaderboard?timeRange=all&chain=MAIN&limit=25`,
    );

    assert.equal(res.status, 200);
    const [entry] = await res.json();

    assert.equal(entry.name, "Anonymous contributor");
    assert.equal(entry.nickname, null);
    assert.equal(entry.avatar, null);
    assert.equal(entry.completed, null);
    assert.equal(entry.earned, null);
    assert.equal(entry.points, null);
  });

  assert.match(readCacheKey, /:p12:public:/);
  assert.equal(writtenCacheKey, readCacheKey);
});

test("admin leaderboard uses a separate cache scope and keeps full values", async () => {
  readCacheKey = null;
  writtenCacheKey = null;
  const token = jwt.sign({ id: "admin-user", role: "ADMIN" }, process.env.JWT_SECRET);

  await withServer(async (baseUrl) => {
    const res = await fetch(
      `${baseUrl}/api/leaderboard?timeRange=all&chain=MAIN&limit=25`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    assert.equal(res.status, 200);
    const [entry] = await res.json();

    assert.equal(entry.name, "Real Name");
    assert.equal(entry.nickname, "real-handle");
    assert.equal(entry.avatar, "https://example.com/private-avatar.png");
    assert.equal(entry.completed, 9);
    assert.equal(entry.earned, 1.5);
    assert.equal(entry.points, 240);
  });

  assert.match(readCacheKey, /:p12:admin:/);
  assert.equal(writtenCacheKey, readCacheKey);
});