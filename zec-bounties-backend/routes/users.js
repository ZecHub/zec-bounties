const express = require("express");
const prisma = require("../prisma/client");
const { authenticate } = require("../middleware/auth");
const { delCache } = require("../utils/cache");

const router = express.Router();

/** Privacy-first defaults: only avatar + display name on by default. */
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

async function loadStats(userId) {
  const [
    completed,
    created,
    submitted,
    earnedAgg,
    recentCompleted,
    recentCreated,
  ] = await Promise.all([
    prisma.bounty.count({
      where: {
        status: "DONE",
        OR: [{ assignee: userId }, { assignees: { some: { userId } } }],
      },
    }),
    prisma.bounty.count({
      where: { createdBy: userId },
    }),
    prisma.workSubmission.count({
      where: { submittedBy: userId },
    }),
    prisma.bounty.aggregate({
      where: {
        status: "DONE",
        isPaid: true,
        OR: [{ assignee: userId }, { assignees: { some: { userId } } }],
      },
      _sum: { bountyAmount: true },
    }),
    prisma.bounty.findMany({
      where: {
        status: "DONE",
        OR: [{ assignee: userId }, { assignees: { some: { userId } } }],
      },
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
      where: { createdBy: userId },
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

/**
 * GET /api/users/:idOrNickname/public
 * Privacy-filtered public profile. Auth optional (owner/admin see more).
 */
router.get("/:idOrNickname/public", async (req, res) => {
  try {
    const key = req.params.idOrNickname;
    if (!key) return res.status(400).json({ error: "User id required" });

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ id: key }, { nickname: key }],
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
        UA_address: true,
        z_address: true,
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
    const forceFull =
      (isOwner || isAdmin) && String(req.query.full || "") === "1";

    const stats = await loadStats(user.id);

    const profile = {
      id: user.id,
      visibility,
      isOwner,
      isAdminViewer: isAdmin,
    };

    const show = (flag) => forceFull || visibility[flag] === true;

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
      profile.githubId = user.githubId;
    }

    if (show("showCompleted")) {
      profile.completed = stats.completed;
      profile.submitted = stats.submitted;
    }

    if (show("showCreated")) {
      profile.created = stats.created;
    }

    if (show("showEarnings")) {
      profile.totalEarned = stats.totalEarned;
    }

    if (show("showCompletionRate")) {
      profile.completionRate = stats.completionRate;
    }

    if (show("showAddressType")) {
      profile.addressType = coarseAddressType(user);
      profile.hasUnifiedAddress = hasUA(user.UA_address);
      profile.hasShieldedAddress = !!user.z_address;
    }

    if (show("showRecentBounties")) {
      profile.recentCompleted = stats.recentCompleted;
      profile.recentCreated = stats.recentCreated;
    }

    if (isOwner) {
      profile.bio = user.bio || null;
      profile.profileVisibility = visibility;
      profile._private = {
        completed: stats.completed,
        created: stats.created,
        submitted: stats.submitted,
        totalEarned: stats.totalEarned,
        completionRate: stats.completionRate,
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
