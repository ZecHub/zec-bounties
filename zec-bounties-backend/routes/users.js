const express = require("express");
const prisma = require("../prisma/client");
const { authenticate, isAdmin } = require("../middleware/auth");
const { delCache, bumpVersion } = require("../utils/cache");
const { userIdentityWhere } = require("../utils/userIdentity");
const {
  DEFAULT_VISIBILITY,
  VISIBILITY_KEYS,
  mergeVisibility,
} = require("../utils/profileVisibility");

const router = express.Router();

function hasUA(addr) {
  return typeof addr === "string" && addr.startsWith("u1");
}

function coarseAddressType(user) {
  const ua = hasUA(user.UA_address);
  const z = !!user.z_address;
  if (ua && z) return "UA + z";
  if (ua) return "UA only";
  if (z) return "Sapling";
  return "None";
}

function stripAmountsIfPrivate(rows, allowAmount) {
  if (!Array.isArray(rows)) return rows;
  if (allowAmount) return rows;
  return rows.map((row) => {
    const { bountyAmount, ...rest } = row;
    return rest;
  });
}

function assignedDoneWhere(userId, chain) {
  return {
    status: "DONE",
    chain,
    OR: [{ assignee: userId }, { assignees: { some: { userId } } }],
  };
}

async function loadChainStats(userId, chain) {
  const [
    completed,
    created,
    submitted,
    earnedAgg,
    recentCompleted,
    recentCreated,
  ] = await Promise.all([
    prisma.bounty.count({
      where: assignedDoneWhere(userId, chain),
    }),
    prisma.bounty.count({
      where: { createdBy: userId, chain },
    }),
    prisma.workSubmission.count({
      where: { submittedBy: userId, bounty: { chain } },
    }),
    prisma.bounty.aggregate({
      where: {
        ...assignedDoneWhere(userId, chain),
        completedAt: { not: null },
      },
      _sum: { bountyAmount: true },
    }),
    prisma.bounty.findMany({
      where: assignedDoneWhere(userId, chain),
      orderBy: { paidAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        bountyAmount: true,
        status: true,
        chain: true,
        paidAt: true,
        dateCreated: true,
      },
    }),
    prisma.bounty.findMany({
      where: { createdBy: userId, chain },
      orderBy: { dateCreated: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        bountyAmount: true,
        status: true,
        isApproved: true,
        chain: true,
        dateCreated: true,
      },
    }),
  ]);

  const totalEarned = earnedAgg._sum.bountyAmount || 0;
  const completionRate =
    submitted > 0 ? Math.round((completed / submitted) * 100) : null;

  return {
    completed,
    created,
    submitted,
    totalEarned,
    completionRate,
    recentCompleted,
    recentCreated,
  };
}

async function loadStats(userId) {
  const [MAIN, TEST] = await Promise.all([
    loadChainStats(userId, "MAIN"),
    loadChainStats(userId, "TEST"),
  ]);
  return { MAIN, TEST };
}

/**
 * GET /api/users/search?q=
 * Admin typeahead. Must stay above /:idOrNickname/public.
 */
router.get("/search", authenticate, async (req, res) => {
  try {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Admin only" });
    }
    const q = String(req.query.q || "").trim();
    const where = userIdentityWhere(q);
    if (!where) return res.json({ data: [] });

    const data = await prisma.user.findMany({
      where,
      take: 20,
      orderBy: [{ nickname: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        nickname: true,
        avatar: true,
        role: true,
      },
    });
    return res.json({ data });
  } catch (error) {
    console.error("Failed to search users:", error);
    return res.status(500).json({ error: "Failed to search users" });
  }
});

/**
 * GET /api/users/:idOrNickname/public
 * Privacy-filtered public profile. Auth optional (owner/admin see more).
 */

const { resolveStaffUser, buildStaffView } = require("../utils/staffBounties");

const STAFF_BOUNTY_SELECT = {
  id: true,
  title: true,
  status: true,
  chain: true,
  bountyAmount: true,
  isPrivate: true,
  isPaid: true,
  isApproved: true,
  dateCreated: true,
  completedAt: true,
  paidAt: true,
  team: { select: { name: true } },
};

function staffOffset(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * GET /api/users/:idOrNickname/staff-bounties?chain=MAIN|TEST&openOffset=&historyOffset=
 * Admin only. Ignores profileVisibility. Does not return addresses, email, or github id.
 * Name matches only when exactly one user has that name.
 */
router.get(
  "/:idOrNickname/staff-bounties",
  authenticate,
  isAdmin,
  async (req, res) => {
    try {
      const key = decodeURIComponent(
        String(req.params.idOrNickname || ""),
      ).trim();
      if (!key) return res.status(400).json({ error: "User id required" });

      const chainRaw = String(req.query.chain || "MAIN").toUpperCase();
      if (chainRaw !== "MAIN" && chainRaw !== "TEST") {
        return res.status(400).json({ error: "chain must be MAIN or TEST" });
      }

      const resolved = await resolveStaffUser(prisma, key);
      if (!resolved.user) {
        return res.status(resolved.status).json({ error: resolved.error });
      }
      const user = resolved.user;

      const chainWhere = { chain: chainRaw };
      const [created, assigned, viaJoin, applications] = await Promise.all([
        prisma.bounty.findMany({
          where: { createdBy: user.id, ...chainWhere },
          orderBy: { dateCreated: "desc" },
          select: STAFF_BOUNTY_SELECT,
        }),
        prisma.bounty.findMany({
          where: { assignee: user.id, ...chainWhere },
          orderBy: { dateCreated: "desc" },
          select: STAFF_BOUNTY_SELECT,
        }),
        prisma.bounty.findMany({
          where: { assignees: { some: { userId: user.id } }, ...chainWhere },
          orderBy: { dateCreated: "desc" },
          select: STAFF_BOUNTY_SELECT,
        }),
        prisma.bountyApplication.findMany({
          where: { applicantId: user.id, bounty: chainWhere },
          orderBy: { appliedAt: "desc" },
          select: {
            status: true,
            bounty: { select: STAFF_BOUNTY_SELECT },
          },
        }),
      ]);

      return res.json(
        buildStaffView(
          user,
          chainRaw,
          created,
          assigned,
          viaJoin,
          applications,
          {
            openOffset: staffOffset(req.query.openOffset),
            historyOffset: staffOffset(req.query.historyOffset),
          },
        ),
      );
    } catch (err) {
      console.error("Staff bounty view error:", err);
      return res.status(500).json({ error: "Failed to load staff view" });
    }
  },
);

router.get("/:idOrNickname/public", async (req, res) => {
  try {
    const key = decodeURIComponent(
      String(req.params.idOrNickname || ""),
    ).trim();
    if (!key) return res.status(400).json({ error: "User id required" });

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ id: key }, { nickname: key }, { name: key }],
      },
      select: {
        id: true,
        name: true,
        nickname: true,
        avatar: true,
        role: true,
        badges: true,
        bio: true,
        profileVisibility: true,
        createdAt: true,
        githubId: true,
        discordUserId: true,
        discordUsername: true,
        discordGlobalName: true,
        discordConnectedAt: true,
        UA_address: true,
        z_address: true,
        teamMembers: {
          select: {
            role: true,
            team: {
              select: {
                id: true,
                name: true,
                logo: true,
                isVerified: true,
              },
            },
          },
        },
      },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    let isOwner = false;
    let isAdmin = false;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(
          authHeader.split(" ")[1],
          process.env.JWT_SECRET,
        );
        isOwner = decoded.id === user.id;
        isAdmin = decoded.role === "ADMIN";
      } catch {
        /* public access */
      }
    }

    const visibility = mergeVisibility(user.profileVisibility);
    // Admins see everything by default (human verification).
    // Owners keep the public view unless they explicitly ask for ?full=1.
    const forceFull =
      (isAdmin && !isOwner) ||
      (isOwner && String(req.query.full || "") === "1");

    const [stats, teams] = await Promise.all([
      loadStats(user.id),
      Promise.resolve(
        (user.teamMembers || []).map((row) => ({
          id: row.team.id,
          name: row.team.name,
          logo: row.team.logo,
          isVerified: row.team.isVerified,
          memberRole: row.role,
        })),
      ),
    ]);

    const profile = {
      id: user.id,
      visibility,
      isOwner,
      isAdminViewer: isAdmin,
      teams,
    };

    const show = (flag) => forceFull || visibility[flag] === true;

    function redactChainStats(src) {
      const out = {};
      for (const chain of ["MAIN", "TEST"]) {
        const row = src[chain] || {};
        const dst = {};
        if (show("showCompleted")) {
          dst.completed = row.completed;
          dst.submitted = row.submitted;
        }
        if (show("showCreated")) dst.created = row.created;
        if (show("showEarnings")) dst.totalEarned = row.totalEarned;
        if (show("showCompletionRate")) {
          dst.completionRate = row.completionRate;
        }
        if (show("showRecentBounties")) {
          dst.recentCompleted = stripAmountsIfPrivate(
            row.recentCompleted,
            show("showEarnings"),
          );
          dst.recentCreated = stripAmountsIfPrivate(
            row.recentCreated,
            show("showEarnings"),
          );
        }
        out[chain] = dst;
      }
      return out;
    }

    const exposeStats =
      show("showCompleted") ||
      show("showCreated") ||
      show("showEarnings") ||
      show("showCompletionRate") ||
      show("showRecentBounties");
    if (exposeStats) profile.statsByChain = redactChainStats(stats);

    if (show("showDisplayName")) {
      profile.displayName =
        user.nickname || user.name || "Anonymous contributor";
      profile.nickname = user.nickname || null;
      profile.name = user.name;
    } else {
      profile.displayName = "Anonymous contributor";
    }

    if (show("showAvatar")) {
      profile.avatar = user.avatar || null;
    }

    if (show("showBio")) {
      profile.bio = user.bio || null;
    }

    if (show("showBadges")) {
      const badges = Array.isArray(user.badges) ? [...user.badges] : [];
      if (user.role === "ADMIN") {
        if (!badges.includes("admin")) badges.push("admin");
        if (!badges.includes("dao-member")) badges.push("dao-member");
      }
      profile.badges = badges;
    }

    if (show("showRole")) {
      profile.role = user.role;
    }

    if (show("showMemberSince")) {
      profile.memberSince = user.createdAt;
    }

    if (show("showGithub") && user.githubId) {
      // Prefer nickname (set from githubUser.login at signup).
      // Fall back to name only if it looks like a handle.
      const handle =
        user.nickname ||
        (user.name && /^[a-zA-Z0-9-]+$/.test(user.name) ? user.name : null);

      if (handle) {
        profile.githubUsername = handle;
      }
      // Optional: keep id for admin tools only, not required on public page
      // profile.githubId = user.githubId;
    }

    if (show("showDiscord") && user.discordUserId) {
      profile.discord = {
        id: user.discordUserId,
        username: user.discordUsername || null,
        globalName: user.discordGlobalName || null,
        // Useful for verification, so only sent in full view
        ...(forceFull ? { connectedAt: user.discordConnectedAt } : {}),
      };
    }

    if (show("showCompleted")) {
      profile.completed = stats.MAIN.completed;
      profile.submitted = stats.MAIN.submitted;
    }

    if (show("showCreated")) {
      profile.created = stats.MAIN.created;
    }

    if (show("showEarnings")) {
      profile.totalEarned = stats.MAIN.totalEarned;
    }

    if (show("showCompletionRate")) {
      profile.completionRate = stats.MAIN.completionRate;
    }

    if (show("showAddressType")) {
      profile.addressType = coarseAddressType(user);
      profile.hasUnifiedAddress = hasUA(user.UA_address);
      profile.hasShieldedAddress = !!user.z_address;

      // Only for client-side icon decode — never render this string in the UI
      if (user.UA_address) {
        profile.UA_address = user.UA_address;
      } else if (user.z_address) {
        profile.z_address = user.z_address;
      }

      // Start empty; frontend fills from WASM (or falls back below)
      profile.receivers = {
        ironwood: false,
        sapling: false,
        transparent: false,
      };
    }
    if (show("showRecentBounties")) {
      profile.recentCompleted = stripAmountsIfPrivate(
        stats.MAIN.recentCompleted,
        show("showEarnings"),
      );
      profile.recentCreated = stripAmountsIfPrivate(
        stats.MAIN.recentCreated,
        show("showEarnings"),
      );
    }

    if (isAdmin && !isOwner) {
      profile.githubId = user.githubId || null;
    }

    if (isOwner) {
      profile.bio = user.bio || null;
      profile.profileVisibility = visibility;
      profile._private = {
        completed: stats.MAIN.completed,
        created: stats.MAIN.created,
        submitted: stats.MAIN.submitted,
        totalEarned: stats.MAIN.totalEarned,
        completionRate: stats.MAIN.completionRate,
        byChain: stats,
      };
    }

    res.json(profile);
  } catch (err) {
    console.error("Public profile error:", err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

/**
 * GET /api/users/me/profile-settings
 */
router.get("/me/profile-settings", authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        bio: true,
        profileVisibility: true,
        nickname: true,
        name: true,
        avatar: true,
      },
    });
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      id: user.id,
      bio: user.bio || "",
      profileVisibility: mergeVisibility(user.profileVisibility),
      nickname: user.nickname,
      name: user.name,
      avatar: user.avatar,
    });
  } catch (err) {
    console.error("Profile settings GET error:", err);
    res.status(500).json({ error: "Failed to load profile settings" });
  }
});

/**
 * PATCH /api/users/me/profile
 * Body: { bio?: string, profileVisibility?: partial flags }
 */
router.patch("/me/profile", authenticate, async (req, res) => {
  try {
    const { bio, profileVisibility } = req.body;
    const data = {};

    if (bio !== undefined) {
      if (typeof bio !== "string") {
        return res.status(400).json({ error: "bio must be a string" });
      }
      const trimmed = bio.trim();
      if (trimmed.length > 500) {
        return res
          .status(400)
          .json({ error: "bio max length is 500 characters" });
      }
      data.bio = trimmed.length ? trimmed : null;
    }

    if (profileVisibility !== undefined) {
      if (
        !profileVisibility ||
        typeof profileVisibility !== "object" ||
        Array.isArray(profileVisibility)
      ) {
        return res
          .status(400)
          .json({ error: "profileVisibility must be an object" });
      }

      const existing = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { profileVisibility: true },
      });
      const merged = mergeVisibility(existing?.profileVisibility);
      for (const key of VISIBILITY_KEYS) {
        if (typeof profileVisibility[key] === "boolean") {
          merged[key] = profileVisibility[key];
        }
      }
      data.profileVisibility = merged;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: {
        id: true,
        bio: true,
        profileVisibility: true,
        nickname: true,
        name: true,
        avatar: true,
      },
    });

    await delCache("users:all").catch(() => {});
    if (profileVisibility !== undefined) {
      await bumpVersion("profiles");
    }

    res.json({
      id: updated.id,
      bio: updated.bio || "",
      profileVisibility: mergeVisibility(updated.profileVisibility),
      nickname: updated.nickname,
      name: updated.name,
      avatar: updated.avatar,
    });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

module.exports = router;
module.exports.DEFAULT_VISIBILITY = DEFAULT_VISIBILITY;
module.exports.mergeVisibility = mergeVisibility;

[executed on device: ayobami-Latitude-7490 (7d1414a3-3c53-4ca4-bd2e-0634cf62f6c1)]