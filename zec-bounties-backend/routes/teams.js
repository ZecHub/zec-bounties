const express = require("express");
const { PrismaClient } = require("@prisma/client");
const path = require("path");
const { promises: fs } = require("fs");
const { authenticate } = require("../middleware/auth");
const { initZcashOnce, initZcashOnceForTeams } = require("../zcash/init");
const { sendRealtimeUpdate, sendToUser } = require("../middleware/websocket");
const { invalidateZingo } = require("../utils/zingo/getZingo");
const executeZingoCliSeed = require("../utils/zingo/zingoLibSeed");
const executeZingoCliBalance = require("../utils/zingo/zingoLibBalance");
const executeZingoCliAddresses = require("../utils/zingo/zingoLibAddresses");
const executeZingoQuickSend = require("../utils/zingo/zingoLibQuickSend");
const {
  delCache,
  deleteCacheByPattern,
  bumpVersion,
} = require("../utils/cache");
const { getWalletDataDir } = require("../helpers/zcash/zcashHelper.js");
const executeZingoCliTransactions = require("../utils/zingo/zingoLibTransactions");
const executeZingoCliRescan = require("../utils/zingo/zingoLibRescan");
const executeZingoCliSync = require("../utils/zingo/zingoLibSync");
const { randomUUID } = require("crypto");
const { uploadToPinata, pinataUrl } = require("../utils/ipfs/pinata");
const { REQUIRED_TEAM_VERIFICATIONS } = require("../utils/constants");

const prisma = new PrismaClient();
const router = express.Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Check that the calling user is a member of the team.
 * Returns the TeamMember record or null.
 */
async function getTeamMember(teamId, userId) {
  return prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
}

/**
 * Check that the calling user is a team OWNER or ADMIN, or a global ADMIN.
 */
async function requireTeamAdmin(teamId, req, res) {
  if (req.user.role === "ADMIN") return true;

  const member = await getTeamMember(teamId, req.user.id);

  if (!member || !["OWNER", "ADMIN"].includes(member.role)) {
    res.status(403).json({ error: "Team admin access required" });
    return false;
  }

  return true;
}

/**
 * Sync a team's shared wallet into each member's ZcashParams.
 *
 * The team's wallet directory is NOT constructed here.
 * walletId from the team's zcashParams record is the source of truth.
 */
async function syncWalletToMembers(teamId, wallet, userIds) {
  if (!wallet || !userIds.length) return;

  const teamParams = await prisma.zcashParams.findFirst({
    where: {
      teamId,
      accountName: wallet.accountName,
    },
  });

  if (!teamParams) return;

  for (const userId of userIds) {
    await prisma.$transaction(
      async (tx) => {
        await tx.zcashParams.updateMany({
          where: {
            ownerId: userId,
            isDefault: true,
          },
          data: {
            isDefault: false,
          },
        });

        await tx.zcashParams.upsert({
          where: {
            ownerId_accountName_teamId: {
              ownerId: userId,
              accountName: wallet.accountName,
              teamId,
            },
          },
          update: {
            isDefault: true,
            isTeam: true,
            teamId,
            chain: wallet.chain,
            serverUrl: wallet.serverUrl,
            walletId: teamParams.walletId,
          },
          create: {
            ownerId: userId,
            accountName: wallet.accountName,
            chain: wallet.chain,
            serverUrl: wallet.serverUrl,
            isDefault: true,
            isTeam: true,
            teamId,
            walletId: teamParams.walletId,
          },
        });
      },
      { timeout: 10000 },
    );
  }
}

async function removeWalletFromMembers(teamId, wallet, userIds) {
  if (!wallet || !userIds.length) return;

  for (const userId of userIds) {
    await prisma.zcashParams
      .deleteMany({
        where: {
          ownerId: userId,
          accountName: wallet.accountName,
          teamId,
        },
      })
      .catch(() => {});

    const hasDefault = await prisma.zcashParams.findFirst({
      where: {
        ownerId: userId,
        isDefault: true,
      },
    });

    if (!hasDefault) {
      const latest = await prisma.zcashParams.findFirst({
        where: {
          ownerId: userId,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (latest) {
        await prisma.zcashParams.update({
          where: {
            id: latest.id,
          },
          data: {
            isDefault: true,
          },
        });
      }
    }
  }
}

const multer = require("multer");

const imageFileFilter = (req, file, cb) => {
  if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.mimetype)) {
    return cb(new Error("Only PNG, JPEG, WEBP, or SVG images are allowed"));
  }
  cb(null, true);
};

// Square avatars — people already have small, pre-cropped files for these.
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

// Wide cover images — screenshots/phone photos routinely exceed 5MB,
// especially as uncompressed PNG. Give banners real headroom.
const bannerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: imageFileFilter,
});

// Multer (and our fileFilter) reject by calling next(err) — without this,
// that error falls through to Express's default handler and returns HTML,
// which breaks `res.json()` on the frontend. Catch it here as real JSON.
function handleUploadError(err, req, res, next) {
  if (err) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: "Image is too large.",
      });
    }
    return res.status(400).json({
      error: err.message || "Invalid file upload",
    });
  }
  next();
}

function requireGlobalAdmin(req, res) {
  if (req.user.role !== "ADMIN") {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

/**
 * Bust every cache entry that could contain a stale copy of this team's
 * name/logo — the bounty list, each individual bounty belonging to the
 * team, and the public teams listing.
 */
async function invalidateTeamBounties(teamId) {
  const bounties = await prisma.bounty.findMany({
    where: {
      teamId,
    },
    select: {
      id: true,
    },
  });

  await Promise.all([
    deleteCacheByPattern("bounties:*"),
    bumpVersion("bounties"),
  ]);
}

// ─── Media URL helper ─────────────────────────────────────────────────────
// Team.logo / Team.banner are stored as bare Pinata CIDs. Every response
// that includes a team must convert them to full gateway URLs here — this
// is the one place that knows about IPFS, so the frontend never has to.
function toMediaUrl(cid) {
  if (!cid) return null;
  if (/^https?:\/\//i.test(cid)) return cid; // already a full URL, don't double-wrap
  return pinataUrl(cid);
}

function serializeTeam(team) {
  if (!team) return team;
  return {
    ...team,
    logo: toMediaUrl(team.logo),
    banner: toMediaUrl(team.banner),
  };
}

/**
 * Cascade-delete a team: tear down its Zcash wallet (if any) and remove
 * the team record. Used when converting a TEAM user to HUNTER.
 */
async function deleteTeamCascade(teamId) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { wallet: true },
  });

  if (!team) return;

  if (team.wallet) {
    const params = await prisma.zcashParams.findFirst({
      where: {
        teamId,
        accountName: team.wallet.accountName,
      },
    });

    if (params) {
      const dataDir = getWalletDataDir(params.walletId);

      invalidateZingo({
        chain: team.wallet.chain,
        serverUrl: team.wallet.serverUrl,
        dataDir,
      });

      await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  await prisma.team.delete({ where: { id: teamId } }).catch(() => {});

  await prisma.user
    .deleteMany({ where: { email: `team+${teamId}@internal.local` } })
    .catch(() => {});
}

// ─── Team CRUD ───────────────────────────────────────────────────────────────

router.post("/", authenticate, async (req, res) => {
  try {
    const { name, description, twitterUrl, discordUrl, additionalLinks } =
      req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        error: "Team name is required",
      });
    }

    if (!twitterUrl?.trim() || !discordUrl?.trim()) {
      return res.status(400).json({
        error: "Twitter and Discord links are required",
      });
    }

    const cleanedLinks = Array.isArray(additionalLinks)
      ? additionalLinks
          .map((l) => (typeof l === "string" ? l.trim() : ""))
          .filter(Boolean)
          .slice(0, 10) // sane cap
      : [];

    const team = await prisma.team.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        twitterUrl: twitterUrl.trim(),
        discordUrl: discordUrl.trim(),
        additionalLinks: cleanedLinks,
        members: {
          create: {
            userId: req.user.id,
            role: "OWNER",
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
          },
        },
        wallet: true,
      },
    });

    sendRealtimeUpdate("team_created", serializeTeam(team), req.user.id);
    res.status(201).json(serializeTeam(team));
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({
        error: "A team with that name already exists",
      });
    }

    console.error(err);

    res.status(500).json({
      error: "Failed to create team",
    });
  }
});

router.get("/", authenticate, async (req, res) => {
  try {
    console.log("teams fetch — user:", req.user.id, req.user.role);

    const where =
      req.user.role === "ADMIN"
        ? {}
        : {
            members: {
              some: {
                userId: req.user.id,
              },
            },
          };

    const teams = await prisma.team.findMany({
      where,
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
          },
        },
        wallet: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(teams.map(serializeTeam));
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to fetch teams",
    });
  }
});

router.get("/public", async (req, res) => {
  try {
    const teams = await prisma.team.findMany({
      where: { isVerified: true },
      select: {
        id: true,
        name: true,
        description: true,
        logo: true,
        _count: {
          select: { members: true, favoritedBy: true },
        },
      },
      orderBy: { name: "asc" },
    });

    res.json(
      teams.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        logo: toMediaUrl(t.logo),
        memberCount: t._count.members,
        communityCount: t._count.favoritedBy,
      })),
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch teams" });
  }
});

// ─── Favorites ───────────────────────────────────────────────────────────────

router.get("/favorites", authenticate, async (req, res) => {
  try {
    const favorites = await prisma.teamFavorite.findMany({
      where: {
        userId: req.user.id,
      },
      select: {
        teamId: true,
      },
    });

    res.json({
      favorites: favorites.map((f) => f.teamId),
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to fetch favorite teams",
    });
  }
});

router.post("/:teamId/favorite", authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;

    const team = await prisma.team.findUnique({
      where: {
        id: teamId,
      },
    });

    if (!team) {
      return res.status(404).json({
        error: "Team not found",
      });
    }

    await prisma.teamFavorite.upsert({
      where: {
        userId_teamId: {
          userId: req.user.id,
          teamId,
        },
      },
      update: {},
      create: {
        userId: req.user.id,
        teamId,
      },
    });

    await deleteCacheByPattern("bounties:*");

    sendToUser(req.user.id, "team_favorited", {
      teamId,
    });

    res.status(201).json({
      success: true,
      teamId,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to favorite team",
    });
  }
});

router.delete("/:teamId/favorite", authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;

    await prisma.teamFavorite
      .delete({
        where: {
          userId_teamId: {
            userId: req.user.id,
            teamId,
          },
        },
      })
      .catch(() => {});

    sendToUser(req.user.id, "team_unfavorited", {
      teamId,
    });

    res.json({
      success: true,
      teamId,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to unfavorite team",
    });
  }
});

// ─── Community ───────────────────────────────────────────────────────────────
// NOTE: place this block above `router.get("/:teamId", ...)`

router.get("/community", authenticate, async (req, res) => {
  try {
    const memberships = await prisma.communityMember.findMany({
      where: { userId: req.user.id },
      select: { teamId: true },
    });
    res.json({ communities: memberships.map((m) => m.teamId) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch communities" });
  }
});

// ─── Verification ────────────────────────────────────────────────────────────

router.get("/:teamId/verification", authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { isVerified: true },
    });
    if (!team) return res.status(404).json({ error: "Team not found" });

    const verifications = await prisma.teamVerification.findMany({
      where: { teamId },
      include: {
        admin: {
          select: { id: true, name: true, nickname: true, avatar: true },
        },
      },
      orderBy: { verifiedAt: "asc" },
    });

    res.json({
      success: true,
      verificationCount: verifications.length,
      requiredVerifications: REQUIRED_TEAM_VERIFICATIONS,
      isVerified: team.isVerified,
      verifiedByMe: verifications.some((v) => v.adminUserId === req.user.id),
      verifiers: verifications.map((v) => ({
        adminUserId: v.adminUserId,
        verifiedAt: v.verifiedAt,
        admin: v.admin,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch team verification status" });
  }
});

router.post("/:teamId/verify", authenticate, async (req, res) => {
  try {
    if (!requireGlobalAdmin(req, res)) return;

    const { teamId } = req.params;

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return res.status(404).json({ error: "Team not found" });

    await prisma.teamVerification.upsert({
      where: { teamId_adminUserId: { teamId, adminUserId: req.user.id } },
      update: {},
      create: { teamId, adminUserId: req.user.id },
    });

    const verificationCount = await prisma.teamVerification.count({
      where: { teamId },
    });
    const isVerified = verificationCount >= REQUIRED_TEAM_VERIFICATIONS;

    if (isVerified !== team.isVerified) {
      await prisma.team.update({ where: { id: teamId }, data: { isVerified } });
    }

    const payload = {
      teamId,
      verificationCount,
      requiredVerifications: REQUIRED_TEAM_VERIFICATIONS,
      isVerified,
    };

    sendRealtimeUpdate("team_verification_updated", payload, req.user.id);

    res.status(201).json({ success: true, ...payload, verifiedByMe: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to verify team" });
  }
});

router.delete("/:teamId/verify", authenticate, async (req, res) => {
  try {
    if (!requireGlobalAdmin(req, res)) return;

    const { teamId } = req.params;

    await prisma.teamVerification
      .delete({
        where: { teamId_adminUserId: { teamId, adminUserId: req.user.id } },
      })
      .catch(() => {});

    const verificationCount = await prisma.teamVerification.count({
      where: { teamId },
    });
    const isVerified = verificationCount >= REQUIRED_TEAM_VERIFICATIONS;

    await prisma.team.update({ where: { id: teamId }, data: { isVerified } });

    const payload = {
      teamId,
      verificationCount,
      requiredVerifications: REQUIRED_TEAM_VERIFICATIONS,
      isVerified,
    };

    sendRealtimeUpdate("team_verification_updated", payload, req.user.id);

    res.json({ success: true, ...payload, verifiedByMe: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove verification" });
  }
});

router.post("/:teamId/community/join", authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return res.status(404).json({ error: "Team not found" });

    await prisma.communityMember.upsert({
      where: { teamId_userId: { teamId, userId: req.user.id } },
      update: {},
      create: { teamId, userId: req.user.id },
    });

    sendToUser(req.user.id, "community_joined", { teamId });
    res.status(201).json({ success: true, teamId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to join community" });
  }
});

router.delete("/:teamId/community/leave", authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;
    await prisma.communityMember
      .delete({ where: { teamId_userId: { teamId, userId: req.user.id } } })
      .catch(() => {});
    sendToUser(req.user.id, "community_left", { teamId });
    res.json({ success: true, teamId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to leave community" });
  }
});

router.get("/:teamId/community/members", authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!(await requireTeamAdmin(teamId, req, res))) return;

    const members = await prisma.communityMember.findMany({
      where: { teamId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            nickname: true,
            email: true,
            avatar: true,
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });
    res.json({ success: true, members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch community members" });
  }
});

router.get("/:teamId/community", authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;

    const member =
      req.user.role === "ADMIN"
        ? true
        : await getTeamMember(teamId, req.user.id);

    if (!member) {
      return res.status(403).json({ error: "Access denied" });
    }

    const favorites = await prisma.teamFavorite.findMany({
      where: { teamId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            nickname: true,
            email: true,
            avatar: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, community: favorites });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch team community" });
  }
});

// ─── Role Conversion (Admin) ─────────────────────────────────────────────────

// Convert a TEAM-role user to HUNTER. If the user is an OWNER of a team
// (i.e. they created it) and is NOT an isRobin user, that team is deleted
// as part of the conversion. isRobin users keep their created team intact.
router.patch("/convert-to-hunter/:userId", authenticate, async (req, res) => {
  try {
    if (!requireGlobalAdmin(req, res)) return;

    const { userId } = req.params;

    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.role !== "TEAM") {
      return res.status(400).json({
        error: "User must have the TEAM role to be converted to HUNTER",
      });
    }

    const ownedTeams = await prisma.teamMember.findMany({
      where: { userId, role: "OWNER" },
      select: { teamId: true },
    });

    let deletedTeamIds = [];

    if (!user.isRobin && ownedTeams.length > 0) {
      deletedTeamIds = ownedTeams.map((m) => m.teamId);

      for (const teamId of deletedTeamIds) {
        await deleteTeamCascade(teamId);
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role: "HUNTER" },
    });

    // Bust the cached "all users" list — /api/bounties/users won't
    // reflect this role change until the TTL expires otherwise.
    await delCache("users:all");

    for (const teamId of deletedTeamIds) {
      sendRealtimeUpdate("team_deleted", { id: teamId }, req.user.id);
    }

    sendRealtimeUpdate("user_updated", updatedUser, req.user.id);

    res.json({
      success: true,
      user: updatedUser,
      deletedTeamIds,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to convert user to hunter" });
  }
});

// ─── Single Team ─────────────────────────────────────────────────────────────

router.get("/:teamId", authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;

    const team = await prisma.team.findUnique({
      where: {
        id: teamId,
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
          },
        },
        wallet: true,
      },
    });

    if (!team) {
      return res.status(404).json({
        error: "Team not found",
      });
    }

    if (req.user.role !== "ADMIN") {
      const member = await getTeamMember(teamId, req.user.id);

      if (!member) {
        return res.status(403).json({
          error: "Access denied",
        });
      }
    }

    res.json(serializeTeam(team));
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to fetch team",
    });
  }
});

router.patch("/:teamId", authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!(await requireTeamAdmin(teamId, req, res))) return;

    const {
      name,
      description,
      isPrivate,
      twitterUrl,
      discordUrl,
      additionalLinks,
    } = req.body;
    const data = {};

    if (name !== undefined) data.name = name.trim();
    if (description !== undefined)
      data.description = description?.trim() || null;
    if (isPrivate !== undefined) data.isPrivate = !!isPrivate;
    if (twitterUrl !== undefined) data.twitterUrl = twitterUrl?.trim() || null;
    if (discordUrl !== undefined) data.discordUrl = discordUrl?.trim() || null;
    if (additionalLinks !== undefined) {
      data.additionalLinks = Array.isArray(additionalLinks)
        ? additionalLinks
            .map((l) => (typeof l === "string" ? l.trim() : ""))
            .filter(Boolean)
            .slice(0, 10)
        : [];
    }

    const team = await prisma.team.update({
      where: { id: teamId },
      data,
      include: { members: true, wallet: true },
    });

    // Cascade the flip onto every existing bounty owned by this team,
    // and notify connected clients which bounties changed
    if (isPrivate !== undefined) {
      const affected = await prisma.bounty.findMany({
        where: { teamId },
        select: { id: true },
      });

      await prisma.bounty.updateMany({
        where: { teamId },
        data: { isPrivate: !!isPrivate },
      });

      sendRealtimeUpdate(
        "team_bounties_privacy_changed",
        {
          teamId,
          isPrivate: !!isPrivate,
          bountyIds: affected.map((b) => b.id),
        },
        req.user.id,
      );
    }

    if (name !== undefined || isPrivate !== undefined) {
      await invalidateTeamBounties(teamId);
    }

    sendRealtimeUpdate("team_updated", serializeTeam(team), req.user.id);
    res.json(serializeTeam(team));
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "Team name already taken" });
    }
    console.error(err);
    res.status(500).json({ error: "Failed to update team" });
  }
});

router.delete("/:teamId", authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;

    if (req.user.role !== "ADMIN") {
      const member = await getTeamMember(teamId, req.user.id);

      if (!member || member.role !== "OWNER") {
        return res.status(403).json({
          error: "Only the team owner can delete a team",
        });
      }
    }

    const team = await prisma.team.findUnique({
      where: {
        id: teamId,
      },
      include: {
        wallet: true,
      },
    });

    if (team?.wallet) {
      const params = await prisma.zcashParams.findFirst({
        where: {
          teamId,
          accountName: team.wallet.accountName,
        },
      });

      if (params) {
        const dataDir = getWalletDataDir(params.walletId);

        invalidateZingo({
          chain: team.wallet.chain,
          serverUrl: team.wallet.serverUrl,
          dataDir,
        });

        await fs.rm(dataDir, {
          recursive: true,
          force: true,
        });
      }
    }

    await prisma.team.delete({
      where: {
        id: teamId,
      },
    });

    await prisma.user.deleteMany({
      where: {
        email: `team+${teamId}@internal.local`,
      },
    });

    sendRealtimeUpdate(
      "team_deleted",
      {
        id: teamId,
      },
      req.user.id,
    );

    res.json({
      message: "Team deleted successfully",
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to delete team",
    });
  }
});

// ─── Member Management ───────────────────────────────────────────────────────

router.post("/:teamId/members", authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;

    if (!(await requireTeamAdmin(teamId, req, res))) return;

    const { userIds, role = "MEMBER" } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        error: "userIds array is required",
      });
    }

    if (!["ADMIN", "MEMBER"].includes(role)) {
      return res.status(400).json({
        error: "Role must be ADMIN or MEMBER",
      });
    }

    const invitedUsers = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, role: true },
    });

    const ineligible = invitedUsers.filter(
      (u) => u.role !== "TEAM" && u.role !== "ADMIN",
    );

    if (ineligible.length > 0 || invitedUsers.length !== userIds.length) {
      return res.status(400).json({
        error: "Only users with the TEAM or ADMIN role can be added to a team",
      });
    }

    const members = await Promise.all(
      userIds.map((userId) =>
        prisma.teamMember.upsert({
          where: {
            teamId_userId: {
              teamId,
              userId,
            },
          },
          update: {
            role,
          },
          create: {
            teamId,
            userId,
            role,
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
          },
        }),
      ),
    );

    const wallet = await prisma.teamWallet.findUnique({
      where: {
        teamId,
      },
    });

    if (wallet) {
      await syncWalletToMembers(teamId, wallet, userIds);
    }

    sendRealtimeUpdate(
      "team_members_updated",
      {
        teamId,
        members,
      },
      req.user.id,
    );

    res.status(201).json({
      members,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to add team members",
    });
  }
});

router.patch("/:teamId/members/:userId", authenticate, async (req, res) => {
  try {
    const { teamId, userId } = req.params;

    if (!(await requireTeamAdmin(teamId, req, res))) return;

    const { role } = req.body;

    if (!["OWNER", "ADMIN", "MEMBER"].includes(role)) {
      return res.status(400).json({
        error: "Invalid role",
      });
    }

    const member = await prisma.teamMember.update({
      where: {
        teamId_userId: {
          teamId,
          userId,
        },
      },
      data: {
        role,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    sendRealtimeUpdate(
      "team_member_role_updated",
      {
        teamId,
        member,
      },
      req.user.id,
    );

    res.json(member);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to update member role",
    });
  }
});

router.delete("/:teamId/members/:userId", authenticate, async (req, res) => {
  try {
    const { teamId, userId } = req.params;

    if (userId !== req.user.id) {
      if (!(await requireTeamAdmin(teamId, req, res))) return;
    }

    await prisma.teamMember.delete({
      where: {
        teamId_userId: {
          teamId,
          userId,
        },
      },
    });

    const wallet = await prisma.teamWallet.findUnique({
      where: {
        teamId,
      },
    });

    if (wallet) {
      await removeWalletFromMembers(teamId, wallet, [userId]);
    }

    sendRealtimeUpdate(
      "team_member_removed",
      {
        teamId,
        userId,
      },
      req.user.id,
    );

    res.json({
      message: "Member removed successfully",
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to remove member",
    });
  }
});

// ─── Team Wallet ─────────────────────────────────────────────────────────────

router.post("/:teamId/wallet", authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;

    if (!(await requireTeamAdmin(teamId, req, res))) return;

    const {
      accountName,
      chain = "mainnet",
      serverUrl = "https://zec.rocks:443",
    } = req.body;

    if (!accountName?.trim()) {
      return res.status(400).json({
        error: "accountName is required",
      });
    }

    const existing = await prisma.teamWallet.findUnique({
      where: {
        teamId,
      },
    });

    if (existing) {
      return res.status(409).json({
        error: "Team already has a wallet. Delete it first to replace.",
      });
    }

    let wallet = null;
    let zcashParams = null;

    try {
      wallet = await prisma.teamWallet.create({
        data: {
          teamId,
          accountName: accountName.trim(),
          chain,
          serverUrl,
        },
      });

      /*
       * initZcashOnce creates the walletId and wallet directory.
       * From this point onward, walletId is the source of truth.
       */
      zcashParams = await initZcashOnce(
        req.user.id,
        wallet.accountName,
        wallet.chain,
        teamId,
      );
      zcashParams = await prisma.zcashParams.update({
        where: {
          id: zcashParams.id,
        },
        data: {
          isTeam: true,
          teamId,
        },
      });
    } catch (err) {
      if (wallet) {
        await prisma.teamWallet
          .delete({
            where: {
              id: wallet.id,
            },
          })
          .catch(() => {});
      }

      if (zcashParams) {
        await prisma.zcashParams
          .delete({
            where: {
              id: zcashParams.id,
            },
          })
          .catch(() => {});

        const walletDir = getWalletDataDir(zcashParams.walletId);

        await fs
          .rm(walletDir, {
            recursive: true,
            force: true,
          })
          .catch(() => {});
      }

      throw err;
    }

    const allMembers = await prisma.teamMember.findMany({
      where: {
        teamId,
      },
    });

    const memberUserIds = allMembers.map((m) => m.userId);

    await syncWalletToMembers(teamId, wallet, memberUserIds);

    sendRealtimeUpdate(
      "team_wallet_created",
      {
        teamId,
        wallet,
      },
      req.user.id,
    );

    res.status(201).json({
      success: true,
      wallet,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to create team wallet",
    });
  }
});

router.post("/:teamId/wallet/import", authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;

    if (!(await requireTeamAdmin(teamId, req, res))) return;

    const {
      accountName,
      seedPhrase,
      chain = "mainnet",
      serverUrl = "https://zec.rocks:443",
      birthdayHeight,
    } = req.body;

    if (!accountName?.trim() || !seedPhrase) {
      return res.status(400).json({
        error: "accountName and seedPhrase are required",
      });
    }

    const words = seedPhrase.trim().split(/\s+/);

    if (words.length !== 24) {
      return res.status(400).json({
        error: "Seed phrase must be 24 words",
      });
    }

    const existing = await prisma.teamWallet.findUnique({
      where: {
        teamId,
      },
    });

    if (existing) {
      return res.status(409).json({
        error: "Team already has a wallet",
      });
    }

    let wallet = null;
    let zcashParams = null;

    try {
      wallet = await prisma.teamWallet.create({
        data: {
          teamId,
          accountName: accountName.trim(),
          chain,
          serverUrl,
        },
      });

      /*
       * initZcashOnce creates the walletId and wallet directory.
       */
      zcashParams = await initZcashOnce(
        req.user.id,
        wallet.accountName,
        wallet.chain,
        teamId,
      );
      zcashParams = await prisma.zcashParams.update({
        where: {
          id: zcashParams.id,
        },
        data: {
          isTeam: true,
          teamId,
        },
      });

      const params = await buildTeamParams(teamId, wallet);

      await executeZingoCliSeed(params, seedPhrase, birthdayHeight);
    } catch (err) {
      if (wallet) {
        await prisma.teamWallet
          .delete({
            where: {
              id: wallet.id,
            },
          })
          .catch(() => {});
      }

      if (zcashParams) {
        await prisma.zcashParams
          .delete({
            where: {
              id: zcashParams.id,
            },
          })
          .catch(() => {});

        const walletDir = getWalletDataDir(zcashParams.walletId);

        await fs
          .rm(walletDir, {
            recursive: true,
            force: true,
          })
          .catch(() => {});
      }

      throw err;
    }

    const allMembers = await prisma.teamMember.findMany({
      where: {
        teamId,
      },
    });

    const memberUserIds = allMembers.map((m) => m.userId);

    await syncWalletToMembers(teamId, wallet, memberUserIds);

    sendRealtimeUpdate(
      "team_wallet_imported",
      {
        teamId,
        wallet,
      },
      req.user.id,
    );

    res.status(201).json({
      success: true,
      wallet,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to import team wallet",
    });
  }
});

// Get team wallet info
router.get("/:teamId/wallet", authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;

    const member =
      req.user.role === "ADMIN"
        ? true
        : await getTeamMember(teamId, req.user.id);

    if (!member) {
      return res.status(403).json({
        error: "Access denied",
      });
    }

    const wallet = await prisma.teamWallet.findUnique({
      where: {
        teamId,
      },
    });

    if (!wallet) {
      return res.status(404).json({
        error: "No wallet found for this team",
      });
    }

    res.json({
      success: true,
      wallet,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to fetch team wallet",
    });
  }
});

// Get team wallet balance
router.get("/:teamId/wallet/balance", authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;

    const member =
      req.user.role === "ADMIN"
        ? true
        : await getTeamMember(teamId, req.user.id);

    if (!member) {
      return res.status(403).json({
        error: "Access denied",
      });
    }

    const wallet = await prisma.teamWallet.findUnique({
      where: {
        teamId,
      },
    });

    if (!wallet) {
      return res.status(404).json({
        error: "No wallet found for this team",
      });
    }

    const params = await buildTeamParams(teamId, wallet);

    const data = await executeZingoCliBalance("balance", params);

    sendToUser(req.user.id, "team_balance_fetched", {
      teamId,
      balance: data,
    });

    res.json({
      success: true,
      balance: data,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to fetch team wallet balance",
    });
  }
});

// Get team wallet addresses
router.get("/:teamId/wallet/addresses", authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;

    const member =
      req.user.role === "ADMIN"
        ? true
        : await getTeamMember(teamId, req.user.id);

    if (!member) {
      return res.status(403).json({
        error: "Access denied",
      });
    }

    const wallet = await prisma.teamWallet.findUnique({
      where: {
        teamId,
      },
    });

    if (!wallet) {
      return res.status(404).json({
        error: "No wallet found for this team",
      });
    }

    const params = await buildTeamParams(teamId, wallet);

    const addresses = await executeZingoCliAddresses("addresses", params);

    sendToUser(req.user.id, "team_addresses_fetched", {
      teamId,
      addresses,
    });

    res.json({
      success: true,
      addresses,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to fetch team wallet addresses",
    });
  }
});

// Get team wallet transaction history (any team member)
router.get("/:teamId/wallet/transactions", authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;

    const member =
      req.user.role === "ADMIN"
        ? true
        : await getTeamMember(teamId, req.user.id);
    if (!member) return res.status(403).json({ error: "Access denied" });

    const wallet = await prisma.teamWallet.findUnique({ where: { teamId } });
    if (!wallet)
      return res.status(404).json({ error: "No wallet found for this team" });

    const params = await buildTeamParams(teamId, wallet);
    const transactions = await executeZingoCliTransactions(params);

    sendToUser(req.user.id, "team_transactions_fetched", {
      teamId,
      transactions,
    });

    res.json({
      success: true,
      transactions,
      chain: wallet.chain,
      serverUrl: wallet.serverUrl,
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: "Failed to fetch team wallet transaction history" });
  }
});

// Rescan team wallet (team admin or global admin)
router.post("/:teamId/wallet/rescan", authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!(await requireTeamAdmin(teamId, req, res))) return;

    const wallet = await prisma.teamWallet.findUnique({ where: { teamId } });
    if (!wallet)
      return res.status(404).json({ error: "No wallet found for this team" });

    const params = await buildTeamParams(teamId, wallet);
    await executeZingoCliRescan("rescan", params);

    sendToUser(req.user.id, "team_rescan_started", { teamId });
    res.json({ success: true, message: "Rescan started" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to start team wallet rescan" });
  }
});

router.get("/:teamId/wallet/sync-status", authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;

    const member =
      req.user.role === "ADMIN"
        ? true
        : await getTeamMember(teamId, req.user.id);
    if (!member) return res.status(403).json({ error: "Access denied" });

    const wallet = await prisma.teamWallet.findUnique({ where: { teamId } });
    if (!wallet)
      return res.status(404).json({ error: "No wallet found for this team" });

    const params = await buildTeamParams(teamId, wallet);
    const data = await executeZingoCliSync("sync status", params);

    sendToUser(req.user.id, "team_sync_status_fetched", { teamId, data });

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch team wallet sync status" });
  }
});

// Send payment from team wallet
router.post("/:teamId/wallet/pay", authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;

    if (!(await requireTeamAdmin(teamId, req, res))) return;

    const { payments } = req.body;

    if (!Array.isArray(payments) || payments.length === 0) {
      return res.status(400).json({
        error: "payments array is required",
      });
    }

    const wallet = await prisma.teamWallet.findUnique({
      where: {
        teamId,
      },
    });

    if (!wallet) {
      return res.status(404).json({
        error: "No wallet found for this team",
      });
    }

    const params = await buildTeamParams(teamId, wallet);

    const paymentList = payments.map((p) => ({
      address: p.address,
      amount: Math.round(p.amount * 1e8),
      memo: p.memo || "",
    }));

    const sendResult = await executeZingoQuickSend(paymentList, params);

    if (sendResult.error) {
      return res.status(422).json({
        success: false,
        error: "Payment failed",
        details: sendResult.error,
      });
    }

    if (sendResult.timedOut || sendResult.txids.length === 0) {
      // No confirmation either way — tell the caller to check the wallet
      // history before retrying, since the send may have gone through.
      return res.status(502).json({
        success: false,
        outcome: "unknown",
        error: "Payment outcome unknown",
        details:
          "zingo did not confirm the send. Check the team wallet's transaction history before retrying.",
      });
    }

    sendRealtimeUpdate(
      "team_payment_sent",
      { teamId, txids: sendResult.txids },
      req.user.id,
    );

    res.json({
      success: true,
      result: sendResult[1],
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to send team payment",
    });
  }
});

// ─── Team Wallet Payments (bounty payouts) ───────────────────────────────

// Authorize payout for one or more DONE, unpaid, approved bounties belonging
// to this team, from the team's shared wallet. Same claim-before-send /
// unknown-outcome handling as /api/transactions/authorize-payment, just
// scoped to a single team.
router.post(
  "/:teamId/wallet/authorize-payment",
  authenticate,
  async (req, res) => {
    try {
      const { teamId } = req.params;
      if (!(await requireTeamAdmin(teamId, req, res))) return;

      const { bountyIds } = req.body;

      if (!bountyIds || !Array.isArray(bountyIds) || bountyIds.length === 0) {
        return res
          .status(400)
          .json({ error: "No bounties selected for payment" });
      }

      const wallet = await prisma.teamWallet.findUnique({ where: { teamId } });

      if (!wallet) {
        return res.status(400).json({
          error:
            "This team has no wallet configured. Set one up before authorizing payments.",
        });
      }

      const teamParams = await buildTeamParams(teamId, wallet);
      const bountyChainForWallet = wallet.chain === "mainnet" ? "MAIN" : "TEST";

      // Fetch the selected bounties, scoped to THIS team, with their assignee
      const bounties = await prisma.bounty.findMany({
        where: {
          id: { in: bountyIds },
          teamId,
          status: "DONE",
          isPaid: false,
          isApproved: true,
          paymentInFlight: false,
        },
        include: {
          assigneeUser: {
            select: { id: true, name: true, z_address: true, UA_address: true },
          },
        },
      });

      const chainMismatches = bounties.filter(
        (b) => b.chain !== bountyChainForWallet,
      );
      if (chainMismatches.length > 0) {
        return res.status(400).json({
          error: `Chain mismatch: the team wallet is on ${wallet.chain} but ${chainMismatches.length} selected bounty/ies are on ${bountyChainForWallet === "MAIN" ? "testnet" : "mainnet"}. Deselect those bounties.`,
          mismatched: chainMismatches.map((b) => ({
            id: b.id,
            title: b.title,
            chain: b.chain,
          })),
        });
      }

      if (bounties.length === 0) {
        return res.status(400).json({
          error:
            "None of the selected bounties are eligible for payment (must belong to this team, be DONE, approved, and unpaid)",
        });
      }

      // Build payment list, skipping any bounty whose assignee has no address
      const paymentList = [];
      const skipped = [];

      for (const bounty of bounties) {
        const payoutAddress =
          bounty.chain === "MAIN"
            ? bounty.assigneeUser?.UA_address
            : bounty.assigneeUser?.z_address;

        if (!payoutAddress) {
          skipped.push({
            id: bounty.id,
            title: bounty.title,
            reason: `Assignee has no ${bounty.chain === "MAIN" ? "UA address" : "z_address"}`,
          });
          continue;
        }

        paymentList.push({
          address: payoutAddress,
          amount: Math.round(bounty.bountyAmount * 1e8), // zatoshis
          memo: `Bounty: ${bounty.title} (ID: ${bounty.id})`,
          bountyId: bounty.id,
          chain: bounty.chain,
        });
      }

      if (paymentList.length === 0) {
        return res.status(400).json({
          error:
            "No payable bounties — all selected assignees are missing addresses",
          skipped,
        });
      }

      // ── Claim before send ─────────────────────────────────────────────
      const payableIds = paymentList.map((p) => p.bountyId);
      const batchKey = randomUUID();
      const claimConflict = new Error("claim-conflict");

      try {
        await prisma.$transaction(async (tx) => {
          const result = await tx.bounty.updateMany({
            where: {
              id: { in: payableIds },
              teamId,
              status: "DONE",
              isApproved: true,
              isPaid: false,
              paymentInFlight: false,
            },
            data: { paymentInFlight: true },
          });

          if (result.count !== payableIds.length) throw claimConflict;

          await tx.transaction.createMany({
            data: paymentList.map((p) => ({
              bountyId: p.bountyId,
              amountZat: BigInt(p.amount),
              toAddress: p.address,
              memo: p.memo,
              batchKey,
            })),
          });
        });
      } catch (err) {
        if (err !== claimConflict) throw err;
        return res.status(409).json({
          error:
            "Some of the selected bounties are already being paid by another request. Refresh and try again.",
        });
      }

      console.log(
        `💸 Paying ${paymentList.length} bounties from team "${teamId}" wallet "${wallet.accountName}" (by: ${req.user.id}, batch: ${batchKey})`,
      );

      // ── Send ───────────────────────────────────────────────────────────
      let sendResult;
      try {
        sendResult = await executeZingoQuickSend(paymentList, teamParams);
      } catch (err) {
        console.error(
          `⚠️ UNKNOWN team payment outcome for batch ${batchKey} (bounties: ${payableIds.join(", ")}): ${err.message}`,
        );
        await prisma.transaction.updateMany({
          where: { batchKey },
          data: { status: "UNKNOWN" },
        });
        return res.status(502).json({
          success: false,
          outcome: "unknown",
          error: "Payment outcome unknown — the send may have completed",
          details:
            "The wallet didn't confirm in time. These bounties are locked and will NOT be auto-retried. Check the team wallet's transaction history before taking further action.",
          batchKey,
        });
      }

      if (sendResult.timedOut) {
        console.error(
          `⚠️ UNKNOWN team payment outcome for batch ${batchKey} (bounties: ${payableIds.join(", ")}): send timed out`,
        );
        await prisma.transaction.updateMany({
          where: { batchKey },
          data: { status: "UNKNOWN" },
        });
        return res.status(502).json({
          success: false,
          outcome: "unknown",
          error: "Payment outcome unknown — the send may have completed",
          details:
            "The wallet didn't confirm in time. These bounties are locked and will NOT be auto-retried. Check the team wallet's transaction history before taking further action.",
          batchKey,
        });
      }

      if (sendResult.error) {
        const errorMessage = sendResult.error || "Unknown payment error";
        console.error("❌ Zingo team payment error:", errorMessage);

        await releaseTeamClaim(
          batchKey,
          payableIds,
          errorMessage,
          sendResult.raw,
        );

        return res.status(422).json({
          success: false,
          error: "Payment failed",
          details: errorMessage,
        });
      }

      // ── Clean success ──────────────────────────────────────────────────
      const txResult = sendResult[1];
      const txid = sendResult.txids?.[0] ?? txResult?.txid ?? null;
      const paidAt = new Date();

      await prisma.$transaction([
        prisma.transaction.updateMany({
          where: { batchKey },
          data: { status: "BROADCAST", txid, settledAt: paidAt },
        }),
        prisma.bounty.updateMany({
          where: { id: { in: payableIds } },
          data: {
            isPaid: true,
            paymentAuthorized: true,
            paidAt,
            paymentInFlight: false,
          },
        }),
      ]);
      await Promise.all(payableIds.map((id) => invalidateBounty(id)));

      // teamId in the payload lets the frontend WS handler distinguish this
      // from an admin (non-team) payout and refetch the right team's data.
      sendRealtimeUpdate(
        "payment_authorized",
        {
          teamId,
          result: txResult,
          paidCount: payableIds.length,
          skippedCount: skipped.length,
          skipped,
          walletAccountName: wallet.accountName,
          batchKey,
        },
        req.user.id,
      );

      res.json({
        success: true,
        result: txResult,
        batchKey,
        paidCount: payableIds.length,
        skipped,
      });
    } catch (error) {
      console.error("Error in team authorize-payment:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

// Durable payout records (DB) for this team's bounties — any team member may
// view, same access pattern as balance/transactions below it.
router.get(
  "/:teamId/wallet/payment-records",
  authenticate,
  async (req, res) => {
    try {
      const { teamId } = req.params;

      const member =
        req.user.role === "ADMIN"
          ? true
          : await getTeamMember(teamId, req.user.id);
      if (!member) return res.status(403).json({ error: "Access denied" });

      const records = await prisma.transaction.findMany({
        where: { bounty: { teamId } },
        orderBy: { createdAt: "desc" },
        take: 200,
        include: {
          bounty: {
            select: {
              id: true,
              title: true,
              chain: true,
              assigneeUser: {
                select: { id: true, name: true, nickname: true },
              },
            },
          },
        },
      });

      res.json({ records: records.map(serializeTxRecord) });
    } catch (error) {
      console.error("Error fetching team payment records:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

// Resolve an UNKNOWN-outcome team payment record after checking the wallet
router.post(
  "/:teamId/wallet/payment-records/:id/resolve",
  authenticate,
  async (req, res) => {
    try {
      const { teamId, id } = req.params;
      if (!(await requireTeamAdmin(teamId, req, res))) return;

      const { outcome, txid } = req.body; // "broadcast" or "failed"

      const record = await prisma.transaction.findUnique({
        where: { id },
        include: { bounty: { select: { id: true, teamId: true } } },
      });

      if (!record || record.bounty?.teamId !== teamId) {
        return res.status(404).json({ error: "Record not found" });
      }
      if (record.status !== "UNKNOWN") {
        return res.status(409).json({ error: "already settled" });
      }

      if (outcome === "broadcast") {
        await prisma.$transaction([
          prisma.transaction.update({
            where: { id: record.id },
            data: { status: "BROADCAST", txid, settledAt: new Date() },
          }),
          prisma.bounty.update({
            where: { id: record.bountyId },
            data: { isPaid: true, paymentInFlight: false, paidAt: new Date() },
          }),
        ]);
      } else {
        await prisma.$transaction([
          prisma.transaction.update({
            where: { id: record.id },
            data: { status: "FAILED", settledAt: new Date() },
          }),
          prisma.bounty.update({
            where: { id: record.bountyId },
            data: { paymentInFlight: false },
          }),
        ]);
      }

      await invalidateBounty(record.bountyId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error resolving team payment record:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

// Delete team wallet
router.delete("/:teamId/wallet", authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;

    if (req.user.role !== "ADMIN") {
      const member = await getTeamMember(teamId, req.user.id);

      if (!member || member.role !== "OWNER") {
        return res.status(403).json({
          error: "Only the team owner can delete the wallet",
        });
      }
    }

    const wallet = await prisma.teamWallet.findUnique({
      where: {
        teamId,
      },
    });

    if (!wallet) {
      return res.status(404).json({
        error: "Wallet not found",
      });
    }

    await removeWalletFromMembers(
      teamId,
      wallet,
      (
        await prisma.teamMember.findMany({
          where: {
            teamId,
          },
        })
      ).map((m) => m.userId),
    );

    /*
     * IMPORTANT:
     * Resolve the wallet directory using walletId.
     * Do NOT reconstruct it from teamId/accountName/chain.
     */
    const zcashParams = await prisma.zcashParams.findFirst({
      where: {
        teamId,
        accountName: wallet.accountName,
      },
    });

    if (zcashParams) {
      const dataDir = getWalletDataDir(zcashParams.walletId);

      invalidateZingo({
        chain: wallet.chain,
        serverUrl: wallet.serverUrl,
        dataDir,
      });

      await fs.rm(dataDir, {
        recursive: true,
        force: true,
      });

      await prisma.zcashParams.delete({
        where: {
          id: zcashParams.id,
        },
      });
    }

    await prisma.teamWallet.delete({
      where: {
        teamId,
      },
    });

    sendRealtimeUpdate(
      "team_wallet_deleted",
      {
        teamId,
      },
      req.user.id,
    );

    res.json({
      message: "Team wallet deleted successfully",
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to delete team wallet",
    });
  }
});

// ─── Team Activity ───────────────────────────────────────────────────────────

router.get("/:teamId/applications", authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;

    const member =
      req.user.role === "ADMIN"
        ? true
        : await getTeamMember(teamId, req.user.id);

    if (!member) {
      return res.status(403).json({
        error: "Access denied",
      });
    }

    const applications = await prisma.bountyApplication.findMany({
      where: {
        bounty: {
          teamId,
        },
      },
      include: {
        applicantUser: {
          select: {
            id: true,
            name: true,
            nickname: true,
            email: true,
            avatar: true,
          },
        },
        bounty: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: {
        appliedAt: "desc",
      },
    });

    res.json({
      success: true,
      applications,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to fetch team applications",
    });
  }
});

router.get("/:teamId/submissions", authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;

    const member =
      req.user.role === "ADMIN"
        ? true
        : await getTeamMember(teamId, req.user.id);

    if (!member) {
      return res.status(403).json({
        error: "Access denied",
      });
    }

    const submissions = await prisma.workSubmission.findMany({
      where: {
        bounty: {
          teamId,
        },
      },
      include: {
        submitterUser: {
          select: {
            id: true,
            name: true,
            nickname: true,
            email: true,
            avatar: true,
          },
        },
        bounty: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: {
        submittedAt: "desc",
      },
    });

    res.json({
      success: true,
      submissions,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to fetch team submissions",
    });
  }
});

// ─── Team Logo ───────────────────────────────────────────────────────────────

router.post(
  "/:teamId/logo",
  authenticate,
  imageUpload.single("logo"),
  handleUploadError,
  async (req, res) => {
    try {
      const { teamId } = req.params;

      if (!(await requireTeamAdmin(teamId, req, res))) return;

      if (!req.file) {
        return res.status(400).json({
          error: "No image file provided",
        });
      }

      const team = await prisma.team.findUnique({
        where: {
          id: teamId,
        },
      });

      if (!team) {
        return res.status(404).json({
          error: "Team not found",
        });
      }

      const pinataResult = await uploadToPinata(req.file);

      const cid = pinataResult.cid;

      if (!cid) {
        throw new Error("Pinata did not return a CID");
      }

      const updated = await prisma.team.update({
        where: {
          id: teamId,
        },
        data: {
          logo: cid,
        },
        include: {
          members: true,
          wallet: true,
        },
      });

      await invalidateTeamBounties(teamId);

      sendRealtimeUpdate("team_updated", serializeTeam(updated), req.user.id);
      res.json({
        success: true,
        logo: toMediaUrl(cid),
        team: serializeTeam(updated),
      });
    } catch (err) {
      console.error("Pinata team logo upload failed:", err);

      res.status(500).json({
        error: "Failed to upload team logo",
      });
    }
  },
);

router.delete("/:teamId/logo", authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;

    if (!(await requireTeamAdmin(teamId, req, res))) return;

    const team = await prisma.team.findUnique({
      where: {
        id: teamId,
      },
    });

    if (!team) {
      return res.status(404).json({
        error: "Team not found",
      });
    }

    if (team.logo?.startsWith("/uploads/team-logos/")) {
      const oldPath = path.join(process.cwd(), team.logo);

      await fs.unlink(oldPath).catch(() => {});
    }

    const updated = await prisma.team.update({
      where: {
        id: teamId,
      },
      data: {
        logo: null,
      },
      include: {
        members: true,
        wallet: true,
      },
    });

    await invalidateTeamBounties(teamId);

    sendRealtimeUpdate("team_updated", serializeTeam(updated), req.user.id);
    res.json({ success: true, team: serializeTeam(updated) });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Failed to remove team logo",
    });
  }
});

router.post(
  "/:teamId/banner",
  authenticate,
  bannerUpload.single("banner"),
  handleUploadError,
  async (req, res) => {
    try {
      const { teamId } = req.params;

      if (!(await requireTeamAdmin(teamId, req, res))) return;

      if (!req.file) {
        return res.status(400).json({
          error: "No image file provided",
        });
      }

      const team = await prisma.team.findUnique({
        where: { id: teamId },
      });

      if (!team) {
        return res.status(404).json({
          error: "Team not found",
        });
      }

      const pinataResult = await uploadToPinata(req.file);
      const cid = pinataResult.cid;

      if (!cid) {
        throw new Error("Pinata did not return a CID");
      }

      const updated = await prisma.team.update({
        where: { id: teamId },
        data: { banner: cid },
        include: {
          members: true,
          wallet: true,
        },
      });

      await invalidateTeamBounties(teamId);

      sendRealtimeUpdate("team_updated", serializeTeam(updated), req.user.id);
      res.json({
        success: true,
        banner: toMediaUrl(cid),
        team: serializeTeam(updated),
      });
    } catch (err) {
      console.error("Pinata team banner upload failed:", err);

      res.status(500).json({
        error: "Failed to upload team banner",
      });
    }
  },
);

router.delete("/:teamId/banner", authenticate, async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!(await requireTeamAdmin(teamId, req, res))) return;

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return res.status(404).json({ error: "Team not found" });

    const updated = await prisma.team.update({
      where: { id: teamId },
      data: { banner: null },
      include: { members: true, wallet: true },
    });

    await invalidateTeamBounties(teamId);
    sendRealtimeUpdate("team_updated", serializeTeam(updated), req.user.id);

    res.json({ success: true, team: serializeTeam(updated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove team banner" });
  }
});

// BigInt doesn't survive res.json.
const serializeTxRecord = (record) => ({
  ...record,
  amountZat: Number(record.amountZat),
});

async function invalidateBounty(bountyId) {
  await Promise.all([
    delCache(`bounty:${bountyId}`),
    deleteCacheByPattern("bounties:*"),
  ]);
}

// Clean failure before anything reached the network: record it and put the
// bounties back in the payable set.
async function releaseTeamClaim(batchKey, bountyIds, errorDetail, raw) {
  await prisma.$transaction([
    prisma.transaction.updateMany({
      where: { batchKey },
      data: {
        status: "FAILED",
        errorDetail: errorDetail || null,
        rawResult: raw || null,
        settledAt: new Date(),
      },
    }),
    prisma.bounty.updateMany({
      where: { id: { in: bountyIds } },
      data: { paymentInFlight: false },
    }),
  ]);
  await Promise.all(bountyIds.map((id) => invalidateBounty(id)));
}

// ─── Internal Zcash helper ───────────────────────────────────────────────────

/**
 * Build the params object expected by the Zingo utilities.
 *
 * walletId is the source of truth for the wallet's filesystem location.
 * There is intentionally NO path construction based on teamId/accountName.
 */
async function buildTeamParams(teamId, wallet) {
  console.log(teamId, "lol", wallet);
  const params = await prisma.zcashParams.findFirst({
    where: {
      teamId,
      accountName: wallet.accountName,
    },
  });

  if (!params) {
    throw new Error("Team wallet ZcashParams not found");
  }

  return {
    chain: wallet.chain,
    serverUrl: wallet.serverUrl,
    accountName: wallet.accountName,
    walletId: params.walletId,
    dataDir: getWalletDataDir(params.walletId),
  };
}

module.exports = router;
