// routes/leaderboard.js
const express = require("express");
const prisma = require("../prisma/client");
const { optionalAuthenticate } = require("../middleware/auth");
const { getCache, setCache, getVersion } = require("../utils/cache");

const router = express.Router();

router.get("/", optionalAuthenticate, async (req, res) => {
  try {
    const isAdmin = req.user?.role === "ADMIN";
    const timeRange = ["all", "30d", "90d"].includes(req.query.timeRange)
      ? req.query.timeRange
      : "all";
    const chainParam = String(req.query.chain || "MAIN").toUpperCase();
    if (chainParam !== "MAIN" && !isAdmin) {
      return res.status(403).json({ error: "Non-MAIN chains require admin" });
    }
    const limit = Math.min(parseInt(req.query.limit) || 25, 100);

    const version = await getVersion("bounties"); // busts with invalidateBounty
    const cacheKey = `leaderboard:v${version}:${timeRange}:${chainParam}:${limit}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const days = timeRange === "30d" ? 30 : timeRange === "90d" ? 90 : null;

    const hunterIds = (
      await prisma.user.findMany({
        where: { role: "HUNTER", isRobin: false },
        select: { id: true },
      })
    ).map((u) => u.id);

    const grouped = await prisma.bounty.groupBy({
      by: ["assignee"],
      where: {
        status: "DONE",
        assignee: { in: hunterIds },
        ...(chainParam !== "ALL" && { chain: chainParam }),
        ...(days && {
          completedAt: { gte: new Date(Date.now() - days * 864e5) },
        }),
      },
      _sum: { bountyAmount: true },
      _count: { id: true },
      orderBy: { _sum: { bountyAmount: "desc" } },
      take: limit,
    });

    const users = await prisma.user.findMany({
      where: { id: { in: grouped.map((g) => g.assignee) } },
      select: { id: true, name: true, nickname: true, avatar: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    const result = grouped.map((g, i) => ({
      id: g.assignee,
      rank: i + 1,
      name: byId.get(g.assignee)?.name ?? "Unknown",
      nickname: byId.get(g.assignee)?.nickname ?? null,
      avatar: byId.get(g.assignee)?.avatar ?? null,
      completed: g._count.id,
      earned: g._sum.bountyAmount ?? 0,
      points: Math.round((g._sum.bountyAmount ?? 0) * 100) + g._count.id * 10,
    }));

    await setCache(cacheKey, result, 60);
    res.json(result);
  } catch (err) {
    console.error("Failed to fetch leaderboard:", err);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

module.exports = router;
