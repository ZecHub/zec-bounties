// GET /api/bounties/:id/payout — the payout tracker behind the bounty page.
//
// Reads the durable Transaction row for the bounty (txid, memo reference,
// timestamps, failure detail) and, while a broadcast payout is waiting to be
// mined, asks the paying wallet whether it has confirmed. A wallet or node
// outage never fails this request; it comes back as `backend.reachable: false`.
const express = require("express");
const prisma = require("../prisma/client");
const { authenticate } = require("../middleware/auth");
const { buildPayoutStatus } = require("../utils/payoutStatus");
const { refreshConfirmation } = require("../utils/payoutConfirmation");

const router = express.Router();

// The payout state, txid and any failure text are for the people involved in
// the bounty, not every visitor to the public page.
function canViewPayout(bounty, user) {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  if (bounty.createdBy === user.id || bounty.assignee === user.id) return true;
  return (bounty.assignees ?? []).some((a) => a.userId === user.id);
}

router.get("/:id/payout", authenticate, async (req, res) => {
  try {
    const bounty = await prisma.bounty.findUnique({
      where: { id: req.params.id },
      include: { assignees: { select: { userId: true } } },
    });

    if (!bounty) return res.status(404).json({ error: "Bounty not found" });
    if (!canViewPayout(bounty, req.user)) {
      return res.status(403).json({ error: "Not allowed to view this payout" });
    }

    let record = await prisma.transaction.findFirst({
      where: { bountyId: bounty.id },
      orderBy: { createdAt: "desc" },
    });

    let backend = null;
    try {
      ({ record, backend } = await refreshConfirmation(record));
    } catch (error) {
      // Anything unexpected while checking must not hide the payout itself.
      console.error("Payout confirmation check failed:", error.message);
      backend = { reachable: false, checkedAt: new Date() };
    }

    res.json(
      buildPayoutStatus(bounty, record, {
        isAdmin: req.user.role === "ADMIN",
        backend,
      }),
    );
  } catch (error) {
    console.error("Error fetching payout status:", error);
    res.status(500).json({ error: "Failed to fetch payout status" });
  }
});

module.exports = router;
