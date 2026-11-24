const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DUE_SOON,
  readConfig,
  buildMessage,
  buildEmail,
  runDeadlineReminders,
  startDeadlineReminderJob,
} = require("../utils/deadlineReminders");

const NOW = new Date("2026-10-14T09:00:00Z");

test("readConfig trims whitespace-only cron and timezone overrides back to defaults", () => {
  const cfg = readConfig({
    DEADLINE_REMINDERS_ENABLED: "true",
    DEADLINE_REMINDER_CRON: "   ",
    DEADLINE_REMINDER_TZ: "\t  ",
  });
  assert.equal(cfg.schedule, "0 9 * * *");
  assert.equal(cfg.timezone, "UTC");
});

test("buildMessage strips trailing slashes from frontendUrl and rejects missing/invalid deadlines", () => {
  const msg = buildMessage(
    DUE_SOON,
    { id: "b42", title: "Audit", timeToComplete: new Date("2026-10-16T09:00:00Z") },
    NOW,
    "https://bounties.zechub.org///",
  );
  assert.equal(msg.link, "https://bounties.zechub.org/bounty/b42");

  assert.throws(
    () => buildMessage(DUE_SOON, { id: "b42", title: "Audit", timeToComplete: null }, NOW, "https://x"),
    /Invalid bounty deadline/,
  );
});

test("buildEmail falls back to 'there' when nickname and name are empty/missing and escapes single quotes", () => {
  const msg = buildMessage(
    DUE_SOON,
    { id: "b1", title: "O'Connor's task", timeToComplete: new Date("2026-10-16T09:00:00Z") },
    NOW,
    "https://bounties.zechub.org",
  );
  const mail = buildEmail({ email: "anon@example.com", name: "   ", nickname: null }, msg);
  assert.ok(mail.text.startsWith("Hi there,\n\n"));
  assert.ok(mail.html.includes("<p>Hi there,</p>"));
  assert.ok(mail.html.includes("O&#39;Connor&#39;s task"));
});

test("runDeadlineReminders includes isApproved: true in the atomic updateMany claim", async () => {
  let seenUpdateWhere = null;
  const db = {
    bounty: {
      async findMany() {
        return [
          {
            id: "b1",
            title: "Fix bug",
            status: "IN_PROGRESS",
            isApproved: true,
            timeToComplete: new Date("2026-10-16T09:00:00Z"),
            updatedAt: new Date("2026-10-01T00:00:00Z"),
            dueSoonReminderSentAt: null,
            overdueReminderSentAt: null,
            assigneeUser: {
              id: "u1",
              name: "Ada",
              nickname: null,
              email: "ada@example.com",
              emailNotifications: true,
              pushNotifications: false,
            },
            assignees: [],
          },
        ];
      },
      async updateMany({ where }) {
        seenUpdateWhere = where;
        // Simulate bounty being unapproved between findMany and updateMany
        return { count: 0 };
      },
    },
  };

  const sent = await runDeadlineReminders({
    now: NOW,
    prisma: db,
    senders: { inApp: async () => {}, email: async () => {}, push: async () => {} },
    logger: { log() {}, error() {} },
  });
  assert.equal(sent.length, 0);
  assert.equal(seenUpdateWhere.isApproved, true);
});

test("startDeadlineReminderJob refuses invalid IANA timezone instead of throwing", () => {
  let scheduled = false;
  const errors = [];
  const cron = {
    validate: () => true,
    schedule: () => {
      scheduled = true;
      return { stop() {} };
    },
  };
  const task = startDeadlineReminderJob({
    cron,
    env: {
      DEADLINE_REMINDERS_ENABLED: "true",
      DEADLINE_REMINDER_TZ: "Mars/Olympus_Mons",
    },
    logger: {
      log() {},
      error(msg) {
        errors.push(msg);
      },
    },
  });
  assert.equal(task, null);
  assert.equal(scheduled, false);
  assert.ok(errors.some((m) => m.includes("DEADLINE_REMINDER_TZ")));
});
