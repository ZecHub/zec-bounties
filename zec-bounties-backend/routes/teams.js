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

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.mimetype)) {
      return cb(new Error("Only PNG, JPEG, WEBP, or SVG images are allowed"));
    }

    cb(null, true);
  },
});

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

    const { name, description, isPrivate } = req.body;
    const data = {};

    if (name !== undefined) data.name = name.trim();
    if (description !== undefined)
      data.description = description?.trim() || null;
    if (isPrivate !== undefined) data.isPrivate = !!isPrivate;

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

    sendRealtimeUpdate(
      "team_payment_sent",
      {
        teamId,
        result: sendResult[1],
      },
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
  imageUpload.single("banner"),
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
