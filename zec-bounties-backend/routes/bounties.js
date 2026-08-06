const express = require("express");
const prisma = require("../prisma/client");
const { formatEmailText } = require("../helpers/email");
const router = express.Router();
const { authenticate, isAdmin } = require("../middleware/auth");
const { sendRealtimeUpdate } = require("../middleware/websocket");
const {
  getCache,
  setCache,
  delCache,
  deleteCacheByPattern,
  TTL,
} = require("../utils/cache");
const sendMail = require("../utils/sendMail");

// ─── Email settings ───────────────────────────────────────────────────────────
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

// ─── Reusable select shapes (avoids re-typing & keeps payloads small) ─────────
const USER_SELECT = { id: true, name: true, nickname: true, avatar: true };

const USER_SELECT_FULL = {
  id: true,
  name: true,
  nickname: true,
  email: true,
  avatar: true,
  z_address: true,
  UA_address: true,
};

// createdByUser / assigneeUser on Bounty (adds role, no address fields)
const USER_SELECT_WITH_ROLE = {
  id: true,
  name: true,
  nickname: true,
  email: true,
  role: true,
  avatar: true,
};

// submitterUser / reviewerUser / applicantUser-with-avatar
const USER_SELECT_BASIC = {
  id: true,
  name: true,
  nickname: true,
  email: true,
  avatar: true,
};

// applicantUser without avatar (a couple of routes only need this much)
const USER_SELECT_MINIMAL = {
  id: true,
  name: true,
  nickname: true,
  email: true,
};

// export routes (payments)
const USER_SELECT_EXPORT = {
  id: true,
  name: true,
  nickname: true,
  email: true,
  z_address: true,
  UA_address: true,
  ofacVerified: true,
};

const ASSIGNEE_INCLUDE = {
  assignees: {
    include: { user: { select: USER_SELECT } },
  },
};

// helper — call after any write that touches a specific bounty
const invalidateBounty = async (bountyId) => {
  await Promise.all([
    delCache(`bounty:${bountyId}`),
    delCache(`assignees:${bountyId}`),
    delCache("stats:totals"),
    deleteCacheByPattern("bounties:*"),
  ]);
};

const invalidateApplications = async (applicantId, bountyId) => {
  await Promise.all([
    delCache(`applications:user:${applicantId}`),
    delCache("applications:all"),
    ...(bountyId ? [delCache(`applications:bounty:${bountyId}`)] : []),
  ]);
};

const invalidateSubmissions = async (bountyId, submittedBy) => {
  await Promise.all([
    delCache(`submissions:${bountyId}`),
    delCache("submissions:all"),
    ...(submittedBy ? [delCache(`submissions:user:${submittedBy}`)] : []),
  ]);
};

// ─── Create bounty ────────────────────────────────────────────────────────────
router.post("/", authenticate, async (req, res) => {
  try {
    const {
      title,
      description,
      bountyAmount,
      timeToComplete,
      assignee,
      isApproved,
      categoryId,
      chain, // NEW
    } = req.body;

    if (chain && !["MAIN", "TEST"].includes(chain)) {
      return res.status(400).json({ error: "Invalid chain value" });
    }

    const resolvedAssignee = assignee === "none" ? null : assignee;
    const isClient = req.user.role === "CLIENT";

    const bounty = await prisma.bounty.create({
      data: {
        title,
        description,
        bountyAmount: parseFloat(bountyAmount),
        timeToComplete: new Date(timeToComplete),
        createdBy: req.user.id,
        assignee: resolvedAssignee,
        isApproved,
        categoryId,
        ...(chain && { chain }), // NEW — falls back to schema default (TEST) if omitted
        ...(isClient &&
          resolvedAssignee && {
            assignees: {
              create: {
                userId: resolvedAssignee,
              },
            },
          }),
      },
      include: {
        createdByUser: {
          select: USER_SELECT_WITH_ROLE,
        },
        assignees: {
          include: { user: { select: USER_SELECT } },
        },
        assigneeUser: {
          select: USER_SELECT_FULL,
        },
      },
    });

    sendRealtimeUpdate("new_bounties", bounty, req.user.id);
    await deleteCacheByPattern("bounties:*");

    // Respond immediately — don't block on mail
    res.status(201).json(bounty);

    // Fire-and-forget notification to all users
    (async () => {
      try {
        const cachedUsers = await getCache("users:all");
        const users =
          cachedUsers ??
          (await prisma.user.findMany({
            select: { email: true, emailNotifications: true },
          }));

        const recipients = users
          .filter((u) => u.emailNotifications !== false)
          .map((u) => u.email)
          .filter(Boolean);

        const creatorDisplayName =
          bounty.createdByUser.nickname || bounty.createdByUser.name;

        await Promise.all(
          recipients.map((recipient) =>
            sendMailIfEnabled({
              to: recipient,
              subject: `New Bounty Created: ${bounty.title}`,
              text: `A new bounty has been created.\n\nCreated by: ${creatorDisplayName}\n\nTitle: ${bounty.title}\nAmount: ${bounty.bountyAmount}`,
              html: `
            <h2>New Bounty Created</h2>
            <p><strong>Created by:</strong> ${creatorDisplayName}</p>
            <p><strong>Title:</strong> ${bounty.title}</p>
            <p><strong>Description:</strong><br/>
              ${formatEmailText(bounty.description)}
            </p>
            <p><strong>Amount:</strong> ${bounty.bountyAmount} ZEC</p>
            <p><strong>Time to complete:</strong> ${bounty.timeToComplete}</p>
          `,
            }),
          ),
        );
      } catch (mailErr) {
        console.error("Bounty notification email failed:", mailErr);
      }
    })();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create bounty" });
  }
});

// ─── List bounties (paginated, lean payload) ──────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const cacheKey = `bounties:${JSON.stringify({ page, limit })}`;

    // 1. CHECK CACHE FIRST
    const cached = await getCache(cacheKey);
    if (cached) {
      console.log("Cache Hit");
      return res.json(cached);
    }
    console.log("Cache Miss");

    // 2. DB FALLBACK
    const [bounties, total] = await Promise.all([
      prisma.bounty.findMany({
        skip: (page - 1) * limit,
        take: limit,
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
      }),
      prisma.bounty.count(),
    ]);

    const result = { data: bounties, total, page, limit };

    // 3. STORE IN CACHE
    await setCache(cacheKey, result, TTL.BOUNTY_LIST);

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch bounties" });
  }
});

// ─── Add / replace assignees (Admin only) ─────────────────────────────────────
// FIX: Replaced N individual prisma.bountyAssignee.create calls with a single
//      createMany, cutting round-trips from O(n) → O(1).
router.post("/:id/assignees", authenticate, isAdmin, async (req, res) => {
  try {
    const { id: bountyId } = req.params;
    const { userIds, notifyUsers = false } = req.body;

    if (!Array.isArray(userIds)) {
      return res.status(400).json({ error: "userIds must be an array" });
    }

    const bounty = await prisma.bounty.findUnique({
      where: { id: bountyId },
      select: { id: true, status: true, title: true },
    });
    if (!bounty) return res.status(404).json({ error: "Bounty not found" });

    // Snapshot BEFORE the transaction wipes/recreates the roster
    const existingAssignees = await prisma.bountyAssignee.findMany({
      where: { bountyId },
      include: { user: { select: USER_SELECT_FULL } },
    });
    const existingAssigneeIds = new Set(existingAssignees.map((a) => a.userId));
    const newAssigneeIds = new Set(userIds);

    const [, assignees] = await prisma.$transaction(async (tx) => {
      await tx.bountyAssignee.deleteMany({ where: { bountyId } });

      if (userIds.length === 0) {
        await tx.bounty.update({
          where: { id: bountyId },
          data: { status: "CANCELLED", assignee: null },
        });
        return [null, []];
      }

      await tx.bountyAssignee.createMany({
        data: userIds.map((userId) => ({ bountyId, userId })),
      });

      if (["TO_DO", "CANCELLED"].includes(bounty.status)) {
        await tx.bounty.update({
          where: { id: bountyId },
          data: { status: "IN_PROGRESS" },
        });
      }

      const created = await tx.bountyAssignee.findMany({
        where: { bountyId },
        include: { user: { select: USER_SELECT_FULL } },
      });
      return [null, created];
    });

    sendRealtimeUpdate(
      "bounty_assignees_updated",
      { bountyId, assignees },
      req.user.id,
    );
    await invalidateBounty(bountyId);
    res.status(200).json({ assignees });

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
router.delete(
  "/:id/assignees/:userId",
  authenticate,
  isAdmin,
  async (req, res) => {
    try {
      const { id: bountyId, userId } = req.params;

      await prisma.bountyAssignee.delete({
        where: { bountyId_userId: { bountyId, userId } },
      });

      sendRealtimeUpdate(
        "bounty_assignees_updated",
        { bountyId, removedUserId: userId },

        req.user.id,
      );
      await invalidateBounty(bountyId);
      res.json({ message: "Assignee removed successfully" });
    } catch (error) {
      console.error("Error removing assignee:", error);
      res.status(500).json({ error: "Failed to remove assignee" });
    }
  },
);

// ─── Get assignees for a bounty ───────────────────────────────────────────────
router.get("/:id/assignees", authenticate, async (req, res) => {
  try {
    const cacheKey = `assignees:${req.params.id}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);
    const assignees = await prisma.bountyAssignee.findMany({
      where: { bountyId: req.params.id },
      include: { user: { select: USER_SELECT_FULL } },
      orderBy: { assignedAt: "asc" },
    });
    await setCache(cacheKey, assignees, TTL.ASSIGNEES);
    res.json(assignees);
  } catch (error) {
    console.error("Error fetching assignees:", error);
    res.status(500).json({ error: "Failed to fetch assignees" });
  }
});

// ─── Authorize payment (Admin only) ──────────────────────────────────────────
router.put(
  "/:id/authorize-payment",
  authenticate,
  isAdmin,
  async (req, res) => {
    try {
      const { paymentAuthorized } = req.body;

      const updated = await prisma.bounty.update({
        where: { id: req.params.id },
        data: {
          ...(paymentAuthorized !== undefined && {
            paymentAuthorized,
            paymentAuthorizedAt: paymentAuthorized ? new Date() : null,
          }),
        },
      });

      sendRealtimeUpdate("payment_authorized", updated, req.user.id);
      await invalidateBounty(req.params.id);
      res.json(updated);
    } catch (error) {
      console.error("Error updating bounty:", error);
      res.status(500).json({ error: "Failed to update bounty" });
    }
  },
);

// ─── Approve bounty (Admin) ───────────────────────────────────────────────────
// FIX: id was cast to Number() but schema uses cuid strings — removed the cast.
router.patch("/:id/approve", authenticate, isAdmin, async (req, res) => {
  try {
    const updated = await prisma.bounty.update({
      where: { id: req.params.id },
      data: { approved: true },
    });
    sendRealtimeUpdate("bounty_approved", updated, req.user.id);
    await invalidateBounty(req.params.id);
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to approve bounty" });
  }
});

// ─── Change status (Admin) ────────────────────────────────────────────────────
// FIX: Collapsed the fetch + update into a single transaction so the DB isn't
//      hit twice serially for every status change.
router.patch("/:id/status", authenticate, isAdmin, async (req, res) => {
  try {
    const { status, winnerId } = req.body;
    const bountyId = req.params.id;

    const bounty = await prisma.bounty.findUnique({
      where: { id: bountyId },
      select: {
        id: true,
        status: true,
        assignee: true,
        assignees: { select: { userId: true } },
      },
    });

    if (!bounty) return res.status(404).json({ error: "Bounty not found" });

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

    const updated = await prisma.bounty.update({
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
        assigneeUser: { select: USER_SELECT_FULL },
        createdByUser: {
          select: USER_SELECT_WITH_ROLE,
        },
      },
    });

    sendRealtimeUpdate("bounty_status_changed", updated, req.user.id);
    await invalidateBounty(bountyId);
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update bounty status" });
  }
});

// ─── Submit work ──────────────────────────────────────────────────────────────
router.post("/:id/submit", authenticate, async (req, res) => {
  try {
    const { id: bountyId } = req.params;
    const { description, deliverableUrl } = req.body;
    const userId = req.user.id;

    if (!description?.trim()) {
      return res.status(400).json({ error: "Work description is required" });
    }

    // Single query — grab only what validation needs
    const bounty = await prisma.bounty.findUnique({
      where: { id: bountyId },
      select: {
        id: true,
        isApproved: true,
        status: true,
        workSubmissions: {
          where: {
            submittedBy: userId,
            status: { in: ["pending", "approved"] },
          },
          select: { id: true },
        },
      },
    });

    if (!bounty) return res.status(404).json({ error: "Bounty not found" });

    const isAssigned = await prisma.bountyAssignee.findUnique({
      where: { bountyId_userId: { bountyId, userId } },
      select: { userId: true },
    });
    if (!isAssigned)
      return res
        .status(403)
        .json({ error: "You are not assigned to this bounty" });
    if (!bounty.isApproved)
      return res
        .status(400)
        .json({ error: "Bounty must be approved before submitting work" });
    if (!["TO_DO", "IN_PROGRESS", "IN_REVIEW"].includes(bounty.status)) {
      return res.status(400).json({
        error: "Work cannot be submitted for bounties in this status",
      });
    }
    if (bounty.workSubmissions.length > 0) {
      return res
        .status(400)
        .json({ error: "You have already submitted work for this bounty" });
    }

    // Transaction: create submission + update status atomically
    const [workSubmission, updatedBounty] = await prisma.$transaction([
      prisma.workSubmission.create({
        data: {
          bountyId,
          submittedBy: userId,
          description: description.trim(),
          deliverableUrl: deliverableUrl?.trim() || null,
          status: "pending",
        },
        include: {
          submitterUser: {
            select: USER_SELECT_BASIC,
          },
        },
      }),
      prisma.bounty.update({
        where: { id: bountyId },
        data: { status: "IN_REVIEW" },
        include: {
          createdByUser: {
            select: USER_SELECT_WITH_ROLE,
          },
          assigneeUser: {
            select: USER_SELECT_WITH_ROLE,
          },
          workSubmissions: {
            include: {
              submitterUser: {
                select: USER_SELECT_BASIC,
              },
            },
          },
        },
      }),
    ]);

    sendRealtimeUpdate("work_submitted", workSubmission, userId);
    sendRealtimeUpdate("bounty_updated", updatedBounty, userId);
    await invalidateSubmissions(bountyId, userId);

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
      select: { id: true, createdBy: true },
    });
    if (!bounty) return res.status(404).json({ error: "Bounty not found" });

    const isCreatorOrAdmin =
      bounty.createdBy === userId || userRole === "ADMIN";

    let isAssignee = false;
    if (!isCreatorOrAdmin) {
      const assignee = await prisma.bountyAssignee.findUnique({
        where: { bountyId_userId: { bountyId, userId } },
        select: { userId: true },
      });
      isAssignee = !!assignee;
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
      const userRole = req.user.role;

      if (!["approved", "rejected", "needs_revision"].includes(status)) {
        return res.status(400).json({ error: "Invalid review status" });
      }

      const submission = await prisma.workSubmission.findUnique({
        where: { id: submissionId },
        include: {
          bounty: { select: { id: true, createdBy: true, status: true } },
          submitterUser: { select: USER_SELECT_MINIMAL },
        },
      });
      if (!submission)
        return res.status(404).json({ error: "Submission not found" });
      if (submission.bounty.createdBy !== userId && userRole !== "ADMIN") {
        return res.status(403).json({
          error: "You do not have permission to review this submission",
        });
      }

      // ── Determine new bounty status BEFORE the transaction ──────────────────
      let newBountyStatus = submission.bounty.status; // default: no change

      if (status === "approved") {
        newBountyStatus = "DONE";
      } else if (["rejected", "needs_revision"].includes(status)) {
        // Only revert if no other approved submission exists
        const approvedExists = await prisma.workSubmission.findFirst({
          where: {
            bountyId: submission.bounty.id,
            status: "approved",
            id: { not: submissionId },
          },
          select: { id: true },
        });
        if (!approvedExists) newBountyStatus = "IN_PROGRESS";
      }

      // Run all DB writes atomically
      const [updatedSubmission, updatedBounty] = await prisma.$transaction(
        async (tx) => {
          const updSub = await tx.workSubmission.update({
            where: { id: submissionId },
            data: {
              status,
              reviewNotes: reviewNotes?.trim() || null,
              reviewedBy: userId,
              reviewedAt: new Date(),
            },
            include: {
              submitterUser: {
                select: USER_SELECT_BASIC,
              },
              reviewerUser: {
                select: USER_SELECT_BASIC,
              },
            },
          });

          if (status === "approved") {
            // Reject all other pending submissions in one query
            await tx.workSubmission.updateMany({
              where: {
                bountyId: submission.bounty.id,
                id: { not: submissionId },
                status: "pending",
              },
              data: { status: "rejected" },
            });

            // Remove all assignees except the winner
            await tx.bountyAssignee.deleteMany({
              where: {
                bountyId: submission.bounty.id,
                userId: { not: submission.submittedBy },
              },
            });
          }

          const updBounty = await tx.bounty.update({
            where: { id: submission.bounty.id },
            data: {
              status: newBountyStatus,
              ...(status === "approved" && {
                assignee: submission.submittedBy,
                completedAt: new Date(),
              }),
              ...(status !== "approved" &&
                submission.bounty.status === "DONE" && { completedAt: null }),
            },
            include: {
              createdByUser: {
                select: USER_SELECT_WITH_ROLE,
              },
              assigneeUser: {
                select: USER_SELECT_WITH_ROLE,
              },
            },
          });

          return [updSub, updBounty];
        },
      );

      sendRealtimeUpdate("submission_reviewed", updatedSubmission, req.user.id);
      sendRealtimeUpdate("bounty_updated", updatedBounty, req.user.id);
      await invalidateSubmissions(submission.bounty.id, submission.submittedBy);
      await invalidateBounty(submission.bounty.id);

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
router.patch("/submissions/:submissionId", authenticate, async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { description, deliverableUrl } = req.body;
    const userId = req.user.id;

    if (!description?.trim()) {
      return res.status(400).json({ error: "Work description is required" });
    }

    const submission = await prisma.workSubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        submittedBy: true,
        submittedAt: true,
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

    const EDIT_WINDOW_MS = 15 * 60 * 1000;
    const elapsed = Date.now() - new Date(submission.submittedAt).getTime();
    if (elapsed > EDIT_WINDOW_MS) {
      return res.status(400).json({ error: "Edit window has expired" });
    }

    // Optional: only allow editing while still pending review
    if (submission.status !== "pending") {
      return res
        .status(400)
        .json({ error: "Submission has already been reviewed" });
    }

    const updated = await prisma.workSubmission.update({
      where: { id: submissionId },
      data: {
        description: description.trim(),
        deliverableUrl: deliverableUrl?.trim() || null,
      },
      include: {
        submitterUser: { select: USER_SELECT_BASIC },
      },
    });

    sendRealtimeUpdate("submission_edited", updated, userId);
    await invalidateSubmissions(submission.bountyId, userId);

    res.json({
      message: "Submission updated successfully",
      workSubmission: updated,
    });
  } catch (error) {
    console.error("Error editing submission:", error);
    res.status(500).json({ error: "Failed to edit submission" });
  }
});

// ─── Fetch all users ──────────────────────────────────────────────────────────
router.get("/users", async (req, res) => {
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
      },
    });
    await setCache(cacheKey, users, TTL.USERS);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Switch role ──────────────────────────────────────────────────────────────
router.patch("/switch-role", authenticate, async (req, res) => {
  try {
    const { role } = req.body;
    if (!["ADMIN", "CLIENT"].includes(role)) {
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
    await delCache("users:all");
    res.json({ user: updated });
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
router.put(
  "/applications/:applicationId",
  authenticate,
  isAdmin,
  async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { status } = req.body;

      const application = await prisma.bountyApplication.findUnique({
        where: { id: applicationId },
        select: {
          id: true,
          bountyId: true,
          applicantId: true,
          bounty: { select: { title: true } },
        },
      });
      if (!application)
        return res.status(404).json({ error: "Application not found" });

      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.bountyApplication.update({
          where: { id: applicationId },
          data: { status, reviewedAt: new Date(), reviewedBy: req.user.id },
          include: {
            applicantUser: { select: USER_SELECT_MINIMAL },
          },
        });

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
            where: { id: application.bountyId },
            data: { status: "IN_PROGRESS" },
          });
        }
        return updated;
      });
      await invalidateApplications(
        application.applicantId,
        application.bountyId,
      );
      await invalidateBounty(application.bountyId);

      sendRealtimeUpdate("application_updated", result, req.user.id);
      res.json(result);

      // Fire-and-forget — applicant just got assigned via acceptance
      if (status === "accepted" && result.applicantUser?.email) {
        const recipient = result.applicantUser;
        const bountyTitle = application.bounty?.title ?? "a bounty";
        sendMailIfEnabled({
          to: recipient.email,
          subject: `You've been assigned: ${bountyTitle}`,
          text: `Hi ${recipient.nickname || recipient.name},\n\nYour application was accepted and you've been assigned to "${bountyTitle}". You can start working on it now.`,
          html: `
            <h2>You've been assigned a bounty</h2>
            <p>Hi ${recipient.nickname || recipient.name},</p>
            <p>Your application was accepted and you've been assigned to:</p>
            <p><strong>${bountyTitle}</strong></p>
            <p>You can start working on it now.</p>
          `,
        }).catch((mailErr) =>
          console.error("Assignment notification email failed:", mailErr),
        );
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  },
);

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

      await prisma.bountyApplication.delete({ where: { id: applicationId } });
      await invalidateApplications(
        application.applicantId,
        application.bountyId,
      );
      await invalidateBounty(application.bountyId);
      sendRealtimeUpdate(
        "application_deleted",
        { id: applicationId, bountyId: application.bountyId },
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
    const { bountyId, applicantId, message } = req.body;

    const bounty = await prisma.bounty.findUnique({
      where: { id: bountyId },
      select: { id: true, assignee: true, createdBy: true },
    });
    if (!bounty) return res.status(404).json({ error: "Bounty not found" });
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

    const application = await prisma.bountyApplication.create({
      data: { bountyId, applicantId, message: message.trim() },
      include: {
        bounty: { select: { id: true, title: true, bountyAmount: true } },
        applicantUser: { select: USER_SELECT_MINIMAL },
      },
    });
    await invalidateApplications(applicantId);
    await invalidateBounty(application.bountyId);

    sendRealtimeUpdate("application_created", application, applicantId);
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

router.get("/stats/totals", async (req, res) => {
  try {
    const cacheKey = "stats:totals";

    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const [totalAmountResult, countResult] = await Promise.all([
      // Sum ALL bounty amounts — no pagination, one DB round-trip
      prisma.bounty.aggregate({
        where: { chain: "MAIN" },
        _sum: { bountyAmount: true },
        _count: { id: true },
      }),
      // Separate counts per status so the dashboard can show accurate numbers
      prisma.bounty.groupBy({
        by: ["status"],
        where: { chain: "MAIN" },
        _count: { id: true },
      }),
    ]);

    const statusCounts = countResult.reduce((acc, row) => {
      acc[row.status] = row._count.id;
      return acc;
    }, {});

    const result = {
      totalBountyAmount: totalAmountResult._sum.bountyAmount ?? 0,
      totalBountyCount: totalAmountResult._count.id,
      statusCounts,
    };

    // Cache for 60 s — short TTL so it reflects recent changes quickly
    await setCache(cacheKey, result, 60);

    res.json(result);
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ─── Get single bounty ────────────────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  try {
    const bountyId = req.params.id;
    const cacheKey = `bounty:${bountyId}`;

    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const bounty = await prisma.bounty.findUnique({
      where: { id: bountyId },
      include: {
        assigneeUser: {
          select: USER_SELECT_FULL,
        },
        assignees: {
          include: {
            user: {
              select: USER_SELECT_FULL,
            },
          },
        },
        createdByUser: {
          select: USER_SELECT_WITH_ROLE,
        },
      },
    });

    if (!bounty) return res.status(404).json({ error: "Bounty not found" });

    await setCache(cacheKey, bounty, TTL.BOUNTY_SINGLE);
    res.json(bounty);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch bounty" });
  }
});

// ─── Edit bounty (Admin) ──────────────────────────────────────────────────────
router.put("/:id", authenticate, isAdmin, async (req, res) => {
  try {
    if (
      req.body.chain !== undefined &&
      !["MAIN", "TEST"].includes(req.body.chain)
    ) {
      return res.status(400).json({ error: "Invalid chain value" });
    }

    const { notifyUsers = false } = req.body;

    // including the status flip hidden inside isApproved
    const before = await prisma.bounty.findUnique({
      where: { id: req.params.id },
      select: {
        title: true,
        description: true,
        bountyAmount: true,
        timeToComplete: true,
        status: true,
      },
    });
    if (!before) return res.status(404).json({ error: "Bounty not found" });

    const nextStatus =
      req.body.isApproved !== undefined
        ? req.body.isApproved
          ? "IN_PROGRESS"
          : "CANCELLED"
        : before.status;

    const updated = await prisma.bounty.update({
      where: { id: req.params.id },
      data: {
        ...(req.body.title && { title: req.body.title }),
        ...(req.body.description && { description: req.body.description }),
        ...(req.body.bountyAmount && { bountyAmount: req.body.bountyAmount }),
        ...(req.body.timeToComplete && {
          timeToComplete: req.body.timeToComplete,
        }),
        ...(req.body.assignee !== undefined && { assignee: req.body.assignee }),
        ...(req.body.chain !== undefined && { chain: req.body.chain }),
        ...(req.body.isApproved !== undefined && {
          isApproved: req.body.isApproved,
          status: nextStatus,
        }),
      },
      include: {
        assignees: {
          include: { user: { select: USER_SELECT_FULL } },
        },
      },
    });

    sendRealtimeUpdate("bounty_updated", updated, req.user.id);
    await invalidateBounty(req.params.id);
    res.json(updated);

    if (notifyUsers === true) {
      const changes = [];

      if (nextStatus !== before.status) {
        changes.push(`Status changed to ${nextStatus.replace("_", " ")}`);
      }
      if (req.body.title && req.body.title !== before.title) {
        changes.push(`Title updated to "${updated.title}"`);
      }
      if (req.body.description && req.body.description !== before.description) {
        changes.push(`Description updated`);
      }
      if (
        req.body.bountyAmount &&
        Number(req.body.bountyAmount) !== before.bountyAmount
      ) {
        changes.push(`Reward updated to ${updated.bountyAmount} ZEC`);
      }
      if (
        req.body.timeToComplete &&
        new Date(req.body.timeToComplete).getTime() !==
          new Date(before.timeToComplete).getTime()
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
