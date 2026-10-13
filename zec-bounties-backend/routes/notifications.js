const express = require("express");
const prisma = require("../prisma/client");
const router = express.Router();
const { authenticate } = require("../middleware/auth");

function withUrl(notification) {
  return {
    ...notification,
    url: notification.bountyId ? `/bounty/${notification.bountyId}` : null,
  };
}

router.get("/", authenticate, async (req, res) => {
  try {
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Math.min(
      Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 30, 1),
      50,
    );

    const [notifications, unreadCount] = await Promise.all([
      prisma.inAppNotification.findMany({
        where: { userId: req.user.id },
        include: { bounty: { select: { id: true, title: true } } },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.inAppNotification.count({
        where: { userId: req.user.id, readAt: null },
      }),
    ]);

    return res.json({
      notifications: notifications.map(withUrl),
      unreadCount,
    });
  } catch (error) {
    console.error("Notification list error:", error);
    return res.status(500).json({ error: "Failed to load notifications" });
  }
});

router.get("/unread-count", authenticate, async (req, res) => {
  try {
    const unreadCount = await prisma.inAppNotification.count({
      where: { userId: req.user.id, readAt: null },
    });
    return res.json({ unreadCount });
  } catch (error) {
    console.error("Notification unread count error:", error);
    return res.status(500).json({ error: "Failed to load notification count" });
  }
});

router.patch("/read-all", authenticate, async (req, res) => {
  try {
    const result = await prisma.inAppNotification.updateMany({
      where: { userId: req.user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return res.json({ success: true, updated: result.count });
  } catch (error) {
    console.error("Mark all notifications read error:", error);
    return res.status(500).json({ error: "Failed to mark notifications as read" });
  }
});

router.patch("/:id/read", authenticate, async (req, res) => {
  try {
    const result = await prisma.inAppNotification.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { readAt: new Date() },
    });
    if (!result.count) {
      return res.status(404).json({ error: "Notification not found" });
    }
    return res.json({ success: true, updated: true });
  } catch (error) {
    console.error("Mark notification read error:", error);
    return res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

router.post("/push/subscribe", authenticate, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "Invalid push subscription" });
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        userId: req.user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      create: {
        userId: req.user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    });

    return res.json({ success: true });
  } catch (error) {
    console.error("Push subscription error:", error);
    return res.status(500).json({ error: "Failed to save push subscription" });
  }
});

router.post("/push/unsubscribe", authenticate, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: "endpoint required" });

    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: req.user.id },
    });

    return res.json({ success: true });
  } catch (error) {
    console.error("Push unsubscribe error:", error);
    return res.status(500).json({ error: "Failed to remove push subscription" });
  }
});

module.exports = router;

[executed on device: ayobami-Latitude-7490 (7d1414a3-3c53-4ca4-bd2e-0634cf62f6c1)]