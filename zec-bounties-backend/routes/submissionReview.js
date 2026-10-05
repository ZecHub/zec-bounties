const express = require("express");
const prisma = require("../prisma/client");
const { authenticate } = require("../middleware/auth");

const router = express.Router();
const MAX_MESSAGE_LENGTH = 5000;

const messageSelect = {
  id: true,
  submissionId: true,
  authorId: true,
  body: true,
  createdAt: true,
  author: { select: { id: true, name: true, nickname: true, avatar: true } },
};

async function getAccess(submissionId, user) {
  const submission = await prisma.workSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      submittedBy: true,
      bounty: { select: { id: true, createdBy: true, teamId: true } },
    },
  });
  if (!submission) return null;

  const { bounty } = submission;
  let reviewer = user.role === "ADMIN" || bounty.createdBy === user.id;
  if (!reviewer && bounty.teamId) {
    const member = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: bounty.teamId, userId: user.id } },
      select: { role: true },
    });
    reviewer = !!member && ["OWNER", "ADMIN"].includes(member.role);
  }

  // The submitter may read their own history even if a rejection later
  // removes their assignment. Only a current assignee may add a reply.
  const submitter = submission.submittedBy === user.id;
  let assigned = false;
  if (submitter) {
    assigned = !!(await prisma.bountyAssignee.findUnique({
      where: { bountyId_userId: { bountyId: bounty.id, userId: user.id } },
      select: { id: true },
    }));
  }
  return { reviewer, submitter, assigned };
}

router.get("/:submissionId/review-thread", authenticate, async (req, res) => {
  try {
    const access = await getAccess(req.params.submissionId, req.user);
    if (!access) return res.status(404).json({ error: "Submission not found" });
    if (!access.reviewer && !access.submitter) {
      return res.status(403).json({ error: "You cannot view this review thread" });
    }
    const messages = await prisma.submissionReviewMessage.findMany({
      where: { submissionId: req.params.submissionId },
      select: messageSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    res.json(messages);
  } catch (error) {
    console.error("Failed to load submission review thread:", error);
    res.status(500).json({ error: "Failed to load review thread" });
  }
});

router.post("/:submissionId/review-thread", authenticate, async (req, res) => {
  try {
    const body = req.body?.body;
    if (typeof body !== "string" || !body.trim() || body.trim().length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `Message must contain 1 to ${MAX_MESSAGE_LENGTH} characters` });
    }
    const access = await getAccess(req.params.submissionId, req.user);
    if (!access) return res.status(404).json({ error: "Submission not found" });
    if (!access.reviewer && !access.assigned) {
      return res.status(403).json({ error: "You cannot post to this review thread" });
    }
    const message = await prisma.submissionReviewMessage.create({
      data: {
        submissionId: req.params.submissionId,
        authorId: req.user.id,
        body: body.trim(),
      },
      select: messageSelect,
    });
    res.status(201).json(message);
  } catch (error) {
    console.error("Failed to post submission review message:", error);
    res.status(500).json({ error: "Failed to post review message" });
  }
});

module.exports = router;
