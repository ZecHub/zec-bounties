// utils/bountyHelpers.js
//
// Pulled out of routes/bounties.js so routes/teams.js can use the exact same
// logic instead of keeping a second, divergent copy — which is what caused
// the stale-cache bug (teams.js's own invalidateBounty never bumped the
// shared "bounties" version counter). Both routers now import from here.

const prisma = require("../prisma/client");
const { delCache, bumpVersion } = require("./cache");
const sendMail = require("./sendMail");
const notifyUser = require("./notifyUser");
const { sendRealtimeUpdate } = require("../middleware/websocket");

// ─── Email settings ─────────────────────────────────────────────────────
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

// Sends a push notification only to users who opted in AND have an active
// subscription. userIds: string[] — candidates to notify.
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
    await Promise.all(recipients.map((u) => notifyUser(u.id, payload)));
  } catch (err) {
    console.error("Push notification failed:", err);
  }
};

// Mirrors canViewPrivateBounty's rules, but returns the full recipient set
// instead of checking one user — used to scope websocket broadcasts so a
// private bounty's payload never reaches a socket outside its audience.
// Returns null for public bounties, meaning "broadcast to everyone".
async function getBroadcastRecipients(bounty) {
  if (!bounty.isPrivate) return null;

  const recipients = new Set([bounty.createdBy]);

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  admins.forEach((a) => recipients.add(a.id));

  if (bounty.teamId) {
    const members = await prisma.teamMember.findMany({
      where: { teamId: bounty.teamId },
      select: { userId: true },
    });
    members.forEach((m) => recipients.add(m.userId));
  }

  return [...recipients];
}

// Sends a realtime event about one team to the people allowed to see it.
// membersOnly — internal team business (members, roles, wallets, payments):
//   team members and platform admins, whatever the team's privacy.
// otherwise — directory-level changes: everyone for a public team; for a
//   private team, the same audience as its private bounties.
// Fails closed, like broadcastBountyEvent.
async function broadcastTeamEvent(
  type,
  payload,
  teamId,
  excludeUserId,
  { membersOnly = false, extraUserIds = [] } = {},
) {
  try {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { isPrivate: true },
    });
    if (!team) return;

    let recipients = null;
    if (membersOnly) {
      const [members, admins] = await Promise.all([
        prisma.teamMember.findMany({
          where: { teamId },
          select: { userId: true },
        }),
        prisma.user.findMany({
          where: { role: "ADMIN" },
          select: { id: true },
        }),
      ]);
      recipients = [
        ...members.map((m) => m.userId),
        ...admins.map((a) => a.id),
        ...extraUserIds,
      ];
    } else if (team.isPrivate) {
      recipients = await getBroadcastRecipients({ isPrivate: true, teamId });
    }

    sendRealtimeUpdate(type, payload, excludeUserId, recipients);
  } catch (err) {
    console.error(`Realtime ${type} for team ${teamId} not sent:`, err);
  }
}

// Sends a realtime event about one bounty to that bounty's audience only:
// everyone for a public bounty, getBroadcastRecipients() for a private one.
// Looks the bounty up itself so callers can pass any payload shape
// (bounty, submission, application, { bountyId }). Fails closed — if the
// audience can't be resolved nothing is sent; clients refetch on their own.
async function broadcastBountyEvent(type, payload, bountyId, excludeUserId) {
  try {
    const bounty = await prisma.bounty.findUnique({
      where: { id: bountyId },
      select: { isPrivate: true, createdBy: true, teamId: true },
    });
    if (!bounty) return;
    const recipients = await getBroadcastRecipients(bounty);
    sendRealtimeUpdate(type, payload, excludeUserId, recipients);
  } catch (err) {
    console.error(`Realtime ${type} for bounty ${bountyId} not sent:`, err);
  }
}

// The ONE canonical bounty-cache invalidator. Every route in every router
// that changes a bounty calls this — never a local copy.
async function invalidateBounty(bountyId) {
  await Promise.all([
    delCache(`assignees:admin:${bountyId}`, `assignees:user:${bountyId}`),
    delCache("stats:totals"),
    bumpVersion("bounties"),
  ]);
}

const ONBOARDED_ROLES = ["ADMIN", "HUNTER", "TEAM"];

function requireOnboarded(req, res) {
  if (!ONBOARDED_ROLES.includes(req.user.role)) {
    res
      .status(403)
      .json({ error: "Complete onboarding before performing this action" });
    return false;
  }
  return true;
}

// ─── Weekly bounty-creation quota ───────────────────────────────────────
// Tier breakpoints match the admin "Star Override" list in the KPIs
// dashboard (avatar:1 / avatar:5 / avatar:10 / avatar:15 / avatar:25 /
// avatar:50). Gold star = 15+ completed tasks.
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
// PATCH /api/kpis/users/:id/badges.
function getAvatarOverrideTier(badges) {
  if (!Array.isArray(badges)) return null;
  for (const b of badges) {
    const match = typeof b === "string" && b.match(/^avatar:(\d+)$/);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

async function isGoldStarOrAbove(userId, db) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { badges: true },
  });

  const overrideTier = getAvatarOverrideTier(user?.badges);
  if (overrideTier !== null) return overrideTier >= GOLD_STAR_THRESHOLD;

  const completed = await db.bounty.count({
    where: { assignee: userId, status: "DONE" },
  });

  return completed >= GOLD_STAR_THRESHOLD;
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

async function getWeeklyBountyQuota(userId, db = prisma, date = new Date()) {
  const isGold = await isGoldStarOrAbove(userId, db);
  const limit = isGold
    ? WEEKLY_BOUNTY_LIMIT_GOLD
    : WEEKLY_BOUNTY_LIMIT_STANDARD;

  const { start, end } = getCalendarWeekBounds(date);

  const used = await db.bounty.count({
    where: { createdBy: userId, dateCreated: { gte: start, lt: end } },
  });

  return { limit, used, remaining: Math.max(0, limit - used), resetsAt: end };
}

class WeeklyBountyQuotaError extends Error {
  constructor(quota) {
    super(`Weekly bounty creation limit reached (${quota.limit} per week)`);
    this.quota = quota;
  }
}

const MAX_SERIALIZATION_RETRIES = 4; // 5 attempts in total
const RETRY_BASE_MS = 10;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Full jitter: a random delay in (0, base * 2^attempt]. Two transactions that
// aborted each other must not retry in the same instant, or they re-read the
// same count, re-insert, and conflict again. Randomising the whole interval
// rather than adding jitter to a fixed one is what actually separates two
// contenders — equal delays stay in lockstep however long they are.
function serializationRetryDelay(attempt) {
  return Math.floor(Math.random() * RETRY_BASE_MS * 2 ** attempt) + 1;
}

// Both creation routes must count and insert in the same transaction. A plain
// transaction at PostgreSQL's default Read Committed isolation still allows
// simultaneous requests to consume the same last slot.
async function createBountyWithQuota(user, args) {
  if (user.role === "ADMIN") return prisma.bounty.create(args);

  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Use one timestamp for the quota window and inserted row, including
        // when a retry crosses Monday 00:00 UTC.
        const dateCreated = new Date();
        const quota = await getWeeklyBountyQuota(user.id, tx, dateCreated);
        if (quota.remaining <= 0) throw new WeeklyBountyQuotaError(quota);

        return tx.bounty.create({
          ...args,
          data: { ...args.data, dateCreated },
        });
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      // Prisma reports serialization conflicts/deadlocks as P2034. Retry the
      // entire check, so a losing request observes the newly consumed slot.
      if (error.code !== "P2034") throw error;

      if (attempt >= MAX_SERIALIZATION_RETRIES) {
        // Out of attempts. Before surfacing a 500, read the window once more
        // outside any transaction: if it is full, this caller is simply over
        // quota and the honest answer is the 429 it would have got had it lost
        // the race more cleanly. Only a conflict with slots still free is a
        // real failure worth raising.
        const quota = await getWeeklyBountyQuota(user.id);
        if (quota.remaining <= 0) throw new WeeklyBountyQuotaError(quota);
        throw error;
      }

      await sleep(serializationRetryDelay(attempt));
    }
  }
}
const requireTaskCreation = async (req, res, next) => {
  try {
    const u = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { canCreateTasks: true },
    });
    if (!u?.canCreateTasks) {
      return res
        .status(403)
        .json({ error: "You are blocked from creating tasks" });
    }
    next();
  } catch (err) {
    console.error("requireTaskCreation failed:", err);
    res.status(500).json({ error: "Failed to verify task access" });
  }
};

module.exports = {
  shouldSendEmails,
  sendMailIfEnabled,
  sendPushToOptedIn,
  getBroadcastRecipients,
  broadcastBountyEvent,
  broadcastTeamEvent,
  invalidateBounty,
  ONBOARDED_ROLES,
  requireOnboarded,
  getWeeklyBountyQuota,
  createBountyWithQuota,
  WeeklyBountyQuotaError,
  requireTaskCreation,
};
