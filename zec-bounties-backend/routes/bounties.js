const express = require("express");
const prisma = require("../prisma/client");
const { getSuggestionSettings } = require("../utils/suggestionSettings");
const { escapeHtml, formatEmailText } = require("../helpers/email");
const router = express.Router();
const {
  authenticate,
  isTeamOrAdmin,
  isAdmin,
  optionalAuthenticate,
  signSessionToken,
} = require("../middleware/auth");
const { sendRealtimeUpdate, sendToUser } = require("../middleware/websocket");
const {
  getCache,
  setCache,
  delCache,
  invalidateUserDirectory,
  deleteCacheByPattern,
  getVersion,
  bumpVersion,
  TTL,
} = require("../utils/cache");
const sendMail = require("../utils/sendMail");
const notifyUser = require("../utils/notifyUser");
const { notifyNewBounty } = require("../utils/discord/discordNotify");
const { notifyAssignment } = require("../utils/discord/discordAssignWebhook");
const { REQUIRED_TEAM_VERIFICATIONS } = require("../utils/constants");
const {
  validateBountyCreate,
  validateBountyUpdate,
  validateCategory,
} = require("../helpers/validateBounty");
const {
  buildSuggestionReviewUpdate,
} = require("../utils/bountySuggestionReview");
const {
  USER_SELECT,
  USER_SELECT_PUBLIC,
  USER_SELECT_FULL,
  USER_SELECT_WITH_ROLE,
  bountyUserSelects,
  USER_SELECT_BASIC,
  USER_SELECT_MINIMAL,
  USER_SELECT_EXPORT,
} = require("../utils/userSelects");
const {
  sendMailIfEnabled,
  sendPushToOptedIn,
  getBroadcastRecipients,
  getSubmissionRecipients,
  withoutSubmissionBodies,
  broadcastBountyEvent,
  invalidateBounty,
  ONBOARDED_ROLES,
  requireOnboarded,
  getWeeklyBountyQuota,
  hasWeeklyQuota,
  createBountyWithQuota,
  WeeklyBountyQuotaError,
  requireTaskCreation,
  validateBountyChain,
} = require("../utils/bountyHelpers");
const {
  userIdentityWhere,
  bountyInvolvesUserWhere,
} = require("../utils/userIdentity");
const { logActivity, publishActivity } = require("../utils/bountyActivity");
const { redactPublicUser } = require("../utils/privacy");

// ─── Email settings ───────────────────────────────────────────────────────────
const ENABLE_EMAILS_IN_DEV = false; // Set to true when you want to test emails

const shouldSendEmails =
  process.env.NODE_ENV === "production" || ENABLE_EMAILS_IN_DEV;

const ASSIGNEE_INCLUDE = {
  assignees: {
    include: { user: { select: USER_SELECT } },
  },
};

const TARGET_REPOS = new Set([
  "namada",
  "zechub",
  "zechub-wiki",
  "zec-bounties",
]);

function resolveTargetRepo(value) {
  if (value == null || value === "") return null;
  if (!TARGET_REPOS.has(value)) return undefined;
  return value;
}

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

// const invalidateBounty = async (bountyId) => {
//   await Promise.all([
//     delCache(`assignees:${bountyId}`),
//     delCache("stats:totals"),
//     bumpVersion("bounties"),
//   ]);
// };

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

const HUNTER_EDIT_WINDOW_MS = 15 * 60 * 1000;

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

// Stricter than canManageBounty: excludes plain bounty ownership. A HUNTER
// who created their own bounty can manage its applications/submissions
// (that's normal ownership), but must NOT get admin-tier control — direct
// status transitions or free assignee-roster edits bypass the apply →
// accept → submit → review pipeline entirely. Only global admins and the
// bounty's own team OWNER/ADMIN get that.
async function canAdministerBounty(bounty, user, db = prisma) {
  if (user.role === "ADMIN") return true;
  if (bounty.teamId) {
    const member = await db.teamMember.findUnique({
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

  const teamMember = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: bounty.teamId, userId: user.id } },
  });
  if (teamMember) return true;

  // Community membership = favorited the team (hunters only)
  if (user.role === "HUNTER") {
    const fav = await prisma.teamFavorite.findUnique({
      where: { userId_teamId: { userId: user.id, teamId: bounty.teamId } },
      select: { userId: true },
    });
    return !!fav;
  }
  return false;
}

// ─── Weekly bounty-creation quota ───────────────────────────────────────────

// Tier breakpoints match the admin "Star Override" list in the KPIs dashboard
// (avatar:1 / avatar:5 / avatar:10 / avatar:15 / avatar:25 / avatar:50).
// Gold star = 15+ completed tasks.
const GOLD_STAR_THRESHOLD = 15;

const WEEKLY_BOUNTY_LIMIT_GOLD =
  process.env.NODE_ENV === "production"
    ? 2
    : Number(process.env.WEEKLY_BOUNTY_LIMIT_GOLD ?? 2);

const WEEKLY_BOUNTY_LIMIT_STANDARD =
  process.env.NODE_ENV === "production"
    ? 1
    : Number(process.env.WEEKLY_BOUNTY_LIMIT_STANDARD ?? 1);

// Mirrors the "avatar:N" override the admin badge modal writes via
// PATCH /api/kpis/users/:id/badges. An explicit override always wins over
// the live completed-count calculation — same contract BadgeIcons follows.
function getAvatarOverrideTier(badges) {
  if (!Array.isArray(badges)) return null;
  for (const b of badges) {
    const match = typeof b === "string" && b.match(/^avatar:(\d+)$/);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

async function isGoldStarOrAbove(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { badges: true },
  });

  const overrideTier = getAvatarOverrideTier(user?.badges);
  if (overrideTier !== null) return overrideTier >= GOLD_STAR_THRESHOLD;

  const completed = await prisma.bounty.count({
    where: { assignee: userId, status: "DONE" },
  });

  return completed >= GOLD_STAR_THRESHOLD;
}

// Same contract as isGoldStarOrAbove: an explicit avatar:N admin override
// wins over the live DONE count when the platform is in threshold mode.
async function hasCompletedEnoughToPost(userId) {
  const { mode, threshold } = await getSuggestionSettings();

  if (mode === "closed") {
    return { allowed: false, completed: 0, required: null, mode };
  }
  if (mode === "open") {
    return { allowed: true, completed: 0, required: null, mode };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { badges: true },
  });

  const overrideTier = getAvatarOverrideTier(user?.badges);
  if (overrideTier !== null) {
    return {
      allowed: overrideTier >= threshold,
      completed: overrideTier,
      required: threshold,
      mode,
    };
  }

  const completed = await prisma.bounty.count({
    where: { assignee: userId, status: "DONE" },
  });
  return {
    allowed: completed >= threshold,
    completed,
    required: threshold,
    mode,
  };
}

// Fixed calendar week, Monday 00:00 UTC through the following Monday 00:00 UTC.
function getCalendarWeekBounds(date = new Date()) {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = d.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() + diffToMonday);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return { start, end };
}

// Emails and pushes a new bounty to its audience.
// Called only once the bounty is approved: before that, nobody has reviewed the text that goes out.
async function announceNewBounty(bounty, creatorId, recipients) {
  try {
    const creatorDisplayName =
      bounty.createdByUser?.nickname || bounty.createdByUser?.name || "Unknown";

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

    const audience = recipients && new Set(recipients);

    const otherUsers = users.filter(
      (u) => u.id !== creatorId && (!audience || audience.has(u.id)),
    );

    const emailRecipients = otherUsers
      .filter((u) => u.emailNotifications !== false)
      .map((u) => u.email)
      .filter(Boolean);

    const pushCandidateIds = otherUsers
      .filter((u) => u.pushNotifications)
      .map((u) => u.id);

    await Promise.all([
      sendPushToOptedIn(pushCandidateIds, {
        title: "New Bounty Available",
        body: `${bounty.title} — ${bounty.bountyAmount} ZEC`,
        url: `/bounty/${bounty.id}`,
      }),

      Promise.all(
        emailRecipients.map((recipient) =>
          sendMailIfEnabled({
            to: recipient,
            subject: `New Bounty Created: ${bounty.title}`,
            text: `A new bounty has been created.\n\nCreated by: ${creatorDisplayName}\n\nTitle: ${bounty.title}\nAmount: ${bounty.bountyAmount}`,
            html: `
              <h2>New Bounty Created</h2>
              <p><strong>Created by:</strong> ${escapeHtml(creatorDisplayName)}</p>
              <p><strong>Title:</strong> ${escapeHtml(bounty.title)}</p>
              <p><strong>Description:</strong><br/>
                ${formatEmailText(bounty.description)}
              </p>
              <p><strong>Amount:</strong> ${bounty.bountyAmount} ZEC</p>
              <p><strong>Time to complete:</strong> ${escapeHtml(bounty.timeToComplete)}</p>
            `,
          }),
        ),
      ),
    ]);
  } catch (notificationErr) {
    console.error("Bounty notification failed:", notificationErr);
  }
}

// ─── Create bounty ────────────────────────────────────────────────────────────
router.post("/", authenticate, requireTaskCreation, async (req, res) => {
  try {
    if (!requireOnboarded(req, res)) return;

    // Hunter bounty suggestions are gated by the platform suggestion setting.
    if (req.user.role === "HUNTER") {
      const elig = await hasCompletedEnoughToPost(req.user.id);
      if (!elig.allowed) {
        const msg =
          elig.mode === "closed"
            ? "Bounty suggestions are currently closed."
            : `Complete at least ${elig.required} bounties before posting your own (${elig.completed}/${elig.required} done)`;
        return res.status(403).json({
          error: msg,
          completed: elig.completed,
          required: elig.required,
          mode: elig.mode,
        });
      }
    }

    const {
      title,
      description,
      bountyAmount,
      timeToComplete,
      assignee,
      categoryId,
      chain,
      teamId,
      targetRepo,
    } = req.body;

    const validation = validateBountyCreate(req.body);
    if (!validation.valid)
      return res.status(400).json({ error: validation.error });

    const categoryValidation = await validateCategory(prisma, categoryId);
    if (!categoryValidation.valid) {
      return res.status(400).json({ error: categoryValidation.error });
    }

    const resolvedTargetRepo = resolveTargetRepo(targetRepo);
    if (resolvedTargetRepo === undefined) {
      return res.status(400).json({ error: "Invalid targetRepo" });
    }

    const chainError = validateBountyChain(chain);
    if (chainError) {
      return res
        .status(chain === "TEST" ? 403 : 400)
        .json({ error: chainError });
    }

    let team = null;

    if (teamId) {
      team = await prisma.team.findUnique({ where: { id: teamId } });

      if (!team) {
        return res.status(404).json({ error: "Team not found" });
      }

      if (!team.isVerified) {
        return res.status(403).json({
          error: `${team.name} must be verified by ${REQUIRED_TEAM_VERIFICATIONS} admins before it can post bounties`,
        });
      }

      if (!["ADMIN", "HUNTER"].includes(req.user.role)) {
        const membership = await prisma.teamMember.findUnique({
          where: {
            teamId_userId: {
              teamId,
              userId: req.user.id,
            },
          },
        });

        if (!membership) {
          return res
            .status(403)
            .json({ error: "You are not a member of this team" });
        }
      }
    }

    const isHunter = req.user.role === "HUNTER";
    const canAssignOthers = ["ADMIN", "TEAM"].includes(req.user.role);

    const resolvedAssignee = isHunter
      ? req.user.id
      : canAssignOthers && assignee !== "none"
        ? assignee
        : null;

    const resolvedIsApproved =
      req.user.role === "ADMIN" || (team !== null && !isHunter);

    const bounty = await createBountyWithQuota(req.user, {
      data: {
        title,
        description,
        bountyAmount: parseFloat(bountyAmount),
        timeToComplete: new Date(timeToComplete),
        createdBy: req.user.id,
        assignee: resolvedAssignee,
        isApproved: resolvedIsApproved,
        ...(isHunter &&
          teamId && {
            suggestionReviewStatus: "PENDING",
          }),
        categoryId: categoryId || null,
        ...(chain && { chain }),
        ...(teamId && { teamId }),
        ...(resolvedTargetRepo && { targetRepo: resolvedTargetRepo }),
        isPrivate: team ? team.isPrivate : resolvedAssignee === req.user.id,
        ...(resolvedAssignee && {
          assignees: {
            create: { userId: resolvedAssignee },
          },
        }),
      },
      include: {
        createdByUser: { select: USER_SELECT },
        assignees: {
          include: { user: { select: USER_SELECT } },
        },
        assigneeUser: { select: USER_SELECT },
        team: {
          select: { id: true, name: true, logo: true },
        },
      },
    });

    const recipients = await getBroadcastRecipients(bounty);

    logActivity(null, {
      bountyId: bounty.id,
      actorId: req.user.id,
      type: "CREATED",
    }).catch(console.error);

    sendRealtimeUpdate("new_bounties", bounty, req.user.id, recipients);

    await bumpVersion("bounties");

    res.status(201).json(bounty);

    // Announce only if the bounty is already approved (admin/team create).
    // Unapproved hunter suggestions wait for the approve endpoint.
    if (bounty.isApproved) {
      if (!bounty.isPrivate) notifyNewBounty(bounty);
      announceNewBounty(bounty, req.user.id, recipients);
    }
  } catch (err) {
    if (err instanceof WeeklyBountyQuotaError) {
      return res.status(429).json({
        error: err.message,
        ...err.quota,
      });
    }

    console.error(err);

    res.status(500).json({ error: "Failed to create bounty" });
  }
});

// ─── List bounties (paginated, lean payload) ──────────────────────────────
router.get("/", optionalAuthenticate, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 10), 50);

    const isAuthed = Boolean(req.user);
    const isDev = process.env.NODE_ENV !== "production";
    const isAdmin = req.user?.role === "ADMIN";
    const userId = req.user?.id;

    // ------------------------------------------------------------
    // Chain filter
    // ------------------------------------------------------------
    const chainParam = String(req.query.chain || "MAIN").toUpperCase();
    let chainFilter;

    if (isDev) {
      chainFilter = {};
    } else if (chainParam === "ALL") {
      if (!isAdmin) {
        return res.status(403).json({ error: "ALL chains requires admin" });
      }
      chainFilter = {};
    } else if (chainParam === "TEST") {
      if (!isAdmin) {
        return res.status(403).json({ error: "TEST chain requires admin" });
      }
      chainFilter = { chain: "TEST" };
    } else if (chainParam === "MAIN") {
      chainFilter = { chain: "MAIN" };
    } else {
      return res.status(400).json({ error: "Invalid chain value" });
    }

    // ------------------------------------------------------------
    // Visibility
    //
    // A bounty is publicly visible only when:
    // - Bounty.isPrivate is false, AND
    // - It has no team or its team is not private.
    //
    // Admins see all bounties.
    // Creators and authorized team members retain access to
    // private bounties under the existing access rules.
    //
    // Filtering happens in the database before pagination.
    // ------------------------------------------------------------
    const visibilityFilter = isAdmin
      ? {}
      : {
          OR: [
            // Public bounties not owned by private teams.
            {
              isPrivate: false,
              OR: [{ teamId: null }, { team: { isPrivate: false } }],
            },

            // Creators can see their own individually private bounties.
            ...(userId
              ? [
                  {
                    isPrivate: true,
                    createdBy: userId,
                  },

                  // Members can see bounties owned by their private team.
                  {
                    team: {
                      isPrivate: true,
                      members: { some: { userId } },
                    },
                  },

                  // Preserve existing hunter access to favorited teams.
                  ...(req.user?.role === "HUNTER"
                    ? [
                        {
                          team: {
                            isPrivate: true,
                            favoritedBy: { some: { userId } },
                          },
                        },
                      ]
                    : []),
                ]
              : []),
          ],
        };

    // ------------------------------------------------------------
    // Optional user filter (admin only)
    // ------------------------------------------------------------
    const userTerm = String(req.query.user || "").trim();
    let userFilter = {};

    if (userTerm) {
      if (!isAdmin) {
        return res.status(403).json({ error: "user filter is admin-only" });
      }

      const identity = userIdentityWhere(userTerm);
      const involves = bountyInvolvesUserWhere(identity);

      if (involves) userFilter = involves;
    }

    // ------------------------------------------------------------
    // Audience
    //
    // Team bounties belong to hunters (home feed) and the team
    // console. The admin console lists platform bounties (no team)
    // plus pending hunter suggestions awaiting review. Filtered in
    // SQL so `take` returns a full page and `total` matches what
    // is displayed.
    // ------------------------------------------------------------
    const audienceFilter = isAdmin
      ? { OR: [{ teamId: null }, { suggestionReviewStatus: "PENDING" }] }
      : {
          OR: [
            { suggestionReviewStatus: null },
            { suggestionReviewStatus: { not: "PENDING" } },
          ],
        };

    // ------------------------------------------------------------
    // Combined query filters
    //
    // Filters that carry their own OR go in AND, so spreading never
    // lets one OR overwrite another.
    // ------------------------------------------------------------
    const where = {
      ...chainFilter,
      AND: [visibilityFilter, userFilter, audienceFilter],
    };

    // ------------------------------------------------------------
    // Cache — scoped by version, privacy version, viewer and scope.
    // `scope` also retires old admin entries that still contain
    // team bounties.
    // ------------------------------------------------------------
    const version = await getVersion("bounties");
    const privacyVersion = await getVersion("privacy");

    const cacheKey = `bounties:v${version}:p${privacyVersion}:${JSON.stringify({
      page,
      limit,
      chain: chainParam,
      viewer: isAdmin ? "admin" : (userId ?? "anon"),
      user: userTerm || "",
      scope: isAdmin ? "platform" : "feed",
    })}`;

    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const { user: assigneeUserSelect, createdByUser: createdByUserSelect } =
      bountyUserSelects({ isAuthed, isAdmin });

    // Include profileVisibility so private profile fields can be
    // redacted before returning or caching the response.
    const publicUserSelect = {
      ...assigneeUserSelect,
      profileVisibility: true,
    };

    const publicCreatedBySelect = {
      ...createdByUserSelect,
      profileVisibility: true,
    };

    // ------------------------------------------------------------
    // Fetch the requested page and matching total in parallel
    // ------------------------------------------------------------
    const [bounties, total] = await Promise.all([
      prisma.bounty.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { dateCreated: "desc" },
        include: {
          assignees: {
            include: {
              user: { select: publicUserSelect },
            },
          },
          assigneeUser: {
            select: publicUserSelect,
          },
          createdByUser: {
            select: publicCreatedBySelect,
          },
          team: {
            select: {
              id: true,
              name: true,
              logo: true,
            },
          },
        },
      }),

      prisma.bounty.count({ where }),
    ]);

    // ------------------------------------------------------------
    // Redact user profiles
    // ------------------------------------------------------------
    const redactUser = (u) => redactPublicUser(u, { forceFull: isAdmin });

    const data = bounties.map((b) => ({
      ...b,
      assigneeUser: redactUser(b.assigneeUser),
      createdByUser: redactUser(b.createdByUser),
      assignees: Array.isArray(b.assignees)
        ? b.assignees.map((a) => ({
            ...a,
            user: redactUser(a.user),
          }))
        : b.assignees,
    }));

    const result = { data, total, page, limit };

    await setCache(cacheKey, result, TTL.BOUNTY_LIST);
    return res.json(result);
  } catch (error) {
    console.error("Failed to fetch bounties:", error);
    return res.status(500).json({ error: "Failed to fetch bounties" });
  }
});

// GET /api/bounties/unassigned
// Admin only. Full list of bounties with no team, plus the team list so
// the frontend can render the picker without a second call.
router.get("/unassigned", authenticate, isAdmin, async (req, res) => {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin access required" });
  }

  try {
    const [teams, bounties] = await Promise.all([
      prisma.team.findMany({
        select: { id: true, name: true, logo: true },
        orderBy: { name: "asc" },
      }),
      prisma.bounty.findMany({
        where: { teamId: null, createdByUser: { role: "ADMIN" } },
        select: {
          id: true,
          title: true,
          bountyAmount: true,
          dateCreated: true,
        },
        orderBy: { dateCreated: "desc" },
      }),
    ]);

    res.json({ teams, bounties });
  } catch (err) {
    console.error("Failed to load unassigned bounties:", err);
    res.status(500).json({ error: "Failed to load unassigned bounties" });
  }
});

// PATCH /api/bounties/unassigned/assign-team
// Admin only. Body: { teamId, bountyIds }. Moves only the given bounties
// onto the team — still constrained to teamId: null so a bounty that got
// assigned elsewhere between page-load and click can't be double-moved.
// Syncs isPrivate to match the team, same rule used for team-created bounties.
router.patch(
  "/unassigned/assign-team",
  authenticate,
  isAdmin,
  async (req, res) => {
    if (!req.user || req.user.role !== "ADMIN") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { teamId, bountyIds } = req.body;
    if (!teamId) {
      return res.status(400).json({ error: "teamId is required" });
    }
    if (!Array.isArray(bountyIds) || bountyIds.length === 0) {
      return res
        .status(400)
        .json({ error: "bountyIds must be a non-empty array" });
    }

    try {
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true, isPrivate: true },
      });
      if (!team) {
        return res.status(400).json({ error: "Team not found" });
      }

      const result = await prisma.bounty.updateMany({
        where: {
          id: { in: bountyIds },
          teamId: null,
          createdByUser: { role: "ADMIN" },
        },
        data: { teamId: team.id, isPrivate: team.isPrivate },
      });

      // Invalidate whatever Redis keys your bounty list route reads from —
      // same as your other routes that touch cached bounty payload fields.
      // e.g.: await invalidateBountyListCache();

      res.json({ movedCount: result.count });
    } catch (err) {
      console.error("Failed to assign bounties to team:", err);
      res.status(500).json({ error: "Failed to move bounties" });
    }
  },
);

// ─── Add / replace assignees (Admin only) ─────────────────────────────────────
// FIX: Replaced N individual prisma.bountyAssignee.create calls with a single
//      createMany, cutting round-trips from O(n) → O(1).
router.post("/:id/assignees", authenticate, async (req, res) => {
  try {
    const { id: bountyId } = req.params;
    const { userIds, notifyUsers = false } = req.body;

    if (!Array.isArray(userIds)) {
      return res.status(400).json({ error: "userIds must be an array" });
    }

    const bounty = await prisma.bounty.findUnique({
      where: { id: bountyId },
      select: {
        id: true,
        status: true,
        title: true,
        teamId: true,
        createdBy: true,
      },
    });
    if (!bounty) return res.status(404).json({ error: "Bounty not found" });

    if (!(await canAdministerBounty(bounty, req.user))) {
      return res.status(403).json({
        error: "You do not have permission to manage this bounty's assignees",
      });
    }

    const [freshBounty, assignees, existingAssignees] =
      await prisma.$transaction(async (tx) => {
        // Lock the stable parent before replacing children, including an empty roster.
        await tx.$queryRaw`
        SELECT "id" FROM "Bounty" WHERE "id" = ${bountyId} FOR UPDATE
      `;
        const currentBounty = await tx.bounty.findUniqueOrThrow({
          where: { id: bountyId },
          select: { status: true },
        });
        const previousAssignees = await tx.bountyAssignee.findMany({
          where: { bountyId },
          include: { user: { select: USER_SELECT_FULL } },
        });
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
          // Other routes still read the legacy single `assignee` field, so clear
          // it if the new list drops that user. On a DONE bounty it is the
          // payee, so leave it alone there.
          await tx.bounty.updateMany({
            where: {
              id: bountyId,
              status: { not: "DONE" },
              assignee: { notIn: userIds },
            },
            data: { assignee: null },
          });
          if (["TO_DO", "CANCELLED"].includes(currentBounty.status)) {
            await tx.bounty.update({
              where: { id: bountyId },
              data: { status: "IN_PROGRESS", isApproved: true },
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
        return [bountyRow, created, previousAssignees];
      });
    const existingAssigneeIds = new Set(existingAssignees.map((a) => a.userId));
    const newAssigneeIds = new Set(userIds);

    await broadcastBountyEvent(
      "bounty_assignees_updated",
      { bountyId, assignees },
      bountyId,
      req.user.id,
    );
    await broadcastBountyEvent(
      "bounty_updated",
      freshBounty,
      bountyId,
      req.user.id,
    );
    {
      const nm = (a) => a.user?.nickname || a.user?.name || a.userId;
      const added = assignees
        .filter((a) => !existingAssigneeIds.has(a.userId))
        .map(nm);
      const removed = existingAssignees
        .filter((a) => !newAssigneeIds.has(a.userId))
        .map(nm);
      if (added.length || removed.length)
        logActivity(null, {
          bountyId,
          actorId: req.user.id,
          type: "ASSIGNEES_UPDATED",
          meta: { added, removed },
        }).catch(console.error);
    }
    await invalidateBounty(bountyId);
    res.status(200).json({ assignees });

    // Discord assignment webhook — fire-and-forget, only for newly added assignees
    (async () => {
      try {
        const newlyAdded = assignees.filter(
          (a) => !existingAssigneeIds.has(a.userId),
        );
        if (newlyAdded.length === 0) return;

        const users = await prisma.user.findMany({
          where: { id: { in: newlyAdded.map((a) => a.userId) } },
          select: { id: true, discordUsername: true },
        });
        const discordByUser = new Map(
          users.map((u) => [u.id, u.discordUsername]),
        );

        await Promise.all(
          newlyAdded.map((a) =>
            notifyAssignment({
              discordUsername: discordByUser.get(a.userId),
              bountyId,
              bountyTitle: bounty.title,
            }),
          ),
        );
      } catch (err) {
        console.error("Discord assign webhook batch failed:", err);
      }
    })();

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
router.delete("/:id/assignees/:userId", authenticate, async (req, res) => {
  try {
    const { id: bountyId, userId } = req.params;

    const bounty = await prisma.bounty.findUnique({
      where: { id: bountyId },
      select: { id: true, teamId: true, createdBy: true },
    });
    if (!bounty) return res.status(404).json({ error: "Bounty not found" });

    if (!(await canAdministerBounty(bounty, req.user))) {
      return res.status(403).json({
        error: "You do not have permission to manage this bounty's assignees",
      });
    }

    const [removedRow] = await prisma.$transaction([
      prisma.bountyAssignee.delete({
        where: { bountyId_userId: { bountyId, userId } },
        include: { user: { select: USER_SELECT_MINIMAL } },
      }),
      // Also clear the legacy single `assignee` field if it pointed to this
      // user, except on a DONE bounty, where it is the payee
      prisma.bounty.updateMany({
        where: { id: bountyId, status: { not: "DONE" }, assignee: userId },
        data: { assignee: null },
      }),
    ]);
    logActivity(null, {
      bountyId,
      actorId: req.user.id,
      type: "ASSIGNEES_UPDATED",
      meta: {
        added: [],
        removed: [removedRow.user?.nickname || removedRow.user?.name || userId],
      },
    }).catch(console.error);

    const freshBounty = await prisma.bounty.findUnique({
      where: { id: bountyId },
      include: {
        ...ASSIGNEE_INCLUDE,
        assigneeUser: { select: USER_SELECT_FULL },
        createdByUser: { select: USER_SELECT_WITH_ROLE },
      },
    });

    await broadcastBountyEvent(
      "bounty_assignees_updated",
      { bountyId, removedUserId: userId },
      bountyId,
      req.user.id,
    );
    await broadcastBountyEvent(
      "bounty_updated",
      freshBounty,
      bountyId,
      req.user.id,
    );
    await invalidateBounty(bountyId);
    res.json({ message: "Assignee removed successfully" });
  } catch (error) {
    console.error("Error removing assignee:", error);
    res.status(500).json({ error: "Failed to remove assignee" });
  }
});

// ─── Get assignees for a bounty ───────────────────────────────────────────────
router.get("/:id/assignees", authenticate, async (req, res) => {
  try {
    const bounty = await prisma.bounty.findUnique({
      where: { id: req.params.id },
      select: { id: true, isPrivate: true, createdBy: true, teamId: true },
    });
    if (!bounty) return res.status(404).json({ error: "Bounty not found" });
    if (!(await canViewPrivateBounty(bounty, req.user))) {
      return res.status(404).json({ error: "Bounty not found" });
    }
    // Email and payout addresses are admin-only, same as the bounty read routes.
    // Cache key is scoped by viewer so an admin payload cannot be served to a hunter.
    const viewerIsAdmin = req.user?.role === "ADMIN";
    const userSelect = viewerIsAdmin ? USER_SELECT_FULL : USER_SELECT_PUBLIC;
    const cacheKey = `assignees:${viewerIsAdmin ? "admin" : "user"}:${req.params.id}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);
    const assignees = await prisma.bountyAssignee.findMany({
      where: { bountyId: req.params.id },
      include: { user: { select: userSelect } },
      orderBy: { assignedAt: "asc" },
    });
    await setCache(cacheKey, assignees, TTL.ASSIGNEES);
    res.json(assignees);
  } catch (error) {
    console.error("Error fetching assignees:", error);
    res.status(500).json({ error: "Failed to fetch assignees" });
  }
});

// ─── Approve bounty (Admin) ───────────────────────────────────────────────────
// FIX: id was cast to Number() but schema uses cuid strings — removed the cast.
router.patch("/:id/approve", authenticate, isAdmin, async (req, res) => {
  try {
    const bountyId = req.params.id;
    const bounty = await prisma.bounty.findUnique({
      where: { id: req.params.id },
      select: { createdBy: true, assignee: true },
    });
    if (!bounty) return res.status(404).json({ error: "Bounty not found" });

    // Approving is what turns a personal bounty into a public one, so it also
    // undoes the two markers that kept it personal: its privacy, and the
    // self-assignment that would otherwise stop anyone else from applying. An
    // assignment an admin made deliberately is left alone.
    const releaseSelfAssignment = bounty.assignee === bounty.createdBy;

    const updated = await prisma.$transaction(async (tx) => {
      if (releaseSelfAssignment) {
        // Creation writes the self-assignment to both the scalar column and
        // the join table; clearing only the scalar would leave the creator as
        // the sole assignee, and PATCH /:id/status pays the sole assignee.
        await tx.bountyAssignee.deleteMany({
          where: { bountyId: req.params.id, userId: bounty.createdBy },
        });
      }
      return tx.bounty.update({
        where: { id: req.params.id },
        data: {
          isApproved: true,
          isPrivate: false,
          ...(releaseSelfAssignment && { assignee: null }),
        },
      });
    });
    await broadcastBountyEvent(
      "bounty_approved",
      updated,
      bountyId,
      req.user.id,
    );
    logActivity(null, {
      bountyId,
      actorId: req.user.id,
      type: "APPROVED",
    }).catch(console.error);

    await invalidateBounty(req.params.id);
    res.json(updated);

    // A bounty created unapproved was not announced, so announce it now.
    // Use the updated row from the transaction (it already includes createdByUser
    // when the caller supplied an include). Re-fetch only if it is missing.
    if (!bounty.isApproved) {
      let full = updated;
      if (!full.createdByUser) {
        full = await prisma.bounty.findUnique({
          where: { id: req.params.id },
          include: { createdByUser: { select: USER_SELECT } },
        });
      }
      if (full && !full.isPrivate) {
        notifyNewBounty(full);
        getBroadcastRecipients(full)
          .then((recipients) =>
            announceNewBounty(full, bounty.createdBy, recipients),
          )
          .catch(console.error);
      }
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to approve bounty" });
  }
});

router.patch("/:id/suggestion-review", authenticate, async (req, res) => {
  try {
    const bounty = await prisma.bounty.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        teamId: true,
        status: true,
        suggestionReviewStatus: true,
      },
    });
    if (!bounty) return res.status(404).json({ error: "Bounty not found" });
    if (!bounty.teamId) {
      return res
        .status(400)
        .json({ error: "Only team bounty suggestions can be reviewed" });
    }
    if (!(await canAdministerBounty(bounty, req.user))) {
      return res.status(403).json({ error: "Team admin access required" });
    }
    if (bounty.suggestionReviewStatus !== "PENDING") {
      return res.status(409).json({ error: "Suggestion is no longer pending" });
    }

    let reviewUpdate;
    try {
      reviewUpdate = buildSuggestionReviewUpdate(req.body);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const data = { ...reviewUpdate };
    if (req.body.action === "edit") {
      const changes = {};
      for (const field of [
        "title",
        "description",
        "bountyAmount",
        "timeToComplete",
      ]) {
        if (req.body[field] !== undefined) changes[field] = req.body[field];
      }
      if (!Object.keys(changes).length) {
        return res
          .status(400)
          .json({ error: "Provide at least one bounty field to edit" });
      }

      const validation = validateBountyUpdate(changes);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
      if (changes.bountyAmount !== undefined) {
        changes.bountyAmount = Number(changes.bountyAmount);
      }
      if (changes.timeToComplete !== undefined) {
        changes.timeToComplete = new Date(changes.timeToComplete);
      }
      Object.assign(data, changes);
    }

    const updateResult = await prisma.bounty.updateMany({
      where: { id: bounty.id, suggestionReviewStatus: "PENDING" },
      data,
    });
    if (updateResult.count === 0) {
      return res.status(409).json({ error: "Suggestion is no longer pending" });
    }

    const updated = await prisma.bounty.findUnique({
      where: { id: bounty.id },
      include: {
        createdByUser: { select: USER_SELECT },
        assignees: { include: { user: { select: USER_SELECT } } },
        assigneeUser: { select: USER_SELECT },
        team: { select: { id: true, name: true, logo: true } },
      },
    });

    await invalidateBounty(bounty.id);
    await broadcastBountyEvent(
      "bounty_updated",
      updated,
      bounty.id,
      req.user.id,
    );
    return res.json(updated);
  } catch (error) {
    console.error("Failed to review bounty suggestion:", error);
    return res
      .status(500)
      .json({ error: "Failed to review bounty suggestion" });
  }
});

// ─── Change status (Admin) ────────────────────────────────────────────────────
// FIX: Collapsed the fetch + update into a single transaction so the DB isn't
//      hit twice serially for every status change.
router.patch("/:id/status", authenticate, async (req, res) => {
  try {
    const { status, winnerId } = req.body;
    const bountyId = req.params.id;

    const bounty = await prisma.bounty.findUnique({
      where: { id: bountyId },
      select: {
        id: true,
        status: true,
        isApproved: true,
        assignee: true,
        createdBy: true,
        teamId: true,
        assignees: { select: { userId: true } },
      },
    });

    if (!bounty) return res.status(404).json({ error: "Bounty not found" });

    if (!(await canAdministerBounty(bounty, req.user))) {
      return res.status(403).json({
        error: "You do not have permission to change this bounty's status",
      });
    }

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

    const { updated, activityRow } = await prisma.$transaction(async (tx) => {
      const updated = await tx.bounty.update({
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
          assigneeUser: { select: USER_SELECT },
          createdByUser: {
            select: { ...USER_SELECT, role: true },
          },
          team: { select: { id: true, name: true, logo: true } },
        },
      });

      const activityRow = await logActivity(tx, {
        bountyId,
        actorId: req.user.id,
        type: "STATUS_CHANGED",
        meta: {
          from: bounty.status,
          to: status,
          ...(winnerId && { winnerId }),
        },
      });

      return { updated, activityRow };
    });

    await invalidateBounty(bountyId);
    await broadcastBountyEvent(
      "bounty_status_changed",
      updated,
      bountyId,
      req.user.id,
    );
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update bounty status" });
  }
});

// ─── Submit work ──────────────────────────────────────────────────────────────
router.post("/:id/submit", authenticate, async (req, res) => {
  try {
    if (!requireOnboarded(req, res)) return;

    const { id: bountyId } = req.params;
    const { description, deliverableUrl } = req.body;
    const userId = req.user.id;

    if (typeof description !== "string" || !description.trim()) {
      return res.status(400).json({ error: "Work description is required" });
    }
    if (deliverableUrl != null && typeof deliverableUrl !== "string") {
      return res
        .status(400)
        .json({ error: "Deliverable URL must be a string" });
    }

    // Retry serialization conflicts with a fresh eligibility snapshot. Retrying
    // only the writes would preserve a stale duplicate/status decision.
    let result;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        result = await prisma.$transaction(
          async (tx) => {
            const bounty = await tx.bounty.findUnique({
              where: { id: bountyId },
              select: {
                id: true,
                isApproved: true,
                status: true,
                assignee: true,
                workSubmissions: {
                  where: {
                    submittedBy: userId,
                    status: { in: ["pending", "approved"] },
                  },
                  select: { id: true },
                },
              },
            });

            if (!bounty) return { statusCode: 404, error: "Bounty not found" };

            const isAssigned =
              bounty.assignee === userId ||
              !!(await tx.bountyAssignee.findUnique({
                where: { bountyId_userId: { bountyId, userId } },
                select: { userId: true },
              }));
            if (!isAssigned)
              return {
                statusCode: 403,
                error: "You are not assigned to this bounty",
              };
            if (!bounty.isApproved)
              return {
                statusCode: 400,
                error: "Bounty must be approved before submitting work",
              };
            if (
              !["TO_DO", "IN_PROGRESS", "IN_REVIEW"].includes(bounty.status)
            ) {
              return {
                statusCode: 400,
                error: "Work cannot be submitted for bounties in this status",
              };
            }
            if (bounty.workSubmissions.length > 0) {
              return {
                statusCode: 400,
                error: "You have already submitted work for this bounty",
              };
            }
            // Both writes belong to the same transaction as the eligibility checks.
            const workSubmission = await tx.workSubmission.create({
              data: {
                bountyId,
                submittedBy: userId,
                description: description.trim(),
                deliverableUrl: deliverableUrl?.trim() || null,
                status: "pending",
              },
              include: {
                submitterUser: {
                  select: USER_SELECT,
                },
              },
            });
            const updatedBounty = await tx.bounty.update({
              where: { id: bountyId },
              data: { status: "IN_REVIEW" },
              include: {
                ...ASSIGNEE_INCLUDE,
                createdByUser: {
                  select: { ...USER_SELECT, role: true },
                },
                assigneeUser: {
                  select: USER_SELECT,
                },
                workSubmissions: {
                  include: {
                    submitterUser: {
                      select: USER_SELECT,
                    },
                  },
                },
              },
            });
            const activityRow = await tx.bountyActivity.create({
              data: { bountyId, actorId: userId, type: "WORK_SUBMITTED" },
              include: { actor: { select: USER_SELECT_BASIC } },
            });
            return { workSubmission, updatedBounty, activityRow };
          },
          { isolationLevel: "Serializable" },
        );
        break;
      } catch (error) {
        if (error.code !== "P2034" || attempt === 2) throw error;
      }
    }
    if (result.error) {
      return res.status(result.statusCode).json({ error: result.error });
    }
    const { workSubmission, updatedBounty, activityRow } = result;

    // A receiving client may read immediately after any event.
    await invalidateBounty(bountyId);
    await invalidateSubmissions(bountyId, userId);
    publishActivity(activityRow);
    await broadcastBountyEvent(
      "work_submitted",
      workSubmission,
      bountyId,
      userId,
      await getSubmissionRecipients(bountyId, userId),
    );
    await broadcastBountyEvent(
      "bounty_updated",
      withoutSubmissionBodies(updatedBounty),
      bountyId,
      userId,
    );

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
      select: { id: true, createdBy: true, assignee: true },
    });
    if (!bounty) return res.status(404).json({ error: "Bounty not found" });

    const isCreatorOrAdmin =
      bounty.createdBy === userId || userRole === "ADMIN";

    let isAssignee = false;
    if (!isCreatorOrAdmin) {
      isAssignee =
        bounty.assignee === userId ||
        !!(await prisma.bountyAssignee.findUnique({
          where: { bountyId_userId: { bountyId, userId } },
          select: { userId: true },
        }));
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

      if (!["approved", "rejected", "needs_revision"].includes(status)) {
        return res.status(400).json({ error: "Invalid review status" });
      }

      // Reviews of different submissions share the parent bounty state. Keep
      // every decision read in the transaction and retry its complete snapshot
      // on conflict; retrying only the writes would preserve stale decisions.
      let result;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          result = await prisma.$transaction(
            async (tx) => {
              const submission = await tx.workSubmission.findUnique({
                where: { id: submissionId },
                include: {
                  bounty: {
                    select: {
                      id: true,
                      createdBy: true,
                      teamId: true,
                      status: true,
                      assignee: true,
                    },
                  },
                  submitterUser: { select: USER_SELECT_MINIMAL },
                },
              });
              if (!submission)
                return { statusCode: 404, error: "Submission not found" };

              if (
                !(await canAdministerBounty(submission.bounty, req.user, tx))
              ) {
                return {
                  statusCode: 403,
                  error: "You do not have permission to review this submission",
                };
              }

              let newBountyStatus = submission.bounty.status;

              if (status === "approved") {
                if (submission.bounty.status !== "DONE") {
                  newBountyStatus = "DONE";
                }
              } else if (["rejected", "needs_revision"].includes(status)) {
                const approvedExists = await tx.workSubmission.findFirst({
                  where: {
                    bountyId: submission.bounty.id,
                    status: "approved",
                    id: { not: submissionId },
                  },
                  select: { id: true },
                });
                if (!approvedExists) newBountyStatus = "IN_PROGRESS";
              }

              const updSub = await tx.workSubmission.update({
                where: { id: submissionId },
                data: {
                  status,
                  reviewNotes: reviewNotes?.trim() || null,
                  reviewedBy: userId,
                  reviewedAt: new Date(),
                },
                include: {
                  submitterUser: { select: USER_SELECT },
                  reviewerUser: { select: USER_SELECT },
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
                  ...ASSIGNEE_INCLUDE,
                  createdByUser: { select: { ...USER_SELECT, role: true } },
                  assigneeUser: { select: USER_SELECT },
                  team: { select: { id: true, name: true, logo: true } },
                },
              });
              await logActivity(tx, {
                bountyId: updBounty.id,
                actorId: userId,
                type: `SUBMISSION_${status.toUpperCase()}`,
                meta: {
                  submitter:
                    updSub.submitterUser?.nickname ||
                    updSub.submitterUser?.name,
                  ...(reviewNotes?.trim() && { notes: reviewNotes.trim() }),
                },
              });
              return { updatedSubmission: updSub, updatedBounty: updBounty };
            },
            { isolationLevel: "Serializable" },
          );
          break;
        } catch (error) {
          if (error.code !== "P2034" || attempt === 2) throw error;
        }
      }
      if (result.error) {
        return res.status(result.statusCode).json({ error: result.error });
      }
      const { updatedSubmission, updatedBounty } = result;

      await invalidateSubmissions(
        updatedBounty.id,
        updatedSubmission.submittedBy,
      );
      await invalidateBounty(updatedBounty.id);
      await broadcastBountyEvent(
        "submission_reviewed",
        updatedSubmission,
        updatedBounty.id,
        req.user.id,
        await getSubmissionRecipients(
          updatedBounty.id,
          updatedSubmission.submittedBy,
        ),
      );
      await broadcastBountyEvent(
        "bounty_updated",
        withoutSubmissionBodies(updatedBounty),
        updatedBounty.id,
        req.user.id,
      );

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
  const editConflict = new Error("submission-edit-conflict");
  try {
    const { submissionId } = req.params;
    const { description, deliverableUrl } = req.body;
    const userId = req.user.id;

    if (typeof description !== "string" || !description.trim()) {
      return res.status(400).json({ error: "Work description is required" });
    }
    if (deliverableUrl != null && typeof deliverableUrl !== "string") {
      return res
        .status(400)
        .json({ error: "Deliverable URL must be a string" });
    }

    const submission = await prisma.workSubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        submittedBy: true,
        submittedAt: true,
        reviewedAt: true,
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
      // Recheck eligibility in the write itself: a review may have committed
      // since the initial read, even while an edit was waiting for this row.
      const edited = await tx.workSubmission.updateMany({
        where: {
          id: submissionId,
          submittedBy: userId,
          status: submission.status,
          submittedAt: submission.submittedAt,
          reviewedAt: submission.reviewedAt,
        },
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
      });
      if (edited.count !== 1) throw editConflict;
      const updSub = await tx.workSubmission.findUnique({
        where: { id: submissionId },
        include: { submitterUser: { select: USER_SELECT } },
      });

      let updBounty = null;
      if (wasRevision) {
        // Another submission's approval or a cancellation must not be undone.
        // Throwing also rolls back the submission edit and cleared review fields.
        const reopened = await tx.bounty.updateMany({
          where: {
            id: submission.bountyId,
            status: { in: ["TO_DO", "IN_PROGRESS", "IN_REVIEW"] },
          },
          data: { status: "IN_REVIEW" },
        });
        if (reopened.count !== 1) throw editConflict;
        updBounty = await tx.bounty.findUnique({
          where: { id: submission.bountyId },
          include: {
            ...ASSIGNEE_INCLUDE,
            team: { select: { id: true, name: true, logo: true } },
            createdByUser: { select: { ...USER_SELECT, role: true } },
            assigneeUser: { select: USER_SELECT },
          },
        });
      }

      return [updSub, updBounty];
    });

    await invalidateSubmissions(submission.bountyId, userId);
    if (wasRevision) await invalidateBounty(submission.bountyId);
    await broadcastBountyEvent(
      "submission_edited",
      updated,
      submission.bountyId,
      userId,
      await getSubmissionRecipients(submission.bountyId, userId),
    );
    if (updatedBounty)
      await broadcastBountyEvent(
        "bounty_updated",
        withoutSubmissionBodies(updatedBounty),
        submission.bountyId,
        userId,
      );

    res.json({
      message: "Submission updated successfully",
      workSubmission: updated,
      ...(updatedBounty && { bounty: updatedBounty }),
    });
  } catch (error) {
    if (error === editConflict) {
      return res.status(409).json({
        error:
          "Submission or bounty changed while editing. Refresh and try again.",
      });
    }
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

      await invalidateSubmissions(keptSubmission.bountyId);
      await invalidateBounty(keptSubmission.bountyId);

      // Same REST audience as a submission body, plus the people who were
      // rejected so they learn they lost. Not every viewer of a public bounty.
      const rejectAudience = [
        ...new Set([
          ...(await getSubmissionRecipients(
            keptSubmission.bountyId,
            keptSubmission.submittedBy,
          )),
          ...rejectedUserIds,
        ]),
      ];
      await broadcastBountyEvent(
        "submissions_rejected_others",
        {
          bountyId: keptSubmission.bountyId,
          keptSubmissionId: submissionId,
          rejectedSubmissionIds: othersPending.map((s) => s.id),
          rejectedUserIds,
        },
        keptSubmission.bountyId,
        req.user.id,
        rejectAudience,
      );
      await broadcastBountyEvent(
        "bounty_assignees_updated",
        { bountyId: keptSubmission.bountyId },
        keptSubmission.bountyId,
        req.user.id,
      );

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
  const cacheKey = "users:public";
  const cached = await getCache(cacheKey);
  if (cached) return res.json(cached);
  const users = await prisma.user.findMany({
    select: { id: true, name: true, nickname: true, avatar: true, role: true },
  });
  await setCache(cacheKey, users, TTL.USERS);
  res.json(users);
});

// ─── Fetch all users ──────────────────────────────────────────────────────────
router.get("/users/full", authenticate, isAdmin, async (req, res) => {
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
        isRobin: true,
        canCreateTasks: true,
      },
    });
    await setCache(cacheKey, users, TTL.USERS);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/users/teams", authenticate, isTeamOrAdmin, async (req, res) => {
  try {
    const cacheKey = "users:teams";
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const users = await prisma.user.findMany({
      where: { role: { not: "ADMIN" } },
      select: {
        id: true,
        name: true,
        nickname: true,
        email: true,
        role: true,
        avatar: true,
        z_address: true,
        UA_address: true,
      },
    });

    await setCache(cacheKey, users, TTL.USERS);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch(
  "/users/:id/task-access",
  authenticate,
  isAdmin,
  async (req, res) => {
    try {
      const { canCreateTasks } = req.body;
      if (typeof canCreateTasks !== "boolean") {
        return res
          .status(400)
          .json({ error: "canCreateTasks must be boolean" });
      }
      const user = await prisma.user.update({
        where: { id: req.params.id },
        data: { canCreateTasks, blockedAt: canCreateTasks ? null : new Date() },
        select: { id: true, canCreateTasks: true },
      });
      await delCache("users:all");
      sendToUser(user.id, "user_task_access_changed", {
        userId: user.id,
        canCreateTasks: user.canCreateTasks,
      });
      res.json(user);
    } catch (err) {
      if (err.code === "P2025") {
        return res.status(404).json({ error: "User not found" });
      }
      console.error("Failed to update task access:", err);
      res.status(500).json({ error: "Failed to update task access" });
    }
  },
);

// ─── Switch role ──────────────────────────────────────────────────────────────
router.patch("/switch-role", authenticate, async (req, res) => {
  try {
    const { role } = req.body;
    if (!["ADMIN", "CLIENT", "HUNTER", "TEAM"].includes(role)) {
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
    await invalidateUserDirectory();
    const token = signSessionToken(updated);
    res.json({ user: updated, token });
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
      return res.status(404).json({ error: "Application not found" });
    }

    // Accepting/rejecting mutates the bounty (assignee, status) — this is
    // administration, not ownership. Only global admins and the bounty's
    // team OWNER/ADMIN may do it, even if the caller created the bounty.
    if (!(await canAdministerBounty(application.bounty, req.user))) {
      return res.status(403).json({
        error: "You do not have permission to manage this application",
      });
    }

    const [result, updatedBounty, activityRow] = await prisma.$transaction(
      async (tx) => {
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

        let activityRow = null;
        if (["accepted", "rejected"].includes(status)) {
          activityRow = await logActivity(tx, {
            bountyId: application.bountyId,
            actorId: req.user.id,
            type: `APPLICATION_${status.toUpperCase()}`,
            meta: {
              applicant:
                updated.applicantUser?.nickname || updated.applicantUser?.name,
            },
          });
        }

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
              isApproved: true,
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

        return [updated, freshBounty, activityRow];
      },
    );

    publishActivity(activityRow);
    // Invalidate affected caches after the transaction commits.
    await invalidateApplications(application.applicantId, application.bountyId);

    await invalidateBounty(application.bountyId);

    // Notify clients about the application change.
    await broadcastBountyEvent(
      "application_updated",
      result,
      application.bountyId,
      req.user.id,
    );

    // When accepted, also notify clients that the bounty itself changed.
    if (updatedBounty) {
      await broadcastBountyEvent(
        "bounty_updated",
        updatedBounty,
        application.bountyId,
        req.user.id,
      );
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

    // Fire-and-forget Discord notification — mirrors the /:id/assignees path
    if (status === "accepted") {
      notifyAssignment({
        discordUsername: result.applicantUser?.discordUsername,
        bountyId: application.bountyId,
        bountyTitle: application.bounty?.title ?? "a bounty",
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

      const deleted = await prisma.bountyApplication.deleteMany({
        where: {
          id: applicationId,
          applicantId: req.user.id,
          status: "pending",
        },
      });
      if (deleted.count === 0) {
        const current = await prisma.bountyApplication.findUnique({
          where: { id: applicationId },
          select: { id: true },
        });
        if (!current)
          return res.status(404).json({ error: "Application not found" });
        return res
          .status(400)
          .json({ error: "Cannot withdraw a reviewed application" });
      }
      await invalidateApplications(
        application.applicantId,
        application.bountyId,
      );
      await invalidateBounty(application.bountyId);
      await broadcastBountyEvent(
        "application_deleted",
        { id: applicationId, bountyId: application.bountyId },
        application.bountyId,
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
    if (!requireOnboarded(req, res)) return;

    const { bountyId, message } = req.body;
    const applicantId = req.user.id;

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

    if (!message || !message.trim())
      return res.status(400).json({ error: "Message is required" });

    const application = await prisma.bountyApplication.create({
      data: { bountyId, applicantId, message: message.trim() },
      include: {
        bounty: { select: { id: true, title: true, bountyAmount: true } },
        applicantUser: { select: USER_SELECT_MINIMAL },
      },
    });
    await invalidateApplications(applicantId);
    await invalidateBounty(application.bountyId);

    await broadcastBountyEvent(
      "application_created",
      application,
      bountyId,
      applicantId,
    );
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

// ─── My bounty-creation quota ────────────────────────────────────────────────
router.get("/mine/quota", authenticate, async (req, res) => {
  try {
    if (!hasWeeklyQuota(req.user.role)) {
      return res.json({
        limit: null,
        used: 0,
        remaining: null,
        resetsAt: null,
      });
    }
    const quota = await getWeeklyBountyQuota(req.user.id);
    if (req.user.role === "HUNTER") {
      const elig = await hasCompletedEnoughToPost(req.user.id);
      return res.json({
        ...quota,
        postEligibility: {
          allowed: elig.allowed,
          completed: elig.completed,
          required: elig.required,
          mode: elig.mode,
        },
      });
    }
    res.json(quota);
  } catch (error) {
    console.error("Error fetching bounty quota:", error);
    res.status(500).json({ error: "Failed to fetch quota" });
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
        prisma.bounty.aggregate({
          where: { chain: "MAIN" },
          _sum: { bountyAmount: true },
          _count: { id: true },
        }),
        prisma.bounty.groupBy({
          by: ["status"],
          where: { chain: "MAIN" },
          _count: { id: true },
        }),
        // DONE, not yet paid, AND not already exported — an exported bounty
        // is already in someone's payout queue outside the app, so it
        // shouldn't keep counting as "due" until isPaid catches up.
        prisma.bounty.count({
          where: {
            chain: "MAIN",
            status: "DONE",
            isPaid: false,
            exportedAt: null,
          },
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

// ─── Mark completed bounties as exported (Admin) ─────────────────────────────
// First-exported-wins: only stamps rows that haven't been exported before, so
// a later re-export never overwrites the original exportedAt/exportedBy.
router.patch(
  "/export-completed/mark-exported",
  authenticate,
  isAdmin,
  async (req, res) => {
    try {
      const { bountyIds } = req.body;
      if (!Array.isArray(bountyIds) || bountyIds.length === 0) {
        return res
          .status(400)
          .json({ error: "bountyIds must be a non-empty array" });
      }

      const exportedAt = new Date();
      const result = await prisma.bounty.updateMany({
        where: { id: { in: bountyIds }, exportedAt: null },
        data: { exportedAt, exportedBy: req.user.id },
      });

      // exportedAt now feeds unpaidDoneCount in /stats/totals, so that cache
      // is stale the moment this commits — not just the versioned bounty
      // list/detail caches.
      await Promise.all([bumpVersion("bounties"), delCache("stats:totals")]);

      sendRealtimeUpdate(
        "bounties_exported",
        { bountyIds, exportedAt },
        req.user.id,
      );

      res.json({
        message: "Marked as exported",
        newlyMarked: result.count,
        exportedAt,
      });
    } catch (error) {
      console.error("Error marking bounties exported:", error);
      res.status(500).json({ error: "Failed to mark bounties exported" });
    }
  },
);

// ─── Activity log for a bounty (creator / admin / team admin) ────────────────
router.get("/:id/activity", authenticate, async (req, res) => {
  try {
    const bounty = await prisma.bounty.findUnique({
      where: { id: req.params.id },
      select: { id: true, createdBy: true, teamId: true },
    });
    if (!bounty) return res.status(404).json({ error: "Bounty not found" });
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ error: "Access denied" });
    }

    const activity = await prisma.bountyActivity.findMany({
      where: { bountyId: bounty.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { actor: { select: USER_SELECT_BASIC } },
    });
    res.json(activity);
  } catch (err) {
    console.error("Error fetching bounty activity:", err);
    res.status(500).json({ error: "Failed to fetch activity" });
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
    const privacyVersion = await getVersion("privacy");

    // Scoped per-viewer, not just per-auth-state — matches the GET / pattern
    // and prevents one user's cached view of a private bounty leaking to another.
    const cacheKey = `bounty:v${version}:p${privacyVersion}:${isAdmin ? "admin" : userId}:${bountyId}`;

    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const { user: userSelect, createdByUser: createdByUserSelect } =
      bountyUserSelects({ isAuthed, isAdmin });

    const publicUserSelect = { ...userSelect, profileVisibility: true };
    const publicCreatedBySelect = {
      ...createdByUserSelect,
      profileVisibility: true,
    };

    const bounty = await prisma.bounty.findUnique({
      where: { id: bountyId },
      include: {
        assigneeUser: { select: publicUserSelect },
        assignees: { include: { user: { select: publicUserSelect } } },
        createdByUser: { select: publicCreatedBySelect },
        team: { select: { id: true, name: true, logo: true } },
      },
    });

    if (!bounty) return res.status(404).json({ error: "Bounty not found" });
    if (!(await canViewPrivateBounty(bounty, req.user))) {
      return res.status(404).json({ error: "Bounty not found" });
    }

    const redactUser = (u) => redactPublicUser(u, { forceFull: isAdmin });
    const redacted = {
      ...bounty,
      assigneeUser: redactUser(bounty.assigneeUser),
      createdByUser: redactUser(bounty.createdByUser),
      assignees: Array.isArray(bounty.assignees)
        ? bounty.assignees.map((a) => ({ ...a, user: redactUser(a.user) }))
        : bounty.assignees,
    };

    await setCache(cacheKey, redacted, TTL.BOUNTY_SINGLE);
    res.json(redacted);
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
      select: {
        createdBy: true,
        teamId: true,
        chain: true,
        status: true,
        isPaid: true,
        paymentAuthorized: true,
        paymentInFlight: true,
        dateCreated: true,
        title: true,
        description: true,
        bountyAmount: true,
        timeToComplete: true,
        isApproved: true,
      },
    });
    if (!existing) return res.status(404).json({ error: "Bounty not found" });

    if (!(await canManageBounty(existing, req.user))) {
      return res
        .status(403)
        .json({ error: "You do not have permission to edit this bounty" });
    }

    // Validate the incoming fields (title/description/amount/deadline). This
    // validator was imported but never called, so bountyAmount reached the DB
    // unchecked.
    const bodyValidation = validateBountyUpdate(req.body);
    if (!bodyValidation.valid) {
      return res.status(400).json({ error: bodyValidation.error });
    }

    const chainChanged =
      req.body.chain !== undefined && req.body.chain !== existing.chain;

    if (chainChanged) {
      const chainError = validateBountyChain(req.body.chain);
      if (chainError) {
        return res
          .status(req.body.chain === "TEST" ? 403 : 400)
          .json({ error: chainError });
      }
    }

    // `assignee` and `bountyAmount` decide WHO is paid and HOW MUCH, and the
    // payout batch reads them live at send time. A plain bounty creator must
    // not be able to change them — only a global/team admin — and they must be
    // frozen once a payout is authorised, in flight, or done. Without this a
    // creator could repoint an approved payout to themselves or inflate the
    // amount before the batch runs.
    // The edit forms re-send the current reward with every save, so an
    // unchanged amount is not a payout edit.
    const editsPayoutFields =
      req.body.assignee !== undefined ||
      chainChanged ||
      (req.body.bountyAmount !== undefined &&
        Number(req.body.bountyAmount) !== Number(existing.bountyAmount));

    if (editsPayoutFields) {
      if (!(await canAdministerBounty(existing, req.user))) {
        return res.status(403).json({
          error: "Only admins can change the assignee or reward amount",
        });
      }
      if (
        existing.isPaid ||
        existing.paymentInFlight ||
        existing.paymentAuthorized
      ) {
        return res.status(409).json({
          error:
            "Assignee and reward cannot be changed once payment is authorised or in progress",
        });
      }
    }

    // Only global admins may reassign a bounty's approval/status via this route
    // HUNTERs: creator only, within 15 min of creation, no team-admin bypass.
    // Global admins and team OWNER/ADMIN are exempt.
    if (req.user.role === "HUNTER") {
      if (existing.createdBy !== req.user.id) {
        return res
          .status(403)
          .json({ error: "Only the bounty creator can edit this bounty" });
      }
      const elapsed = Date.now() - new Date(existing.dateCreated).getTime();
      if (elapsed > HUNTER_EDIT_WINDOW_MS) {
        return res.status(400).json({ error: "Edit window has expired" });
      }
    }

    // Only global admins may change a bounty's approval/status via this route
    if (req.body.isApproved !== undefined && req.user.role !== "ADMIN") {
      return res
        .status(403)
        .json({ error: "Only admins can change approval status" });
    }

    if (
      Object.prototype.hasOwnProperty.call(req.body, "teamId") &&
      req.user.role !== "ADMIN"
    ) {
      // Non-admins can't move a bounty to a different team via edit, including clearing it
      return res.status(403).json({ error: "Cannot reassign team" });
    }

    const validation = validateBountyUpdate(req.body);
    if (!validation.valid)
      return res.status(400).json({ error: validation.error });
    const categoryValidation = await validateCategory(
      prisma,
      req.body.categoryId,
    );
    if (!categoryValidation.valid) {
      return res.status(400).json({ error: categoryValidation.error });
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

    // Includes the status flip hidden inside isApproved
    const nextStatus =
      req.body.isApproved !== undefined
        ? req.body.isApproved
          ? "IN_PROGRESS"
          : "CANCELLED"
        : existing.status;

    // Validate/normalize numeric + date inputs before touching the DB
    let bountyAmount;
    if (req.body.bountyAmount !== undefined) {
      bountyAmount = parseFloat(req.body.bountyAmount);
      if (!Number.isFinite(bountyAmount) || bountyAmount < 0) {
        return res.status(400).json({ error: "Invalid bountyAmount" });
      }
    }

    let timeToComplete;
    if (req.body.timeToComplete) {
      timeToComplete = new Date(req.body.timeToComplete);
      if (Number.isNaN(timeToComplete.getTime())) {
        return res.status(400).json({ error: "Invalid timeToComplete" });
      }
    }

    if (
      req.body.targetRepo !== undefined &&
      req.body.targetRepo !== null &&
      req.body.targetRepo !== "" &&
      resolveTargetRepo(req.body.targetRepo) === undefined
    ) {
      return res.status(400).json({ error: "Invalid targetRepo" });
    }
    if (req.body.targetRepo === "") req.body.targetRepo = null;

    const updated = await prisma.bounty.update({
      where: { id: req.params.id },
      data: {
        ...(req.body.title && { title: req.body.title }),
        ...(req.body.description && { description: req.body.description }),
        ...(req.body.bountyAmount !== undefined && {
          bountyAmount: Number(req.body.bountyAmount),
        }),
        ...(req.body.timeToComplete && {
          timeToComplete: new Date(req.body.timeToComplete),
        }),
        ...(req.body.assignee !== undefined && { assignee: req.body.assignee }),
        ...(chainChanged && { chain: req.body.chain }),
        ...(req.body.isApproved !== undefined && {
          isApproved: req.body.isApproved,
          status: nextStatus,
        }),
        ...(req.body.teamId !== undefined && {
          teamId: req.body.teamId || null,
          isPrivate: resolvedIsPrivate,
        }),
        ...(req.body.targetRepo !== undefined && {
          targetRepo: req.body.targetRepo,
        }),
      },
      include: {
        assignees: {
          include: { user: { select: USER_SELECT_FULL } },
        },
        assigneeUser: { select: USER_SELECT_FULL },
        createdByUser: { select: USER_SELECT_WITH_ROLE },
        team: { select: { id: true, name: true, logo: true } },
      },
    });

    await broadcastBountyEvent(
      "bounty_updated",
      updated,
      req.params.id,
      req.user.id,
    );

    {
      const approvalChanged =
        req.body.isApproved !== undefined &&
        req.body.isApproved !== existing.isApproved;
      const edited = [
        "title",
        "description",
        "bountyAmount",
        "timeToComplete",
        "chain",
        "teamId",
      ].filter((k) =>
        k === "chain" ? chainChanged : req.body[k] !== undefined,
      );
      const entries = [];
      if (approvalChanged)
        entries.push({ type: req.body.isApproved ? "APPROVED" : "UNAPPROVED" });
      if (edited.length)
        entries.push({ type: "EDITED", meta: { fields: edited } });
      Promise.all(
        entries.map((e) =>
          logActivity(null, {
            bountyId: req.params.id,
            actorId: req.user.id,
            ...e,
          }),
        ),
      ).catch(console.error);
    }

    await invalidateBounty(req.params.id);
    res.json(updated);

    if (notifyUsers === true) {
      const changes = [];

      if (nextStatus !== existing.status) {
        changes.push(`Status changed to ${nextStatus.replace("_", " ")}`);
      }
      if (req.body.title && req.body.title !== existing.title) {
        changes.push(`Title updated to "${updated.title}"`);
      }
      if (
        req.body.description &&
        req.body.description !== existing.description
      ) {
        changes.push(`Description updated`);
      }
      if (
        bountyAmount !== undefined &&
        bountyAmount !== existing.bountyAmount
      ) {
        changes.push(`Reward updated to ${updated.bountyAmount} ZEC`);
      }
      if (
        timeToComplete &&
        timeToComplete.getTime() !== new Date(existing.timeToComplete).getTime()
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
