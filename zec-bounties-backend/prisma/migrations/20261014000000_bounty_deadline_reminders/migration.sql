ALTER TABLE "Bounty"
ADD COLUMN "dueSoonReminderSentAt" TIMESTAMP(3),
ADD COLUMN "overdueReminderSentAt" TIMESTAMP(3);

CREATE INDEX "Bounty_status_timeToComplete_idx"
ON "Bounty"("status", "timeToComplete");
