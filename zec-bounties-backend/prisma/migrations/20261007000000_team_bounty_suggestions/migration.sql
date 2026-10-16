ALTER TABLE "Bounty"
ADD COLUMN "suggestionReviewStatus" TEXT,
ADD COLUMN "suggestionReviewReason" TEXT;

CREATE INDEX "Bounty_teamId_suggestionReviewStatus_idx"
ON "Bounty"("teamId", "suggestionReviewStatus");