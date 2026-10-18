const test = require("node:test");
const assert = require("node:assert/strict");

const {
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
} = require("../utils/deadlineReminders");

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-14T09:00:00Z");
const inDays = (days, from = NOW) => new Date(from.getTime() + days * DAY);

const bounty = (overrides = {}) => ({
  id: "b1",
  title: "Write docs",
  status: "IN_PROGRESS",
  isApproved: true,
  timeToComplete: inDays(2),
  updatedAt: new Date("2026-10-01T00:00:00Z"),
  dueSoonReminderSentAt: null,
  overdueReminderSentAt: null,
  assigneeUser: null,
  assignees: [],
  ...overrides,
});

const user = (overrides = {}) => ({
  id: "u1",
  name: "Ada",
  nickname: null,
  email: "ada@example.com",
  emailNotifications: true,
  pushNotifications: true,
  ...overrides,
});

// ─── Selection ──────────────────────────────────────────────────────────

test("due soon: deadline inside the window", () => {
  assert.equal(reminderKind(bounty({ timeToComplete: inDays(3) }), NOW, 3), DUE_SOON);
  assert.equal(reminderKind(bounty({ timeToComplete: inDays(0.5) }), NOW, 3), DUE_SOON);
});

test("nothing yet: deadline further out than the window", () => {
  assert.equal(reminderKind(bounty({ timeToComplete: inDays(3.01) }), NOW, 3), null);
  assert.equal(reminderKind(bounty({ timeToComplete: inDays(30) }), NOW, 3), null);
});

test("overdue: deadline has passed", () => {
  assert.equal(reminderKind(bounty({ timeToComplete: NOW }), NOW, 3), OVERDUE);
  assert.equal(reminderKind(bounty({ timeToComplete: inDays(-80) }), NOW, 3), OVERDUE);
});

test("overdue bounty that never got a due-soon reminder only gets the overdue one", () => {
  const b = bounty({ timeToComplete: inDays(-1), dueSoonReminderSentAt: null });
  assert.equal(reminderKind(b, NOW, 3), OVERDUE);
});

test("already reminded: no second due-soon or overdue reminder", () => {
  const dueSoon = bounty({ timeToComplete: inDays(2), dueSoonReminderSentAt: inDays(-1) });
  assert.equal(reminderKind(dueSoon, NOW, 3), null);

  const overdue = bounty({ timeToComplete: inDays(-2), overdueReminderSentAt: inDays(-1) });
  assert.equal(reminderKind(overdue, NOW, 3), null);
});

test("due-soon reminder already sent still allows the overdue one later", () => {
  const b = bounty({ timeToComplete: inDays(-1), dueSoonReminderSentAt: inDays(-3) });
  assert.equal(reminderKind(b, NOW, 3), OVERDUE);
});

test("extending the deadline re-arms the reminders for the new date", () => {
  // Overdue reminder went out for an Oct 10 deadline, then it was moved to Oct 16.
  const extended = bounty({
    timeToComplete: inDays(2),
    dueSoonReminderSentAt: new Date("2026-10-07T09:00:00Z"),
    overdueReminderSentAt: new Date("2026-10-10T09:00:00Z"),
  });
  assert.equal(reminderKind(extended, NOW, 3), DUE_SOON);
  assert.equal(reminderKind(extended, inDays(2.5), 3), OVERDUE);
});

test("wrong status: only IN_PROGRESS bounties get reminders", () => {
  for (const status of ["TO_DO", "IN_REVIEW", "DONE", "CANCELLED"]) {
    assert.equal(reminderKind(bounty({ status }), NOW, 3), null, status);
    assert.equal(reminderKind(bounty({ status, timeToComplete: inDays(-5) }), NOW, 3), null, status);
  }
});

test("unapproved bounties are skipped", () => {
  assert.equal(reminderKind(bounty({ isApproved: false }), NOW, 3), null);
});

test("no deadline: missing or invalid timeToComplete is skipped", () => {
  assert.equal(reminderKind(bounty({ timeToComplete: null }), NOW, 3), null);
  assert.equal(reminderKind(bounty({ timeToComplete: undefined }), NOW, 3), null);
  assert.equal(reminderKind(bounty({ timeToComplete: "not a date" }), NOW, 3), null);
});

// ─── Recipients and channels ────────────────────────────────────────────

test("recipients merge BountyAssignee rows with the legacy assignee, without duplicates", () => {
  const ada = user({ id: "ada" });
  const bob = user({ id: "bob" });
  const b = bounty({
    assigneeUser: ada,
    assignees: [{ user: ada }, { user: bob }, { user: null }],
  });
  assert.deepEqual(recipientsFor(b).map((u) => u.id).sort(), ["ada", "bob"]);
});

test("notifications turned off: email and push follow the user's settings", () => {
  assert.deepEqual(channelsFor(user()), { inApp: true, email: true, push: true });
  assert.deepEqual(channelsFor(user({ emailNotifications: false })), {
    inApp: true,
    email: false,
    push: true,
  });
  assert.deepEqual(channelsFor(user({ pushNotifications: false })), {
    inApp: true,
    email: true,
    push: false,
  });
  assert.equal(channelsFor(user({ email: null })).email, false);
});

// ─── Messages ───────────────────────────────────────────────────────────

test("messages name the bounty, the deadline and link to it", () => {
  const b = bounty({ timeToComplete: new Date("2026-10-17T09:00:00Z") });
  const soon = buildMessage(DUE_SOON, b, NOW, "https://bounties.example");
  assert.equal(soon.type, "BOUNTY_DEADLINE_DUE_SOON");
  assert.equal(soon.title, "Due in 3 days: Write docs");
  assert.match(soon.body, /Oct 17, 2026/);
  assert.equal(soon.path, "/bounty/b1");
  assert.equal(soon.link, "https://bounties.example/bounty/b1");

  const late = buildMessage(OVERDUE, b, inDays(5), "https://bounties.example");
  assert.equal(late.type, "BOUNTY_DEADLINE_OVERDUE");
  assert.equal(late.title, "Overdue: Write docs");
  assert.match(late.body, /was due on Oct 17, 2026/);
});

test("email html escapes the bounty title", () => {
  const b = bounty({ title: "<script>x</script>" });
  const mail = buildEmail(user(), buildMessage(DUE_SOON, b, NOW, "https://x"));
  assert.equal(mail.to, "ada@example.com");
  assert.ok(!mail.html.includes("<script>"));
  assert.ok(mail.html.includes("&lt;script&gt;"));
});

// ─── Config ─────────────────────────────────────────────────────────────

test("config defaults to off, 3 days, 09:00 UTC daily", () => {
  assert.deepEqual(readConfig({}), {
    enabled: false,
    windowDays: 3,
    schedule: "0 9 * * *",
    timezone: "UTC",
  });
  const custom = readConfig({
    DEADLINE_REMINDERS_ENABLED: "true",
    DEADLINE_REMINDER_DAYS: "5",
    DEADLINE_REMINDER_CRON: "30 7 * * *",
    DEADLINE_REMINDER_TZ: "Africa/Lagos",
  });
  assert.deepEqual(custom, {
    enabled: true,
    windowDays: 5,
    schedule: "30 7 * * *",
    timezone: "Africa/Lagos",
  });
  assert.equal(readConfig({ DEADLINE_REMINDER_DAYS: "abc" }).windowDays, 3);
  assert.equal(readConfig({ DEADLINE_REMINDER_DAYS: "-1" }).windowDays, 3);
});

test("job is not scheduled unless enabled, or when the cron expression is invalid", () => {
  const scheduled = [];
  const cron = {
    validate: (expr) => expr !== "bad",
    schedule: (...args) => (scheduled.push(args), { stop() {} }),
  };
  const logger = { log() {}, error() {} };

  assert.equal(startDeadlineReminderJob({ cron, env: {}, logger }), null);
  assert.equal(
    startDeadlineReminderJob({
      cron,
      env: { DEADLINE_REMINDERS_ENABLED: "true", DEADLINE_REMINDER_CRON: "bad" },
      logger,
    }),
    null,
  );
  assert.equal(scheduled.length, 0);

  assert.ok(startDeadlineReminderJob({ cron, env: { DEADLINE_REMINDERS_ENABLED: "true" }, logger }));
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0][0], "0 9 * * *");
  assert.deepEqual(scheduled[0][2], {
    timezone: "UTC",
    noOverlap: true,
    name: "deadline-reminders",
  });
});

// ─── Full run against an in-memory database ─────────────────────────────

// Implements just the two queries the job makes, with the same filtering
// Postgres would apply.
function fakeDb(bounties) {
  const rows = bounties.map((b) => ({ ...b }));
  const matchesSentFilter = (row, or) =>
    or.some((clause) => {
      const [field, cond] = Object.entries(clause)[0];
      return cond === null ? row[field] === null : row[field] !== null && row[field] < cond.lt;
    });
  return {
    rows,
    bounty: {
      async findMany({ where }) {
        return rows
          .filter(
            (r) =>
              r.status === where.status &&
              r.isApproved === where.isApproved &&
              r.timeToComplete <= where.timeToComplete.lte,
          )
          .map((r) => ({ ...r }));
      },
      async updateMany({ where, data }) {
        const row = rows.find(
          (r) =>
            r.id === where.id &&
            r.status === where.status &&
            r.timeToComplete.getTime() === where.timeToComplete.getTime() &&
            matchesSentFilter(r, where.OR),
        );
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  };
}

function recordingSenders() {
  const log = [];
  const record = (channel) => async (u, b, message) =>
    log.push({ channel, userId: u.id, bountyId: b.id, title: message.title });
  return { log, senders: { inApp: record("inApp"), email: record("email"), push: record("push") } };
}

const quiet = { log() {}, error() {} };

test("an assignee gets exactly one due-soon and one overdue reminder across daily runs", async () => {
  const ada = user({ id: "ada" });
  const db = fakeDb([
    bounty({ id: "b1", timeToComplete: inDays(3), assignees: [{ user: ada }] }),
  ]);
  const { log, senders } = recordingSenders();
  const run = (now) =>
    runDeadlineReminders({ now, windowDays: 3, prisma: db, senders, logger: quiet });

  // Daily runs from 5 days before the deadline to 5 days after, plus a
  // restart that runs twice on the same day.
  const results = [];
  for (let day = -2; day <= 8; day++) results.push(await run(inDays(day)));
  results.push(await run(inDays(8)));

  const reminders = results.flat();
  assert.deepEqual(
    reminders.map((r) => r.kind),
    [DUE_SOON, OVERDUE],
  );
  assert.deepEqual(
    log.filter((l) => l.channel === "inApp").map((l) => l.title),
    ["Due in 3 days: Write docs", "Overdue: Write docs"],
  );
  assert.equal(log.length, 6); // 2 reminders x 3 channels
  assert.ok(db.rows[0].dueSoonReminderSentAt);
  assert.ok(db.rows[0].overdueReminderSentAt);
});

test("users with email or push turned off don't get that channel", async () => {
  const noEmail = user({ id: "no-email", emailNotifications: false });
  const noPush = user({ id: "no-push", pushNotifications: false });
  const db = fakeDb([
    bounty({ assignees: [{ user: noEmail }, { user: noPush }] }),
  ]);
  const { log, senders } = recordingSenders();
  await runDeadlineReminders({ now: NOW, prisma: db, senders, logger: quiet });

  const channelsOf = (id) => log.filter((l) => l.userId === id).map((l) => l.channel);
  assert.deepEqual(channelsOf("no-email"), ["inApp", "push"]);
  assert.deepEqual(channelsOf("no-push"), ["inApp", "email"]);
});

test("only approved IN_PROGRESS bounties are reminded", async () => {
  const ada = user();
  const db = fakeDb([
    bounty({ id: "review", status: "IN_REVIEW", assigneeUser: ada }),
    bounty({ id: "done", status: "DONE", assigneeUser: ada }),
    bounty({ id: "cancelled", status: "CANCELLED", assigneeUser: ada }),
    bounty({ id: "unapproved", isApproved: false, assigneeUser: ada }),
    bounty({ id: "far", timeToComplete: inDays(10), assigneeUser: ada }),
    bounty({ id: "ok", assigneeUser: ada }),
  ]);
  const { senders } = recordingSenders();
  const sent = await runDeadlineReminders({ now: NOW, prisma: db, senders, logger: quiet });
  assert.deepEqual(sent.map((s) => s.bountyId), ["ok"]);
});

test("a bounty with no assignee is not claimed", async () => {
  const db = fakeDb([bounty()]);
  const { log, senders } = recordingSenders();
  const sent = await runDeadlineReminders({ now: NOW, prisma: db, senders, logger: quiet });
  assert.equal(sent.length, 0);
  assert.equal(log.length, 0);
  assert.equal(db.rows[0].dueSoonReminderSentAt, null);
});

test("claiming leaves updatedAt unchanged so a reminder isn't an edit", async () => {
  const db = fakeDb([bounty({ assigneeUser: user() })]);
  const { senders } = recordingSenders();
  await runDeadlineReminders({ now: NOW, prisma: db, senders, logger: quiet });
  assert.equal(db.rows[0].updatedAt.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(db.rows[0].dueSoonReminderSentAt, NOW);
});

test("if another run claimed the reminder first, nothing is sent", async () => {
  const db = fakeDb([bounty({ assigneeUser: user() })]);
  const { log, senders } = recordingSenders();
  const original = db.bounty.updateMany;
  db.bounty.updateMany = async () => ({ count: 0 });
  const sent = await runDeadlineReminders({ now: NOW, prisma: db, senders, logger: quiet });
  db.bounty.updateMany = original;
  assert.equal(sent.length, 0);
  assert.equal(log.length, 0);
});

test("one failing channel doesn't stop the others", async () => {
  const db = fakeDb([bounty({ assigneeUser: user() })]);
  const { log, senders } = recordingSenders();
  senders.email = async () => {
    throw new Error("smtp down");
  };
  const [result] = await runDeadlineReminders({ now: NOW, prisma: db, senders, logger: quiet });
  assert.deepEqual(result.deliveries.map((d) => d.channel), ["inApp", "push"]);
  assert.deepEqual(log.map((l) => l.channel), ["inApp", "push"]);
});
