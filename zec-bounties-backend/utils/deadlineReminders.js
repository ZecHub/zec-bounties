// utils/deadlineReminders.js
//
// Daily job that reminds assignees about their bounty deadline: one "due
// soon" reminder once the deadline is inside the reminder window, and one
// "overdue" reminder after it passes. The send time of each is stored on the
// bounty, so restarts and repeated runs never resend.
//
// Only approved IN_PROGRESS bounties are considered. Nothing here changes a
// bounty's status or assignees.

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 3;
const DEFAULT_SCHEDULE = "0 9 * * *";
const DEFAULT_TIMEZONE = "UTC";

const DUE_SOON = "DUE_SOON";
const OVERDUE = "OVERDUE";

const SENT_FIELD = {
  [DUE_SOON]: "dueSoonReminderSentAt",
  [OVERDUE]: "overdueReminderSentAt",
};

function readConfig(env = process.env) {
  const days = Number(env.DEADLINE_REMINDER_DAYS);
  return {
    enabled: env.DEADLINE_REMINDERS_ENABLED === "true",
    windowDays:
      env.DEADLINE_REMINDER_DAYS && Number.isFinite(days) && days > 0
        ? days
        : DEFAULT_WINDOW_DAYS,
    schedule: env.DEADLINE_REMINDER_CRON || DEFAULT_SCHEDULE,
    timezone: env.DEADLINE_REMINDER_TZ || DEFAULT_TIMEZONE,
  };
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// The moment from which a sent reminder counts. A timestamp older than this
// belongs to an earlier deadline, so extending a bounty's deadline re-arms
// its reminders for the new date.
function reminderCutoff(kind, deadline, windowDays) {
  return kind === OVERDUE
    ? deadline
    : new Date(deadline.getTime() - windowDays * DAY_MS);
}

// Returns DUE_SOON, OVERDUE or null for one bounty at time `now`.
function reminderKind(bounty, now, windowDays = DEFAULT_WINDOW_DAYS) {
  if (!bounty || bounty.status !== "IN_PROGRESS" || !bounty.isApproved) {
    return null;
  }
  const deadline = toDate(bounty.timeToComplete);
  if (!deadline) return null;

  // A bounty that is already past its deadline only gets the overdue
  // reminder, even if the due-soon one was never sent.
  const kind = now >= deadline ? OVERDUE : DUE_SOON;
  const cutoff = reminderCutoff(kind, deadline, windowDays);
  if (now < cutoff) return null;

  const sentAt = toDate(bounty[SENT_FIELD[kind]]);
  return sentAt && sentAt >= cutoff ? null : kind;
}

// Everyone assigned to the bounty: the BountyAssignee rows plus the legacy
// single `assignee` column, deduplicated.
function recipientsFor(bounty) {
  const byId = new Map();
  for (const row of bounty.assignees || []) {
    if (row.user) byId.set(row.user.id, row.user);
  }
  if (bounty.assigneeUser) {
    byId.set(bounty.assigneeUser.id, bounty.assigneeUser);
  }
  return [...byId.values()];
}

// In-app is always on; email and push follow the user's settings.
function channelsFor(user) {
  return {
    inApp: true,
    email: Boolean(user.email) && user.emailNotifications !== false,
    push: user.pushNotifications === true,
  };
}

function formatDeadline(date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildMessage(kind, bounty, now, frontendUrl) {
  const deadline = toDate(bounty.timeToComplete);
  const due = formatDeadline(deadline);
  const path = `/bounty/${bounty.id}`;
  const link = `${frontendUrl}${path}`;

  if (kind === DUE_SOON) {
    const days = Math.max(1, Math.ceil((deadline - now) / DAY_MS));
    const when = days === 1 ? "in 1 day" : `in ${days} days`;
    return {
      type: "BOUNTY_DEADLINE_DUE_SOON",
      title: `Due ${when}: ${bounty.title}`,
      body: `"${bounty.title}" is due ${when} (${due}). Submit your work before the deadline.`,
      path,
      link,
      due,
      heading: `Your bounty is due ${when}`,
    };
  }

  return {
    type: "BOUNTY_DEADLINE_OVERDUE",
    title: `Overdue: ${bounty.title}`,
    body: `"${bounty.title}" was due on ${due}. Submit your work, or let the bounty creator know in the bounty chat if you need more time.`,
    path,
    link,
    due,
    heading: "Your bounty is past its deadline",
  };
}

function buildEmail(user, message) {
  const name = user.nickname || user.name;
  return {
    to: user.email,
    subject: message.title,
    text: `Hi ${name},\n\n${message.body}\n\n${message.link}`,
    html: `
      <h2>${escapeHtml(message.heading)}</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>${escapeHtml(message.body)}</p>
      <p><a href="${escapeHtml(message.link)}">Open the bounty</a></p>
    `,
  };
}

// Real senders, loaded lazily so the selection logic above can be imported
// (and tested) without a database or mail server.
function defaultSenders() {
  const prisma = require("../prisma/client");
  const { sendToUser } = require("../middleware/websocket");
  const {
    sendMailIfEnabled,
    sendPushToOptedIn,
  } = require("./bountyHelpers");

  return {
    async inApp(user, bounty, message) {
      await prisma.inAppNotification.create({
        data: {
          userId: user.id,
          bountyId: bounty.id,
          type: message.type,
          title: message.title,
          body: message.body,
        },
      });
      sendToUser(user.id, "notification_new", { bountyId: bounty.id });
    },
    async email(user, bounty, message) {
      await sendMailIfEnabled(buildEmail(user, message));
    },
    async push(user, bounty, message) {
      await sendPushToOptedIn([user.id], {
        title: message.title,
        body: message.body,
        url: message.path,
      });
    },
  };
}

const userSelect = {
  id: true,
  name: true,
  nickname: true,
  email: true,
  emailNotifications: true,
  pushNotifications: true,
};

// One pass of the job. Returns what was sent, for logging and tests.
async function runDeadlineReminders({
  now = new Date(),
  windowDays = DEFAULT_WINDOW_DAYS,
  prisma = require("../prisma/client"),
  senders = defaultSenders(),
  frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000",
  logger = console,
} = {}) {
  const bounties = await prisma.bounty.findMany({
    where: {
      status: "IN_PROGRESS",
      isApproved: true,
      timeToComplete: { lte: new Date(now.getTime() + windowDays * DAY_MS) },
    },
    select: {
      id: true,
      title: true,
      status: true,
      isApproved: true,
      timeToComplete: true,
      updatedAt: true,
      dueSoonReminderSentAt: true,
      overdueReminderSentAt: true,
      assigneeUser: { select: userSelect },
      assignees: { select: { user: { select: userSelect } } },
    },
  });

  const sent = [];

  for (const bounty of bounties) {
    const kind = reminderKind(bounty, now, windowDays);
    if (!kind) continue;

    const recipients = recipientsFor(bounty);
    if (recipients.length === 0) continue;

    // Claim the reminder before sending. The update only matches while the
    // bounty is still in progress with the same deadline and no reminder of
    // this kind for it, so two overlapping runs (or two server instances)
    // can't both send. updatedAt is written back unchanged so a reminder
    // doesn't count as an edit to the bounty.
    const field = SENT_FIELD[kind];
    const cutoff = reminderCutoff(kind, toDate(bounty.timeToComplete), windowDays);
    const { count } = await prisma.bounty.updateMany({
      where: {
        id: bounty.id,
        status: "IN_PROGRESS",
        timeToComplete: bounty.timeToComplete,
        OR: [{ [field]: null }, { [field]: { lt: cutoff } }],
      },
      data: { [field]: now, updatedAt: bounty.updatedAt },
    });
    if (count === 0) continue;

    const message = buildMessage(kind, bounty, now, frontendUrl);
    const deliveries = [];

    for (const user of recipients) {
      const channels = channelsFor(user);
      for (const channel of ["inApp", "email", "push"]) {
        if (!channels[channel]) continue;
        try {
          await senders[channel](user, bounty, message);
          deliveries.push({ userId: user.id, channel });
        } catch (err) {
          logger.error(
            `[deadline reminders] ${channel} to ${user.id} for ${bounty.id} failed:`,
            err,
          );
        }
      }
    }

    sent.push({ bountyId: bounty.id, kind, deliveries });
  }

  return sent;
}

// Schedules the daily run when DEADLINE_REMINDERS_ENABLED=true. Returns the
// cron task, or null when the job is off or misconfigured.
function startDeadlineReminderJob({
  cron = require("node-cron"),
  env = process.env,
  run = runDeadlineReminders,
  logger = console,
} = {}) {
  const config = readConfig(env);
  if (!config.enabled) {
    logger.log("[deadline reminders] disabled (DEADLINE_REMINDERS_ENABLED is not true)");
    return null;
  }
  if (!cron.validate(config.schedule)) {
    logger.error(
      `[deadline reminders] invalid DEADLINE_REMINDER_CRON "${config.schedule}", job not started`,
    );
    return null;
  }

  const task = cron.schedule(
    config.schedule,
    async () => {
      try {
        const sent = await run({ windowDays: config.windowDays });
        logger.log(`[deadline reminders] sent ${sent.length} reminder(s)`);
      } catch (err) {
        logger.error("[deadline reminders] run failed:", err);
      }
    },
    { timezone: config.timezone, noOverlap: true, name: "deadline-reminders" },
  );

  logger.log(
    `[deadline reminders] scheduled "${config.schedule}" (${config.timezone}), window ${config.windowDays} day(s)`,
  );
  return task;
}

module.exports = {
  DUE_SOON,
  OVERDUE,
  readConfig,
  reminderKind,
  recipientsFor,
  channelsFor,
  buildMessage,
  buildEmail,
  runDeadlineReminders,
  startDeadlineReminderJob,
};
