const express = require("express");
const prisma = require("../prisma/client"); // shared client, not a new one
const router = express.Router();
const { authenticate } = require("../middleware/auth");

router.get("/", authenticate, async (req, res) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      prisma.inAppNotification.findMany({
        where: { userId: req.user.id },
        include: { bounty: { select: { id: true, title: true } } },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.inAppNotification.count({
        where: { userId: req.user.id, readAt: null },
      }),
    ]);

    return res.json({ notifications, unreadCount });
  } catch (error) {
    console.error("Notification list error:", error);
    return res.status(500).json({ error: "Failed to load notifications" });
  }
});

router.patch("/read-all", authenticate, async (req, res) => {
  try {
    await prisma.inAppNotification.updateMany({
      where: { userId: req.user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return res.json({ success: true });
  } catch (error) {
    console.error("Mark all notifications read error:", error);
    return res.status(500).json({ error: "Failed to update notifications" });
  }
});

router.patch("/:notificationId/read", authenticate, async (req, res) => {
  try {
    const result = await prisma.inAppNotification.updateMany({
      where: {
        id: req.params.notificationId,
        userId: req.user.id,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    return res.json({ success: true, updated: result.count > 0 });
  } catch (error) {
    console.error("Mark notification read error:", error);
    return res.status(500).json({ error: "Failed to update notification" });
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

    res.json({ success: true });
  } catch (error) {
    console.error("Push subscription error:", error);
    res.status(500).json({ error: "Failed to save push subscription" });
  }
});

// Call this on logout, or when the browser tells you the subscription changed
router.post("/push/unsubscribe", authenticate, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: "endpoint required" });

    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: req.user.id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Push unsubscribe error:", error);
    res.status(500).json({ error: "Failed to remove push subscription" });
  }
});

module.exports = router;
