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

// The ONE canonical bounty-cache invalidator. Every route in every router
// that changes a bounty calls this — never a local copy.
async function invalidateBounty(bountyId) {
  await Promise.all([
    delCache(`assignees:${bountyId}`),
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

async function getWeeklyBountyQuota(userId) {
  const isGold = await isGoldStarOrAbove(userId);
  const limit = isGold
    ? WEEKLY_BOUNTY_LIMIT_GOLD
    : WEEKLY_BOUNTY_LIMIT_STANDARD;

  const { start, end } = getCalendarWeekBounds();

  const used = await prisma.bounty.count({
    where: { createdBy: userId, dateCreated: { gte: start, lt: end } },
  });

  return { limit, used, remaining: Math.max(0, limit - used), resetsAt: end };
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
  invalidateBounty,
  ONBOARDED_ROLES,
  requireOnboarded,
  getWeeklyBountyQuota,
  requireTaskCreation,
};
