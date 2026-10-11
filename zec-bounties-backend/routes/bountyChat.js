const express = require("express");
const prisma = require("../prisma/client");
const { authenticate } = require("../middleware/auth");
const { sendToUser } = require("../middleware/websocket");
const {
  canAccessBountyChat,
  validateChatMessage,
} = require("../helpers/bountyChatValidation");

const router = express.Router();

async function getChatBounty(bountyId, user) {
  const bounty = await prisma.bounty.findUnique({
    where: { id: bountyId },
    select: {
      id: true,
      title: true,
      status: true,
      assignee: true,
      assignees: { select: { userId: true } },
    },
  });

  if (!bounty) return { error: "Bounty not found", status: 404 };

  if (!canAccessBountyChat(bounty, user)) {
    return { error: "You do not have access to this bounty chat", status: 403 };
  }

  const assignedUserIds = new Set(
    [
      bounty.assignee,
      ...bounty.assignees.map((assignee) => assignee.userId),
    ].filter(Boolean),
  );

  return { bounty, assignedUserIds };
}

router.get("/:bountyId/chat", authenticate, async (req, res) => {
  try {
    const access = await getChatBounty(req.params.bountyId, req.user);
    if (access.error)
      return res.status(access.status).json({ error: access.error });

    const messages = await prisma.bountyChat.findMany({
      where: { bountyId: access.bounty.id },
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    return res.json({ messages: messages.reverse() });
  } catch (error) {
    console.error("Failed to load bounty chat:", error);
    return res.status(500).json({ error: "Failed to load bounty chat" });
  }
});

router.post("/:bountyId/chat", authenticate, async (req, res) => {
  try {
    const access = await getChatBounty(req.params.bountyId, req.user);
    if (access.error)
      return res.status(access.status).json({ error: access.error });
    if (access.bounty.status === "DONE") {
      return res
        .status(410)
        .json({ error: "Chat is closed for completed bounties" });
    }

    const validated = validateChatMessage(req.body ?? {});
    if (validated.error)
      return res.status(400).json({ error: validated.error });

    const recipientIds = new Set(access.assignedUserIds);
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true },
    });
    admins.forEach((admin) => recipientIds.add(admin.id));
    recipientIds.delete(req.user.id);

    const preview = validated.content || "Shared an image";
    const notificationBody =
      preview.length > 160 ? `${preview.slice(0, 157)}...` : preview;

    const message = await prisma.$transaction(async (tx) => {
      const savedMessage = await tx.bountyChat.create({
        data: {
          bountyId: access.bounty.id,
          senderId: req.user.id,
          content: validated.content || null,
          imageData: validated.imageData,
        },
        include: {
          sender: { select: { id: true, name: true, avatar: true } },
        },
      });

      if (recipientIds.size > 0) {
        await tx.inAppNotification.createMany({
          data: [...recipientIds].map((userId) => ({
            userId,
            bountyId: access.bounty.id,
            type: "BOUNTY_CHAT",
            title: `New message: ${access.bounty.title}`,
            body: `${req.user.name}: ${notificationBody}`,
          })),
        });
      }

      return savedMessage;
    });

    for (const recipientId of recipientIds) {
      sendToUser(recipientId, "bounty_chat_message", message);
      sendToUser(recipientId, "notification_new", {
        bountyId: access.bounty.id,
      });
    }

    return res.status(201).json({ message });
  } catch (error) {
    console.error("Failed to send bounty chat message:", error);
    return res.status(500).json({ error: "Failed to send chat message" });
  }
});

module.exports = router;
