const express = require("express");
const prisma = require("../prisma/client");
const { formatEmailText } = require("../helpers/email");
const router = express.Router();
const {
  authenticate,
  isAdmin,
  optionalAuthenticate,
} = require("../middleware/auth");
const { sendRealtimeUpdate } = require("../middleware/websocket");
const {
  getCache,
  setCache,
  delCache,
  deleteCacheByPattern,
  getVersion,
  bumpVersion,
  TTL,
} = require("../utils/cache");
const sendMail = require("../utils/sendMail");
const notifyUser = require("../utils/notifyUser");
const { REQUIRED_TEAM_VERIFICATIONS } = require("../utils/constants");

// ─── Email settings ───────────────────────────────────────────────────────────
const ENABLE_EMAILS_IN_DEV = false; // Set to true when you want to test emails

const shouldSendEmails =
  process.env.NODE_ENV === "production" || ENABLE_EMAILS_IN_DEV;

const sendMailIfEnabled = async (options) => {
  if (!shouldSendEmails) {
    console.log(
      `[EMAIL SKIPPED] ${options.subject} -> ${options.to} (NODE_ENV=${process.env.NODE_ENV})`,
    );
    return;
  }

  return sendMail(options);
};

// Sends a push notification only to users who opted in AND have an active subscription.
// userIds: string[] — candidates to notify
const sendPushToOptedIn = async (userIds, payload) => {
  if (!userIds.length) return;
  try {
    const recipients = await prisma.user.findMany({
      where: {
        id: { in: userIds },
        pushNotifications: true,
        pushSubscriptions: { some: {} },
      },
      select: { id: true },
    });
    console.log("verified recipients:", recipients);
    await Promise.all(recipients.map((u) => notifyUser(u.id, payload)));
  } catch (err) {
    console.error("Push notification failed:", err);
  }
};

// Mirrors canViewPrivateBounty's rules, but returns the full recipient set
// instead of checking one user — used to scope websocket broadcasts so a
// private bounty's payload never reaches a socket outside its audience.
// Returns null for public bounties, meaning "broadcast to everyone" (unchanged behavior).
async function getBroadcastRecipients(bounty) {
  if (!bounty.isPrivate) return null;

  const recipients = new Set([bounty.createdBy]);

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  admins.forEach((a) => recipients.add(a.id));

  if (bounty.teamId) {
    const [members, favoriters] = await Promise.all([
      prisma.teamMember.findMany({
        where: { teamId: bounty.teamId },
        select: { userId: true },
      }),
      prisma.teamFavorite.findMany({
        where: { teamId: bounty.teamId },
        select: { userId: true },
      }),
    ]);
    members.forEach((m) => recipients.add(m.userId));
    favoriters.forEach((f) => recipients.add(f.userId));
  }

  return [...recipients];
}

// ─── Reusable select shapes (avoids re-typing & keeps payloads small) ─────────
const USER_SELECT = { id: true, name: true, nickname: true, avatar: true };

const USER_SELECT_PUBLIC = USER_SELECT;

const USER_SELECT_FULL = {
  id: true,
  name: true,
  nickname: true,
  email: true,
  avatar: true,
  z_address: true,
  UA_address: true,
};

// createdByUser / assigneeUser on Bounty (adds role, no address fields)
const USER_SELECT_WITH_ROLE = {
  id: true,
  name: true,
  nickname: true,
  email: true,
  role: true,
  avatar: true,
};

// submitterUser / reviewerUser / applicantUser-with-avatar
const USER_SELECT_BASIC = {
  id: true,
  name: true,
  nickname: true,
  email: true,
  avatar: true,
};

// applicantUser without avatar (a couple of routes only need this much)
const USER_SELECT_MINIMAL = {
  id: true,
  name: true,
  nickname: true,
  email: true,
};

// export routes (payments)
const USER_SELECT_EXPORT = {
  id: true,
  name: true,
  nickname: true,
  email: true,
  z_address: true,
  UA_address: true,
  ofacVerified: true,
};

const ASSIGNEE_INCLUDE = {
  assignees: {
    include: { user: { select: USER_SELECT } },
  },
};

// Invalidates now, then invalidates again shortly after — this closes the
// race window where a concurrent GET reads stale DB data and writes it to
// cache *after* our invalidation already ran, silently re-poisoning it.
const invalidateWithRetry = async (keys, delayMs = 500) => {
  const wipe = () =>
    Promise.all(
      keys.map((k) =>
        k.includes("*") ? deleteCacheByPattern(k) : delCache(k),
      ),
    );

  await wipe();
  setTimeout(() => {
    wipe().catch((err) =>
      console.error("Delayed cache invalidation failed:", err),
    );
  }, delayMs);
};

const invalidateBounty = async (bountyId) => {
  await Promise.all([
    delCache(`assignees:${bountyId}`),
    delCache("stats:totals"),
    bumpVersion("bounties"),
  ]);
};

const invalidateApplications = async (applicantId, bountyId) => {
  await invalidateWithRetry([
    `applications:user:${applicantId}`,
    "applications:all",
    ...(bountyId ? [`applications:bounty:${bountyId}`] : []),
  ]);
};

const invalidateSubmissions = async (bountyId, submittedBy) => {
  await invalidateWithRetry([
    `submissions:${bountyId}`,
    "submissions:all",
    ...(submittedBy ? [`submissions:user:${submittedBy}`] : []),
  ]);
};

async function canManageBounty(bounty, user) {
  if (user.role === "ADMIN") return true;
  if (bounty.createdBy === user.id) return true;
  if (bounty.teamId) {
    const member = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: bounty.teamId, userId: user.id } },
    });
    if (member && ["OWNER", "ADMIN"].includes(member.role)) return true;
  }
  return false;
}

async function canViewPrivateBounty(bounty, user) {
  if (!bounty.isPrivate) return true;
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  if (bounty.createdBy === user.id) return true;
  if (!bounty.teamId) return false;

  const [teamMember, favorite] = await Promise.all([
    prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: bounty.teamId, userId: user.id } },
    }),
    prisma.teamFavorite.findUnique({
      where: { userId_teamId: { userId: user.id, teamId: bounty.teamId } },
    }),
  ]);
  return !!(teamMember || favorite);
}

// ─── Create bounty ────────────────────────────────────────────────────────────
router.post("/", authenticate, async (req, res) => {
  try {
    const {
      title,
      description,
      bountyAmount,
      timeToComplete,
      assignee,
      isApproved,
      categoryId,
      chain,
      teamId,
    } = req.body;

    if (chain && !["MAIN", "TEST"].includes(chain)) {
      return res.status(400).json({ error: "Invalid chain value" });
    }

    // If a teamId was given, confirm it exists and the creator is actually
    // a member (global admins can post on behalf of any team). `team` is
    // declared here (not with `const` inside the `if`) so it's still in
    // scope below when we denormalize its privacy flag onto the bounty.
    let team = null;
    if (teamId) {
      team = await prisma.team.findUnique({ where: { id: teamId } });
      if (!team) return res.status(404).json({ error: "Team not found" });

      // Verification gate applies to everyone, including global admins —
      // this isn't an authorization check, it's a platform integrity gate.
      if (!team.isVerified) {
        return res.status(403).json({
          error: `${team.name} must be verified by ${REQUIRED_TEAM_VERIFICATIONS} admins before it can post bounties`,
        });
      }

      if (req.user.role !== "ADMIN") {
        const membership = await prisma.teamMember.findUnique({
          where: { teamId_userId: { teamId, userId: req.user.id } },
        });
        if (!membership) {
          return res
            .status(403)
            .json({ error: "You are not a member of this team" });
        }
      }
    }

    const resolvedAssignee = assignee === "none" ? null : assignee;
    const isClient = req.user.role === "CLIENT";

    const bounty = await prisma.bounty.create({
      data: {
        title,
        description,
        bountyAmount: parseFloat(bountyAmount),
        timeToComplete: new Date(timeToComplete),
        createdBy: req.user.id,
        assignee: resolvedAssignee,
        isApproved,
        categoryId,
        ...(chain && { chain }),
        ...(teamId && { teamId }),
        // Denormalized from the team at creation time — a bounty's privacy
        // always tracks its team's current privacy setting.
        isPrivate: team?.isPrivate ?? false,
        ...(isClient &&
          resolvedAssignee && {
            assignees: {
              create: {
                userId: resolvedAssignee,
              },
            },
          }),
      },
      include: {
        createdByUser: {
          select: USER_SELECT_WITH_ROLE,
        },
        assignees: {
          include: { user: { select: USER_SELECT } },
        },
        assigneeUser: {
          select: USER_SELECT_FULL,
        },
        team: { select: { id: true, name: true, logo: true } },
      },
    });

    const recipients = await getBroadcastRecipients(bounty);
    sendRealtimeUpdate("new_bounties", bounty, req.user.id, recipients);
    await deleteCacheByPattern("bounties:*");

    // Respond immediately — don't block on notifications
    res.status(201).json(bounty);

    // Fire-and-forget notifications
    (async () => {
      try {
        const creatorDisplayName =
          bounty.createdByUser.nickname || bounty.createdByUser.name;

        // Load once, filter twice — email and push use the same base list
        // so a user's push/email prefs are always evaluated consistently.
        const cachedUsers = await getCache("users:all");
        const users =
          cachedUsers ??
          (await prisma.user.findMany({
            select: {
              id: true,
              email: true,
              emailNotifications: true,
              pushNotifications: true,
            },
          }));

        const otherUsers = users.filter((u) => u.id !== req.user.id);

        // in the bounty creation IIFE, right after building otherUsers
        console.log("otherUsers sample:", otherUsers.slice(0, 3));

        const emailRecipients = otherUsers
          .filter((u) => u.emailNotifications !== false)
          .map((u) => u.email)
          .filter(Boolean);

        const pushCandidateIds = otherUsers
          .filter((u) => u.pushNotifications)
          .map((u) => u.id);

        console.log("pushCandidateIds:", pushCandidateIds);

        await Promise.all([
          sendPushToOptedIn(pushCandidateIds, {
            title: "New Bounty Available",
            body: `${bounty.title} — ${bounty.bountyAmount} ZEC`,
            url: `/bounties/${bounty.id}`,
          }),
          Promise.all(
            emailRecipients.map((recipient) =>
              sendMailIfEnabled({
                to: recipient,
                subject: `New Bounty Created: ${bounty.title}`,
                text: `A new bounty has been created.\n\nCreated by: ${creatorDisplayName}\n\nTitle: ${bounty.title}\nAmount: ${bounty.bountyAmount}`,
                html: `
            <h2>New Bounty Created</h2>
            <p><strong>Created by:</strong> ${creatorDisplayName}</p>
            <p><strong>Title:</strong> ${bounty.title}</p>
            <p><strong>Description:</strong><br/>
              ${formatEmailText(bounty.description)}
            </p>
            <p><strong>Amount:</strong> ${bounty.bountyAmount} ZEC</p>
            <p><strong>Time to complete:</strong> ${bounty.timeToComplete}</p>
          `,
              }),
            ),
          ),
        ]);
      } catch (notificationErr) {
        console.error("Bounty notification failed:", notificationErr);
      }
    })();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create bounty" });
  }
});

// ─── List bounties (paginated, lean payload) ──────────────────────────────
router.get("/", optionalAuthenticate, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const isAuthed = Boolean(req.user);
    const isDev = process.env.NODE_ENV !== "production";
    const isAdmin = req.user?.role === "ADMIN";
    const userId = req.user?.id;

    const teamId = req.query.teamId || undefined;

    // Default MAIN.
    // Admins may pass ?chain=TEST or ?chain=ALL.
    const chainParam = String(req.query.chain || "MAIN").toUpperCase();

    // ------------------------------------------------------------
    // Chain filter
    // ------------------------------------------------------------

    let chainFilter;

    if (isDev) {
      // In development, return all chains.
      chainFilter = {};
    } else if (chainParam === "ALL") {
      if (!isAdmin) {
        return res.status(403).json({
          error: "ALL chains requires admin",
        });
      }

      chainFilter = {};
    } else if (chainParam === "TEST") {
      if (!isAdmin) {
        return res.status(403).json({
          error: "TEST chain requires admin",
        });
      }

      chainFilter = {
        chain: "TEST",
      };
    } else if (chainParam === "MAIN") {
      chainFilter = {
        chain: "MAIN",
      };
    } else {
      return res.status(400).json({
        error: "Invalid chain value",
      });
    }

    // ------------------------------------------------------------
    // Private bounty visibility
    // ------------------------------------------------------------

    const visibilityFilter = isAdmin
      ? {}
      : {
          OR: [
            // Public bounties
            {
              isPrivate: false,
            },

            ...(userId
              ? [
                  // Bounty creator
                  {
                    isPrivate: true,
                    createdBy: userId,
                  },

                  // Team member
                  {
                    isPrivate: true,
                    team: {
                      members: {
                        some: {
                          userId,
                        },
                      },
                    },
                  },

                  // Team favoriter
                  {
                    isPrivate: true,
                    team: {
                      favoritedBy: {
                        some: {
                          userId,
                        },
                      },
                    },
                  },
                ]
              : []),
          ],
        };

    // ------------------------------------------------------------
    // Combine all filters
    // ------------------------------------------------------------

    const where = {
      ...chainFilter,

      ...(teamId
        ? {
            teamId,
          }
        : {}),

      ...visibilityFilter,
    };

    // ------------------------------------------------------------
    // Snapshot the version BEFORE reading the DB.
    //
    // Any mutation that commits after this line will bump the
    // version and therefore won't affect this request's cache key.
    // ------------------------------------------------------------

    const version = await getVersion("bounties");

    // ------------------------------------------------------------
    // Cache
    //
    // Include everything that can change the result:
    // - version
    // - auth state
    // - page
    // - limit
    // - chain
    // - team
    // - viewer
    // ------------------------------------------------------------

    const cacheKey = `bounties:v${version}:${JSON.stringify({
      page,
      limit,
      chain: chainParam,
      teamId: teamId ?? null,
      viewer: isAdmin ? "admin" : (userId ?? "anon"),
      auth: isAuthed ? "full" : "public",
    })}`;

    const cached = await getCache(cacheKey);

    if (cached) {
      return res.json(cached);
    }

    // ------------------------------------------------------------
    // User selections
    // ------------------------------------------------------------

    const userSelect = isAuthed ? USER_SELECT : USER_SELECT_PUBLIC;

    const createdByUserSelect = isAuthed
      ? USER_SELECT_WITH_ROLE
      : USER_SELECT_PUBLIC;

    const assigneeUserSelect = isAuthed ? USER_SELECT_FULL : USER_SELECT_PUBLIC;

    // ------------------------------------------------------------
    // Query
    // ------------------------------------------------------------

    const [bounties, total] = await Promise.all([
      prisma.bounty.findMany({
        where,

        skip: (page - 1) * limit,
        take: limit,

        orderBy: {
          dateCreated: "desc",
        },

        include: {
          assignees: {
            include: {
              user: {
                select: userSelect,
              },
            },
          },

          assigneeUser: {
            select: assigneeUserSelect,
          },

          createdByUser: {
            select: createdByUserSelect,
          },

          // Team feature
          team: {
            select: {
              id: true,
              name: true,
              logo: true,
            },
          },
        },
      }),

      // IMPORTANT:
      // Count the exact same filtered dataset as findMany().
      prisma.bounty.count({
        where,
      }),
    ]);

    // ------------------------------------------------------------
    // Response
    // ------------------------------------------------------------

    const result = {
      data: bounties,
      total,
      page,
      limit,
    };

    await setCache(cacheKey, result, TTL.BOUNTY_LIST);

    return res.json(result);
  } catch (error) {
    console.error("Failed to fetch bounties:", error);

    return res.status(500).json({
      error: "Failed to fetch bounties",
    });
  }
});

// ─── Add / replace assignees (Admin only) ─────────────────────────────────────
// FIX: Replaced N individual prisma.bountyAssignee.create calls with a single
//      createMany, cutting round-trips from O(n) → O(1).
router.post("/:id/assignees", authenticate, isAdmin, async (req, res) => {
  try {
    const { id: bountyId } = req.params;
    const { userIds, notifyUsers = false } = req.body;

    if (!Array.isArray(userIds)) {
      return res.status(400).json({ error: "userIds must be an array" });
    }

    const bounty = await prisma.bounty.findUnique({
      where: { id: bountyId },
      select: { id: true, status: true, title: true },
    });
    if (!bounty) return res.status(404).json({ error: "Bounty not found" });

    // Snapshot BEFORE the transaction wipes/recreates the roster
    const existingAssignees = await prisma.bountyAssignee.findMany({
      where: { bountyId },
      include: { user: { select: USER_SELECT_FULL } },
    });
    const existingAssigneeIds = new Set(existingAssignees.map((a) => a.userId));
    const newAssigneeIds = new Set(userIds);

    const [freshBounty, assignees] = await prisma.$transaction(async (tx) => {
      await tx.bountyAssignee.deleteMany({ where: { bountyId } });

      if (userIds.length === 0) {
        await tx.bounty.update({
          where: { id: bountyId },
          data: { status: "CANCELLED", assignee: null },
        });
      } else {
        await tx.bountyAssignee.createMany({
          data: userIds.map((userId) => ({ bountyId, userId })),
        });
        if (["TO_DO", "CANCELLED"].includes(bounty.status)) {
          await tx.bounty.update({
            where: { id: bountyId },
            data: { status: "IN_PROGRESS" },
          });
        }
      }

      const created = await tx.bountyAssignee.findMany({
        where: { bountyId },
        include: { user: { select: USER_SELECT_FULL } },
      });

      const bountyRow = await tx.bounty.findUnique({
        where: { id: bountyId },
        include: {
          ...ASSIGNEE_INCLUDE,
          assigneeUser: { select: USER_SELECT_FULL },
          createdByUser: { select: USER_SELECT_WITH_ROLE },
        },
      });

      return [bountyRow, created];
    });

    sendRealtimeUpdate(
      "bounty_assignees_updated",
      { bountyId, assignees },
      req.user.id,
    );
    sendRealtimeUpdate("bounty_updated", freshBounty, req.user.id); // ← new
    await invalidateBounty(bountyId);
    res.status(200).json({ assignees });

    try {
      console.log("[assignee notify] notifyUsers:", notifyUsers);

      if (notifyUsers === true) {
        // Added: in the new list, weren't in the old list
        const added = assignees.filter(
          (a) => !existingAssigneeIds.has(a.userId) && a.user?.email,
        );

        // Removed: were in the old list, aren't in the new list
        const removed = existingAssignees.filter(
          (a) => !newAssigneeIds.has(a.userId) && a.user?.email,
        );

        console.log(
          "[assignee notify] added:",
          added.map((a) => a.user.email),
          "removed:",
          removed.map((a) => a.user.email),
        );

        const emailJobs = [];

        for (const a of added) {
          emailJobs.push(
            sendMailIfEnabled({
              to: a.user.email,
              subject: `🎉 You've been assigned: ${bounty.title}`,
              text: `Hi ${a.user.nickname || a.user.name},\n\nCongratulations! You've been assigned to "${bounty.title}". You can start working on it now.`,
              html: `
                <h2>🎉 Congratulations, you were assigned!</h2>
                <p>Hi ${a.user.nickname || a.user.name},</p>
                <p>You've been assigned to:</p>
                <p><strong>${bounty.title}</strong></p>
                <p>You can start working on it now.</p>
              `,
            }),
          );
        }

        for (const a of removed) {
          emailJobs.push(
            sendMailIfEnabled({
              to: a.user.email,
              subject: `Removed from bounty: ${bounty.title}`,
              text: `Hi ${a.user.nickname || a.user.name},\n\nYou've been removed from "${bounty.title}". Reach out to the bounty creator if you have questions.`,
              html: `
                <h2>You've been removed from a bounty</h2>
                <p>Hi ${a.user.nickname || a.user.name},</p>
                <p>You've been removed from:</p>
                <p><strong>${bounty.title}</strong></p>
                <p>Reach out to the bounty creator if you have questions.</p>
              `,
            }),
          );
        }

        if (emailJobs.length > 0) {
          await Promise.all(emailJobs);
        }
      }
    } catch (mailErr) {
      console.error("Assignee notification email failed:", mailErr);
    }
  } catch (error) {
    console.error("Error updating assignees:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to update assignees" });
    }
  }
});

// ─── Remove one assignee (Admin only) ────────────────────────────────────────
router.delete(
  "/:id/assignees/:userId",
  authenticate,
  isAdmin,
  async (req, res) => {
    try {
      const { id: bountyId, userId } = req.params;

      await prisma.bountyAssignee.delete({
        where: { bountyId_userId: { bountyId, userId } },
      });

      const freshBounty = await prisma.bounty.findUnique({
        where: { id: bountyId },
        include: {
          ...ASSIGNEE_INCLUDE,
          assigneeUser: { select: USER_SELECT_FULL },
          createdByUser: { select: USER_SELECT_WITH_ROLE },
        },
      });

      sendRealtimeUpdate(
        "bounty_assignees_updated",
        { bountyId, removedUserId: userId },
        req.user.id,
      );
      sendRealtimeUpdate("bounty_updated", freshBounty, req.user.id); // ← new
      await invalidateBounty(bountyId);
      res.json({ message: "Assignee removed successfully" });
    } catch (error) {
      console.error("Error removing assignee:", error);
      res.status(500).json({ error: "Failed to remove assignee" });
    }
  },
);

// ─── Get assignees for a bounty ───────────────────────────────────────────────
router.get("/:id/assignees", authenticate, async (req, res) => {
  try {
    const cacheKey = `assignees:${req.params.id}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);
    const assignees = await prisma.bountyAssignee.findMany({
      where: { bountyId: req.params.id },
      include: { user: { select: USER_SELECT_FULL } },
      orderBy: { assignedAt: "asc" },
    });
    await setCache(cacheKey, assignees, TTL.ASSIGNEES);
    res.json(assignees);
  } catch (error) {
    console.error("Error fetching assignees:", error);
    res.status(500).json({ error: "Failed to fetch assignees" });
  }
});

// ─── Authorize payment (Admin only) ──────────────────────────────────────────
router.put(
  "/:id/authorize-payment",
  authenticate,
  isAdmin,
  async (req, res) => {
    try {
      const { paymentAuthorized } = req.body;

      const updated = await prisma.bounty.update({
        where: { id: req.params.id },
        data: {
          ...(paymentAuthorized !== undefined && {
            paymentAuthorized,
            paymentAuthorizedAt: paymentAuthorized ? new Date() : null,
          }),
        },
      });

      sendRealtimeUpdate("payment_authorized", updated, req.user.id);
      await invalidateBounty(req.params.id);
      res.json(updated);
    } catch (error) {
      console.error("Error updating bounty:", error);
      res.status(500).json({ error: "Failed to update bounty" });
    }
  },
);

// ─── Approve bounty (Admin) ───────────────────────────────────────────────────
// FIX: id was cast to Number() but schema uses cuid strings — removed the cast.
router.patch("/:id/approve", authenticate, isAdmin, async (req, res) => {
  try {
    const updated = await prisma.bounty.update({
      where: { id: req.params.id },
      data: { approved: true },
    });
    sendRealtimeUpdate("bounty_approved", updated, req.user.id);
    await invalidateBounty(req.params.id);
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to approve bounty" });
  }
});

// ─── Change status (Admin) ────────────────────────────────────────────────────
// FIX: Collapsed the fetch + update into a single transaction so the DB isn't
//      hit twice serially for every status change.
router.patch("/:id/status", authenticate, isAdmin, async (req, res) => {
  try {
    const { status, winnerId } = req.body;
    const bountyId = req.params.id;

    const bounty = await prisma.bounty.findUnique({
      where: { id: bountyId },
      select: {
        id: true,
        status: true,
        assignee: true,
        assignees: { select: { userId: true } },
      },
    });

    if (!bounty) return res.status(404).json({ error: "Bounty not found" });

    const isApproved = !["CANCELLED", "TO_DO"].includes(status);
    let paymentAssigneeId = bounty.assignee;

    if (status === "DONE") {
      const count = bounty.assignees.length;
      if (count === 1) {
        paymentAssigneeId = bounty.assignees[0].userId;
      } else if (count > 1) {
        if (!winnerId) {
          return res.status(400).json({
            error: "Winner selection required",
            requiresWinner: true,
            assignees: bounty.assignees,
          });
        }
        if (!bounty.assignees.some((a) => a.userId === winnerId)) {
          return res
            .status(400)
            .json({ error: "Selected winner is not an assignee" });
        }
        paymentAssigneeId = winnerId;
      }
    }

    const updated = await prisma.bounty.update({
      where: { id: bountyId },
      data: {
        status,
        isApproved,
        ...(status === "DONE" && {
          assignee: paymentAssigneeId,
          completedAt: new Date(),
        }),
        ...(status !== "DONE" &&
          bounty.status === "DONE" && { completedAt: null }),
      },
      include: {
        ...ASSIGNEE_INCLUDE,
        assigneeUser: { select: USER_SELECT_FULL },
        createdByUser: {
          select: USER_SELECT_WITH_ROLE,
        },
        team: { select: { id: true, name: true, logo: true } },
      },
    });

    sendRealtimeUpdate("bounty_status_changed", updated, req.user.id);
    await invalidateBounty(bountyId);
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update bounty status" });
  }
});

// ─── Submit work ──────────────────────────────────────────────────────────────
router.post("/:id/submit", authenticate, async (req, res) => {
  try {
    const { id: bountyId } = req.params;
    const { description, deliverableUrl } = req.body;
    const userId = req.user.id;

    if (!description?.trim()) {
      return res.status(400).json({ error: "Work description is required" });
    }

    // Single query — grab only what validation needs
    const bounty = await prisma.bounty.findUnique({
      where: { id: bountyId },
      select: {
        id: true,
        isApproved: true,
        status: true,
        workSubmissions: {
          where: {
            submittedBy: userId,
            status: { in: ["pending", "approved"] },
          },
          select: { id: true },
        },
      },
    });

    if (!bounty) return res.status(404).json({ error: "Bounty not found" });

    const isAssigned = await prisma.bountyAssignee.findUnique({
      where: { bountyId_userId: { bountyId, userId } },
      select: { userId: true },
    });
    if (!isAssigned)
      return res
        .status(403)
        .json({ error: "You are not assigned to this bounty" });
    if (!bounty.isApproved)
      return res
        .status(400)
        .json({ error: "Bounty must be approved before submitting work" });
    if (!["TO_DO", "IN_PROGRESS", "IN_REVIEW"].includes(bounty.status)) {
      return res.status(400).json({
        error: "Work cannot be submitted for bounties in this status",
      });
    }
    if (bounty.workSubmissions.length > 0) {
      return res
        .status(400)
        .json({ error: "You have already submitted work for this bounty" });
    }

    // Transaction: create submission + update status atomically
    const [workSubmission, updatedBounty] = await prisma.$transaction([
      prisma.workSubmission.create({
        data: {
          bountyId,
          submittedBy: userId,
          description: description.trim(),
          deliverableUrl: deliverableUrl?.trim() || null,
          status: "pending",
        },
        include: {
          submitterUser: {
            select: USER_SELECT_BASIC,
          },
        },
      }),
      prisma.bounty.update({
        where: { id: bountyId },
        data: { status: "IN_REVIEW" },
        include: {
          createdByUser: {
            select: USER_SELECT_WITH_ROLE,
          },
          assigneeUser: {
            select: USER_SELECT_WITH_ROLE,
          },
          workSubmissions: {
            include: {
              submitterUser: {
                select: USER_SELECT_BASIC,
              },
            },
          },
        },
      }),
    ]);

    sendRealtimeUpdate("work_submitted", workSubmission, userId);
    sendRealtimeUpdate("bounty_updated", updatedBounty, userId);
    await invalidateSubmissions(bountyId, userId);

    res.json({
      message: "Work submitted successfully",
      workSubmission,
      bounty: updatedBounty,
    });
  } catch (error) {
    console.error("Error submitting work:", error);
    res
      .status(500)
      .json({ error: "Failed to submit work", details: error.message });
  }
});

router.get("/my-submissions", authenticate, async (req, res) => {
  try {
    const cacheKey = `submissions:user:${req.user.id}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const submissions = await prisma.workSubmission.findMany({
      where: { submittedBy: req.user.id },
      include: {
        bounty: {
          select: {
            id: true,
            title: true,
            bountyAmount: true,
            status: true,
            timeToComplete: true,
          },
        },
      },
      orderBy: { submittedAt: "desc" },
    });

    await setCache(cacheKey, submissions, TTL.SUBMISSIONS);
    res.json(submissions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Get submissions (creator / admin / assignee) ─────────────────────────────
router.get("/:id/submissions", authenticate, async (req, res) => {
  try {
    const { id: bountyId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const bounty = await prisma.bounty.findUnique({
      where: { id: bountyId },
      select: { id: true, createdBy: true },
    });
    if (!bounty) return res.status(404).json({ error: "Bounty not found" });

    const isCreatorOrAdmin =
      bounty.createdBy === userId || userRole === "ADMIN";

    let isAssignee = false;
    if (!isCreatorOrAdmin) {
      const assignee = await prisma.bountyAssignee.findUnique({
        where: { bountyId_userId: { bountyId, userId } },
        select: { userId: true },
      });
      isAssignee = !!assignee;
    }

    if (!isCreatorOrAdmin && !isAssignee) {
      return res
        .status(403)
        .json({ error: "You do not have permission to view submissions" });
    }

    // Only cache admin/creator view — assignee view is filtered per-user
    // so sharing a cache key would leak data or serve wrong results
    const cacheKey = isCreatorOrAdmin ? `submissions:${bountyId}` : null;

    if (cacheKey) {
      const cached = await getCache(cacheKey);
      if (cached) {
        console.log("Cache sub Hit");
        return res.json(cached);
      }
      console.log("Cache sub Miss");
    }

    const submissions = await prisma.workSubmission.findMany({
      where: {
        bountyId,
        ...(!isCreatorOrAdmin && { submittedBy: userId }),
      },
      include: {
        submitterUser: {
          select: USER_SELECT_BASIC,
        },
      },
      orderBy: { submittedAt: "desc" },
    });

    const result = submissions.map((s) => ({
      ...s,
      attachments: s.attachments ? JSON.parse(s.attachments) : [],
    }));

    if (cacheKey) {
      await setCache(cacheKey, result, TTL.SUBMISSIONS);
    }

    res.json(result);
  } catch (error) {
    console.error("Error fetching submissions:", error);
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
});

router.get("/submissions/all", authenticate, isAdmin, async (req, res) => {
  try {
    const cacheKey = "submissions:all";
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const submissions = await prisma.workSubmission.findMany({
      include: {
        submitterUser: {
          select: USER_SELECT_BASIC,
        },
      },
      orderBy: { submittedAt: "desc" },
    });

    const result = submissions.map((s) => ({
      ...s,
      attachments: s.attachments ? JSON.parse(s.attachments) : [],
    }));

    await setCache(cacheKey, result, TTL.SUBMISSIONS);
    res.json(result);
  } catch (error) {
    console.error("Error fetching all submissions:", error);
    res.status(500).json({ error: "Failed to fetch submissions" });
  }
});

// ─── Review submission ────────────────────────────────────────────────────────
router.patch(
  "/submissions/:submissionId/review",
  authenticate,
  async (req, res) => {
    try {
      const { submissionId } = req.params;
      const { status, reviewNotes } = req.body;
      const userId = req.user.id;
      const userRole = req.user.role;

      if (!["approved", "rejected", "needs_revision"].includes(status)) {
        return res.status(400).json({ error: "Invalid review status" });
      }

      const submission = await prisma.workSubmission.findUnique({
        where: { id: submissionId },
        include: {
          bounty: {
            select: { id: true, createdBy: true, status: true, assignee: true },
          },
          submitterUser: { select: USER_SELECT_MINIMAL },
        },
      });
      if (!submission)
        return res.status(404).json({ error: "Submission not found" });
      if (submission.bounty.createdBy !== userId && userRole !== "ADMIN") {
        return res.status(403).json({
          error: "You do not have permission to review this submission",
        });
      }

      let newBountyStatus = submission.bounty.status;

      if (status === "approved") {
        if (submission.bounty.status !== "DONE") {
          newBountyStatus = "DONE";
        }
      } else if (["rejected", "needs_revision"].includes(status)) {
        const approvedExists = await prisma.workSubmission.findFirst({
          where: {
            bountyId: submission.bounty.id,
            status: "approved",
            id: { not: submissionId },
          },
          select: { id: true },
        });
        if (!approvedExists) newBountyStatus = "IN_PROGRESS";
      }

      const [updatedSubmission, updatedBounty] = await prisma.$transaction(
        async (tx) => {
          const updSub = await tx.workSubmission.update({
            where: { id: submissionId },
            data: {
              status,
              reviewNotes: reviewNotes?.trim() || null,
              reviewedBy: userId,
              reviewedAt: new Date(),
            },
            include: {
              submitterUser: { select: USER_SELECT_BASIC },
              reviewerUser: { select: USER_SELECT_BASIC },
            },
          });

          if (status === "rejected") {
            await tx.bountyAssignee.deleteMany({
              where: {
                bountyId: submission.bounty.id,
                userId: submission.submittedBy,
              },
            });
          }

          const updBounty = await tx.bounty.update({
            where: { id: submission.bounty.id },
            data: {
              status: newBountyStatus,
              ...(status === "approved" &&
                submission.bounty.status !== "DONE" && {
                  assignee: submission.submittedBy,
                  completedAt: new Date(),
                }),
              ...(status !== "approved" &&
                submission.bounty.status === "DONE" &&
                newBountyStatus !== "DONE" && { completedAt: null }),
              ...(status === "rejected" &&
                submission.bounty.assignee === submission.submittedBy && {
                  assignee: null,
                }),
            },
            include: {
              createdByUser: { select: USER_SELECT_WITH_ROLE },
              assigneeUser: { select: USER_SELECT_WITH_ROLE },
              team: { select: { id: true, name: true, logo: true } },
            },
          });

          return [updSub, updBounty];
        },
      );

      sendRealtimeUpdate("submission_reviewed", updatedSubmission, req.user.id);
      sendRealtimeUpdate("bounty_updated", updatedBounty, req.user.id);
      await invalidateSubmissions(submission.bounty.id, submission.submittedBy);
      await invalidateBounty(submission.bounty.id);

      res.json({
        message: "Submission reviewed successfully",
        submission: updatedSubmission,
        bounty: updatedBounty,
      });
    } catch (error) {
      console.error("Error reviewing submission:", error);
      res.status(500).json({ error: "Failed to review submission" });
    }
  },
);

// ─── Edit submission (submitter only, within 15 min of submission) ────────────
// ─── Edit submission (submitter only) ─────────────────────────────────────
// "pending" submissions: 15-min self-correction window from original submit.
// "needs_revision" submissions: editable any time (admin explicitly reopened
// it) — saving resubmits it as "pending" and restarts the 15-min window from
// that save, so it now behaves like a normal fresh submission again.
router.patch("/submissions/:submissionId", authenticate, async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { description, deliverableUrl } = req.body;
    const userId = req.user.id;

    if (!description?.trim()) {
      return res.status(400).json({ error: "Work description is required" });
    }

    const submission = await prisma.workSubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        submittedBy: true,
        submittedAt: true,
        bountyId: true,
        status: true,
      },
    });
    if (!submission)
      return res.status(404).json({ error: "Submission not found" });

    if (submission.submittedBy !== userId) {
      return res
        .status(403)
        .json({ error: "You can only edit your own submission" });
    }

    if (submission.status === "pending") {
      const EDIT_WINDOW_MS = 15 * 60 * 1000;
      const elapsed = Date.now() - new Date(submission.submittedAt).getTime();
      if (elapsed > EDIT_WINDOW_MS) {
        return res.status(400).json({ error: "Edit window has expired" });
      }
    } else if (submission.status !== "needs_revision") {
      return res
        .status(400)
        .json({ error: "Submission has already been reviewed" });
    }

    const wasRevision = submission.status === "needs_revision";

    const [updated, updatedBounty] = await prisma.$transaction(async (tx) => {
      const updSub = await tx.workSubmission.update({
        where: { id: submissionId },
        data: {
          description: description.trim(),
          deliverableUrl: deliverableUrl?.trim() || null,
          ...(wasRevision && {
            status: "pending",
            submittedAt: new Date(),
            reviewedBy: null,
            reviewedAt: null,
            reviewNotes: null,
          }),
        },
        include: {
          submitterUser: { select: USER_SELECT_BASIC },
        },
      });

      let updBounty = null;
      if (wasRevision) {
        updBounty = await tx.bounty.update({
          where: { id: submission.bountyId },
          data: { status: "IN_REVIEW" },
          include: {
            createdByUser: { select: USER_SELECT_WITH_ROLE },
            assigneeUser: { select: USER_SELECT_WITH_ROLE },
          },
        });
      }

      return [updSub, updBounty];
    });

    sendRealtimeUpdate("submission_edited", updated, userId);
    if (updatedBounty)
      sendRealtimeUpdate("bounty_updated", updatedBounty, userId);
    await invalidateSubmissions(submission.bountyId, userId);
    if (wasRevision) await invalidateBounty(submission.bountyId);

    res.json({
      message: "Submission updated successfully",
      workSubmission: updated,
      ...(updatedBounty && { bounty: updatedBounty }),
    });
  } catch (error) {
    console.error("Error editing submission:", error);
    res.status(500).json({ error: "Failed to edit submission" });
  }
});

// ─── Reject all other pending submissions once one is approved ──────────────
router.patch(
  "/submissions/:submissionId/reject-others",
  authenticate,
  async (req, res) => {
    try {
      const { submissionId } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role;

      const keptSubmission = await prisma.workSubmission.findUnique({
        where: { id: submissionId },
        select: {
          id: true,
          bountyId: true,
          submittedBy: true,
          status: true,
          bounty: { select: { id: true, createdBy: true, assignee: true } },
        },
      });
      if (!keptSubmission)
        return res.status(404).json({ error: "Submission not found" });

      if (keptSubmission.bounty.createdBy !== userId && userRole !== "ADMIN") {
        return res.status(403).json({
          error:
            "You do not have permission to manage this bounty's submissions",
        });
      }

      if (keptSubmission.status !== "approved") {
        return res.status(400).json({
          error: "Can only reject other submissions once one has been approved",
        });
      }

      const othersPending = await prisma.workSubmission.findMany({
        where: {
          bountyId: keptSubmission.bountyId,
          id: { not: submissionId },
          status: "pending",
        },
        select: { id: true, submittedBy: true },
      });

      if (othersPending.length === 0) {
        return res.json({
          message: "No other pending submissions",
          rejectedCount: 0,
        });
      }

      const rejectedUserIds = [
        ...new Set(othersPending.map((s) => s.submittedBy)),
      ];

      await prisma.$transaction(async (tx) => {
        await tx.workSubmission.updateMany({
          where: { id: { in: othersPending.map((s) => s.id) } },
          data: {
            status: "rejected",
            reviewedBy: userId,
            reviewedAt: new Date(),
          },
        });

        // Unassign the rejected submitters
        await tx.bountyAssignee.deleteMany({
          where: {
            bountyId: keptSubmission.bountyId,
            userId: { in: rejectedUserIds },
          },
        });

        // Clean up the legacy single `assignee` field if it pointed to a loser
        if (rejectedUserIds.includes(keptSubmission.bounty.assignee)) {
          await tx.bounty.update({
            where: { id: keptSubmission.bountyId },
            data: { assignee: keptSubmission.submittedBy },
          });
        }
      });

      sendRealtimeUpdate(
        "submissions_rejected_others",
        {
          bountyId: keptSubmission.bountyId,
          keptSubmissionId: submissionId,
          rejectedSubmissionIds: othersPending.map((s) => s.id),
          rejectedUserIds,
        },
        req.user.id,
      );
      sendRealtimeUpdate(
        "bounty_assignees_updated",
        { bountyId: keptSubmission.bountyId },
        req.user.id,
      );

      await invalidateSubmissions(keptSubmission.bountyId);
      await invalidateBounty(keptSubmission.bountyId);

      res.json({
        message: "Other submissions rejected",
        rejectedCount: othersPending.length,
      });
    } catch (error) {
      console.error("Error rejecting other submissions:", error);
      res.status(500).json({ error: "Failed to reject other submissions" });
    }
  },
);

// ─── Fetch all users ──────────────────────────────────────────────────────────
router.get("/users", authenticate, async (req, res) => {
  try {
    const cacheKey = "users:all";
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        nickname: true,
        email: true,
        role: true,
        z_address: true,
        UA_address: true,
        avatar: true,
        emailNotifications: true,
        pushNotifications: true,
      },
    });
    await setCache(cacheKey, users, TTL.USERS);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Switch role ──────────────────────────────────────────────────────────────
router.patch("/switch-role", authenticate, async (req, res) => {
  try {
    const { role } = req.body;
    if (!["ADMIN", "CLIENT"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, isRobin: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.isRobin)
      return res.status(403).json({ error: "Role switching not permitted" });

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { role },
      select: {
        id: true,
        name: true,
        nickname: true,
        email: true,
        role: true,
        avatar: true,
        isRobin: true,
        isManOfSteel: true,
        z_address: true,
        UA_address: true,
      },
    });
    await delCache("users:all");
    res.json({ user: updated });
  } catch (error) {
    console.error("Failed to switch role:", error);
    res.status(500).json({ error: "Failed to switch role" });
  }
});

// ─── My applications ──────────────────────────────────────────────────────────
router.get("/my-applications", authenticate, async (req, res) => {
  try {
    const cacheKey = `applications:user:${req.user.id}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);
    const applications = await prisma.bountyApplication.findMany({
      where: { applicantId: req.user.id },
      include: {
        bounty: {
          select: {
            id: true,
            title: true,
            bountyAmount: true,
            status: true,
            timeToComplete: true,
          },
        },
      },
      orderBy: { appliedAt: "desc" },
    });
    await setCache(cacheKey, applications, TTL.APPLICATIONS);
    res.json(applications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── All applications (Admin) ─────────────────────────────────────────────────
router.get("/all-applications", authenticate, isAdmin, async (req, res) => {
  try {
    const cacheKey = "applications:all";
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);
    const applications = await prisma.bountyApplication.findMany({
      include: {
        bounty: {
          select: {
            id: true,
            title: true,
            bountyAmount: true,
            status: true,
            timeToComplete: true,
          },
        },
      },
      orderBy: { appliedAt: "desc" },
    });
    await setCache(cacheKey, applications, TTL.APPLICATIONS);
    res.json(applications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Categories ───────────────────────────────────────────────────────────────
router.get("/categories", async (req, res) => {
  try {
    const cacheKey = "categories:all";
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const categories = await prisma.bountyCategory.findMany({
      orderBy: { name: "asc" },
    });
    await setCache(cacheKey, categories, TTL.CATEGORIES);
    res.json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

router.post("/categories", authenticate, isAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim())
      return res.status(400).json({ error: "Category name is required" });

    const existing = await prisma.bountyCategory.findUnique({
      where: { name: name.trim() },
    });
    if (existing)
      return res.status(400).json({ error: "Category already exists" });

    const category = await prisma.bountyCategory.create({
      data: { name: name.trim() },
    });
    await delCache("categories:all");
    sendRealtimeUpdate("category_created", category, req.user.id);
    res.status(201).json(category);
  } catch (error) {
    console.error("Error creating category:", error);
    res.status(500).json({ error: "Failed to create category" });
  }
});

router.put(
  "/categories/:categoriesId",
  authenticate,
  isAdmin,
  async (req, res) => {
    try {
      const { categoriesId } = req.params;
      const { name } = req.body;
      if (!name?.trim())
        return res.status(400).json({ error: "Category name is required" });

      const existing = await prisma.bountyCategory.findFirst({
        where: { name: name.trim(), id: { not: parseInt(categoriesId) } },
      });
      if (existing)
        return res.status(400).json({ error: "Category name already exists" });

      const category = await prisma.bountyCategory.update({
        where: { id: parseInt(categoriesId) },
        data: { name: name.trim() },
      });
      await delCache("categories:all");
      sendRealtimeUpdate("category_updated", category, req.user.id);
      res.json(category);
    } catch (error) {
      console.error("Error updating category:", error);
      res.status(500).json({ error: "Failed to update category" });
    }
  },
);

router.delete(
  "/categories/:categoriesId",
  authenticate,
  isAdmin,
  async (req, res) => {
    try {
      const id = parseInt(req.params.categoriesId);

      const category = await prisma.bountyCategory.findUnique({
        where: { id },
        include: { bounties: { select: { id: true } } },
      });
      if (!category)
        return res.status(404).json({ error: "Category not found" });
      if (category.bounties.length > 0) {
        return res.status(400).json({
          error: "Cannot delete category with existing bounties",
          bountyCount: category.bounties.length,
        });
      }

      await prisma.bountyCategory.delete({ where: { id } });
      await delCache("categories:all");
      sendRealtimeUpdate("category_deleted", { id }, req.user.id);
      res.json({ message: "Category deleted successfully" });
    } catch (error) {
      console.error("Error deleting category:", error);
      res.status(500).json({ error: "Failed to delete category" });
    }
  },
);

// ─── Applications for a bounty (admin / creator) ──────────────────────────────
router.get("/:bountyId/applications", authenticate, async (req, res) => {
  try {
    const { bountyId } = req.params;
    const bounty = await prisma.bounty.findUnique({
      where: { id: bountyId },
      select: { id: true, createdBy: true },
    });
    if (!bounty) return res.status(404).json({ error: "Bounty not found" });
    if (req.user.role !== "ADMIN" && bounty.createdBy !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const cacheKey = `applications:bounty:${bountyId}`;

    const cached = await getCache(cacheKey);

    if (cached) {
      console.log("App Hit");
      return res.json(cached);
    }

    const applications = await prisma.bountyApplication.findMany({
      where: { bountyId },
      include: {
        applicantUser: {
          select: USER_SELECT_BASIC,
        },
      },
      orderBy: { appliedAt: "desc" },
    });

    await setCache(cacheKey, applications, TTL.APPLICATIONS);
    res.json(applications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Update application status (Admin) ───────────────────────────────────────
router.put("/applications/:applicationId", authenticate, async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { status } = req.body;

    const application = await prisma.bountyApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        bountyId: true,
        applicantId: true,
        bounty: {
          select: {
            title: true,
            createdBy: true,
            teamId: true,
          },
        },
      },
    });

    if (!application) {
      return res.status(404).json({
        error: "Application not found",
      });
    }

    // Supports both normal bounty owners and team-based bounty management.
    if (!(await canManageBounty(application.bounty, req.user))) {
      return res.status(403).json({
        error: "You do not have permission to manage this application",
      });
    }

    const [result, updatedBounty] = await prisma.$transaction(async (tx) => {
      const updated = await tx.bountyApplication.update({
        where: {
          id: applicationId,
        },
        data: {
          status,
          reviewedAt: new Date(),
          reviewedBy: req.user.id,
        },
        include: {
          applicantUser: {
            select: USER_SELECT_MINIMAL,
          },
        },
      });

      let freshBounty = null;

      if (status === "accepted") {
        await tx.bountyAssignee.upsert({
          where: {
            bountyId_userId: {
              bountyId: application.bountyId,
              userId: application.applicantId,
            },
          },
          update: {},
          create: {
            bountyId: application.bountyId,
            userId: application.applicantId,
          },
        });

        await tx.bounty.update({
          where: {
            id: application.bountyId,
          },
          data: {
            status: "IN_PROGRESS",
          },
        });

        // Read the bounty inside the same transaction so the returned
        // assignees list includes the newly accepted applicant.
        freshBounty = await tx.bounty.findUnique({
          where: {
            id: application.bountyId,
          },
          include: {
            ...ASSIGNEE_INCLUDE,
            assigneeUser: {
              select: USER_SELECT_FULL,
            },
            createdByUser: {
              select: USER_SELECT_WITH_ROLE,
            },
            team: {
              select: {
                id: true,
                name: true,
                logo: true,
              },
            },
          },
        });
      }

      return [updated, freshBounty];
    });

    // Invalidate affected caches after the transaction commits.
    await invalidateApplications(application.applicantId, application.bountyId);

    await invalidateBounty(application.bountyId);

    // Notify clients about the application change.
    sendRealtimeUpdate("application_updated", result, req.user.id);

    // When accepted, also notify clients that the bounty itself changed.
    if (updatedBounty) {
      sendRealtimeUpdate("bounty_updated", updatedBounty, req.user.id);
    }

    res.json(result);

    // Fire-and-forget email notification.
    if (status === "accepted" && result.applicantUser?.email) {
      const recipient = result.applicantUser;
      const bountyTitle = application.bounty?.title ?? "a bounty";

      sendMailIfEnabled({
        to: recipient.email,
        subject: `You've been assigned: ${bountyTitle}`,
        text: `Hi ${recipient.nickname || recipient.name},

Your application was accepted and you've been assigned to "${bountyTitle}". You can start working on it now.`,

        html: `
          <h2>You've been assigned a bounty</h2>
          <p>Hi ${recipient.nickname || recipient.name},</p>
          <p>Your application was accepted and you've been assigned to:</p>
          <p><strong>${bountyTitle}</strong></p>
          <p>You can start working on it now.</p>
        `,
      }).catch((mailErr) => {
        console.error("Assignment notification email failed:", mailErr);
      });
    }
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message,
    });
  }
});

// ─── Withdraw application (applicant only) ────────────────────────────────────
router.delete(
  "/applications/:applicationId",
  authenticate,
  async (req, res) => {
    try {
      const { applicationId } = req.params;

      const application = await prisma.bountyApplication.findUnique({
        where: { id: applicationId },
        select: { id: true, applicantId: true, status: true, bountyId: true },
      });
      if (!application)
        return res.status(404).json({ error: "Application not found" });
      if (application.applicantId !== req.user.id)
        return res.status(403).json({ error: "Access denied" });
      if (application.status !== "pending")
        return res
          .status(400)
          .json({ error: "Cannot withdraw a reviewed application" });

      await prisma.bountyApplication.delete({ where: { id: applicationId } });
      await invalidateApplications(
        application.applicantId,
        application.bountyId,
      );
      await invalidateBounty(application.bountyId);
      sendRealtimeUpdate(
        "application_deleted",
        { id: applicationId, bountyId: application.bountyId },
        req.user.id,
      );
      res.json({ message: "Application withdrawn successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  },
);

// ─── Apply to bounty ──────────────────────────────────────────────────────────
router.post("/apply", authenticate, async (req, res) => {
  try {
    const { bountyId, applicantId, message } = req.body;

    const bounty = await prisma.bounty.findUnique({
      where: { id: bountyId },
      select: {
        id: true,
        assignee: true,
        createdBy: true,
        isPrivate: true,
        teamId: true,
      },
    });
    if (!bounty) return res.status(404).json({ error: "Bounty not found" });
    if (!(await canViewPrivateBounty(bounty, req.user))) {
      return res.status(404).json({ error: "Bounty not found" });
    }
    if (bounty.assignee)
      return res.status(400).json({ error: "Bounty already assigned" });
    if (bounty.createdBy === applicantId)
      return res.status(400).json({ error: "Cannot apply to your own bounty" });

    const existing = await prisma.bountyApplication.findUnique({
      where: { bountyId_applicantId: { bountyId, applicantId } },
      select: { id: true },
    });
    if (existing)
      return res
        .status(400)
        .json({ error: "You have already applied to this bounty" });

    const application = await prisma.bountyApplication.create({
      data: { bountyId, applicantId, message: message.trim() },
      include: {
        bounty: { select: { id: true, title: true, bountyAmount: true } },
        applicantUser: { select: USER_SELECT_MINIMAL },
      },
    });
    await invalidateApplications(applicantId);
    await invalidateBounty(application.bountyId);

    sendRealtimeUpdate("application_created", application, applicantId);
    res.status(201).json(application);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Export payments (Admin) ──────────────────────────────────────────────────
router.get("/export-payments", authenticate, isAdmin, async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(new Date(to).setHours(23, 59, 59, 999));

    const bounties = await prisma.bounty.findMany({
      where: { isPaid: true, ...(from || to ? { paidAt: dateFilter } : {}) },
      include: {
        assigneeUser: {
          select: USER_SELECT_EXPORT,
        },
        assignees: {
          include: {
            user: {
              select: USER_SELECT_EXPORT,
            },
          },
        },
      },
      orderBy: { paidAt: "desc" },
    });

    res.json({ success: true, data: bounties });
  } catch (error) {
    console.error("Error fetching export data:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch export data" });
  }
});

router.get("/export-completed", authenticate, isAdmin, async (req, res) => {
  try {
    const bounties = await prisma.bounty.findMany({
      where: { status: "DONE", chain: "MAIN" },
      include: {
        assigneeUser: {
          select: USER_SELECT_EXPORT,
        },
        assignees: {
          include: {
            user: {
              select: USER_SELECT_EXPORT,
            },
          },
        },
      },
      orderBy: { completedAt: "desc" },
    });
    res.json({ success: true, data: bounties });
  } catch (error) {
    console.error("Error fetching completed bounties:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch completed bounties" });
  }
});

// ─── My bounties (creator or assignee — full list, no pagination) ────────────
router.get("/mine", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    const where =
      userRole === "ADMIN"
        ? {}
        : {
            OR: [
              { createdBy: userId },
              { assignee: userId },
              { assignees: { some: { userId } } },
            ],
          };

    const bounties = await prisma.bounty.findMany({
      where,
      orderBy: { dateCreated: "desc" },
      include: {
        assignees: {
          include: { user: { select: USER_SELECT } },
        },
        assigneeUser: {
          select: USER_SELECT_FULL,
        },
        createdByUser: {
          select: USER_SELECT_WITH_ROLE,
        },
      },
    });

    res.json({ data: bounties, total: bounties.length });
  } catch (error) {
    console.error("Error fetching my bounties:", error);
    res.status(500).json({ error: "Failed to fetch your bounties" });
  }
});

// ─── Stats totals (Admin) ──────────────────────────────────────────────────────
router.get("/stats/totals", authenticate, isAdmin, async (req, res) => {
  try {
    const cacheKey = "stats:totals";

    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const [totalAmountResult, countResult, unpaidDoneCount] = await Promise.all(
      [
        // Sum ALL bounty amounts — no pagination, one DB round-trip
        prisma.bounty.aggregate({
          where: { chain: "MAIN" },
          _sum: { bountyAmount: true },
          _count: { id: true },
        }),
        // Separate counts per status so the dashboard can show accurate numbers
        prisma.bounty.groupBy({
          by: ["status"],
          where: { chain: "MAIN" },
          _count: { id: true },
        }),
        // DONE but not yet paid — groupBy status alone can't capture this,
        // since isPaid is orthogonal to status
        prisma.bounty.count({
          where: { chain: "MAIN", status: "DONE", isPaid: false },
        }),
      ],
    );

    const statusCounts = countResult.reduce((acc, row) => {
      acc[row.status] = row._count.id;
      return acc;
    }, {});

    const result = {
      totalBountyAmount: totalAmountResult._sum.bountyAmount ?? 0,
      totalBountyCount: totalAmountResult._count.id,
      statusCounts,
      unpaidDoneCount,
    };

    // Cache for 60 s — short TTL so it reflects recent changes quickly
    await setCache(cacheKey, result, 60);

    res.json(result);
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ─── Get single bounty ────────────────────────────────────────────────────
router.get("/:id", optionalAuthenticate, async (req, res) => {
  try {
    const bountyId = req.params.id;
    const isAuthed = Boolean(req.user);
    const userId = req.user?.id ?? "anon";
    const isAdmin = req.user?.role === "ADMIN";
    const version = await getVersion("bounties");

    // Scoped per-viewer, not just per-auth-state — matches the GET / pattern
    // and prevents one user's cached view of a private bounty leaking to another.
    const cacheKey = `bounty:v${version}:${isAdmin ? "admin" : userId}:${bountyId}`;

    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const userSelect = isAuthed ? USER_SELECT_FULL : USER_SELECT_PUBLIC;
    const createdByUserSelect = isAuthed
      ? USER_SELECT_WITH_ROLE
      : USER_SELECT_PUBLIC;

    const bounty = await prisma.bounty.findUnique({
      where: { id: bountyId },
      include: {
        assigneeUser: { select: userSelect },
        assignees: { include: { user: { select: userSelect } } },
        createdByUser: { select: createdByUserSelect },
        team: { select: { id: true, name: true, logo: true } },
      },
    });

    if (!bounty) return res.status(404).json({ error: "Bounty not found" });
    if (!(await canViewPrivateBounty(bounty, req.user))) {
      return res.status(404).json({ error: "Bounty not found" });
    }

    await setCache(cacheKey, bounty, TTL.BOUNTY_SINGLE);
    res.json(bounty);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch bounty" });
  }
});

// ─── Edit bounty (Admin) ──────────────────────────────────────────────────────
router.put("/:id", authenticate, async (req, res) => {
  try {
    const existing = await prisma.bounty.findUnique({
      where: { id: req.params.id },
      select: { createdBy: true, teamId: true },
    });
    if (!existing) return res.status(404).json({ error: "Bounty not found" });

    if (!(await canManageBounty(existing, req.user))) {
      return res
        .status(403)
        .json({ error: "You do not have permission to edit this bounty" });
    }

    // Only global admins may reassign a bounty's approval/status via this route
    if (req.body.isApproved !== undefined && req.user.role !== "ADMIN") {
      return res
        .status(403)
        .json({ error: "Only admins can change approval status" });
    }

    if (
      req.body.chain !== undefined &&
      !["MAIN", "TEST"].includes(req.body.chain)
    ) {
      return res.status(400).json({ error: "Invalid chain value" });
    }

    if (req.body.teamId && req.user.role !== "ADMIN") {
      // Non-admins can't move a bounty to a different team via edit
      return res.status(403).json({ error: "Cannot reassign team" });
    }

    const { notifyUsers = false } = req.body;
    let resolvedIsPrivate;
    if (req.body.teamId !== undefined) {
      if (req.body.teamId) {
        const newTeam = await prisma.team.findUnique({
          where: { id: req.body.teamId },
          select: { isPrivate: true, isVerified: true, name: true },
        });
        if (!newTeam) {
          return res.status(404).json({ error: "Team not found" });
        }
        if (!newTeam.isVerified) {
          return res.status(403).json({
            error: `${newTeam.name} must be verified by ${REQUIRED_TEAM_VERIFICATIONS} admins before bounties can be assigned to it`,
          });
        }
        resolvedIsPrivate = newTeam.isPrivate;
      } else {
        // Unassigning from a team — no team means it can't be private
        resolvedIsPrivate = false;
      }
    }

    // including the status flip hidden inside isApproved
    const before = await prisma.bounty.findUnique({
      where: { id: req.params.id },
      select: {
        title: true,
        description: true,
        bountyAmount: true,
        timeToComplete: true,
        status: true,
      },
    });
    if (!before) return res.status(404).json({ error: "Bounty not found" });

    const nextStatus =
      req.body.isApproved !== undefined
        ? req.body.isApproved
          ? "IN_PROGRESS"
          : "CANCELLED"
        : before.status;

    const updated = await prisma.bounty.update({
      where: { id: req.params.id },
      data: {
        ...(req.body.title && { title: req.body.title }),
        ...(req.body.description && { description: req.body.description }),
        ...(req.body.bountyAmount && { bountyAmount: req.body.bountyAmount }),
        ...(req.body.timeToComplete && {
          timeToComplete: req.body.timeToComplete,
        }),
        ...(req.body.assignee !== undefined && { assignee: req.body.assignee }),
        ...(req.body.chain !== undefined && { chain: req.body.chain }),
        ...(req.body.teamId !== undefined && {
          teamId: req.body.teamId || null,
        }),
        ...(req.body.isApproved !== undefined && {
          isApproved: req.body.isApproved,
          status: nextStatus,
        }),
        ...(req.body.teamId !== undefined && {
          teamId: req.body.teamId || null,
          isPrivate: resolvedIsPrivate,
        }),
      },
      include: {
        assignees: {
          include: { user: { select: USER_SELECT_FULL } },
        },
        team: { select: { id: true, name: true, logo: true } },
      },
    });

    sendRealtimeUpdate("bounty_updated", updated, req.user.id);
    await invalidateBounty(req.params.id);
    res.json(updated);

    if (notifyUsers === true) {
      const changes = [];

      if (nextStatus !== before.status) {
        changes.push(`Status changed to ${nextStatus.replace("_", " ")}`);
      }
      if (req.body.title && req.body.title !== before.title) {
        changes.push(`Title updated to "${updated.title}"`);
      }
      if (req.body.description && req.body.description !== before.description) {
        changes.push(`Description updated`);
      }
      if (
        req.body.bountyAmount &&
        Number(req.body.bountyAmount) !== before.bountyAmount
      ) {
        changes.push(`Reward updated to ${updated.bountyAmount} ZEC`);
      }
      if (
        req.body.timeToComplete &&
        new Date(req.body.timeToComplete).getTime() !==
          new Date(before.timeToComplete).getTime()
      ) {
        changes.push(
          `Deadline updated to ${new Date(updated.timeToComplete).toLocaleDateString()}`,
        );
      }

      if (changes.length > 0) {
        const recipients = updated.assignees
          .map((a) => a.user)
          .filter((u) => u?.email);

        if (recipients.length > 0) {
          Promise.all(
            recipients.map((u) =>
              sendMailIfEnabled({
                to: u.email,
                subject: `Bounty update: ${updated.title}`,
                text: `Hi ${u.nickname || u.name},\n\n"${updated.title}" was updated:\n\n${changes.map((c) => `- ${c}`).join("\n")}`,
                html: `
                  <h2>Bounty update</h2>
                  <p>Hi ${u.nickname || u.name},</p>
                  <p><strong>${updated.title}</strong> was updated:</p>
                  <ul>
                    ${changes.map((c) => `<li>${c}</li>`).join("")}
                  </ul>
                `,
              }),
            ),
          ).catch((mailErr) =>
            console.error("Bounty update notification email failed:", mailErr),
          );
        }
      }
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update bounty" });
  }
});

module.exports = router;
