ALTER TABLE "Bounty"
ADD COLUMN "suggestionReviewStatus" TEXT,
ADD COLUMN "suggestionReviewReason" TEXT;

CREATE INDEX "Bounty_teamId_suggestionReviewStatus_idx"
ON "Bounty"("teamId", "suggestionReviewStatus");

UPDATE "Bounty"
SET "suggestionReviewStatus" = CASE
  WHEN "isApproved" THEN 'APPROVED'
  WHEN "status" = 'CANCELLED' THEN 'DECLINED'
  ELSE 'PENDING'
END
WHERE "createdBy" IN (
  SELECT "id" FROM "User" WHERE "role" = 'HUNTER'
);