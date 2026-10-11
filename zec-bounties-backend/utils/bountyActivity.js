const prisma = require("../prisma/client");
const { sendToUser } = require("../middleware/websocket");
const { USER_SELECT_BASIC } = require("./userSelects");

// Same audience as canManageBounty: global admins, creator, team OWNER/ADMIN.
// The actor is included so their own open modal updates too.
async function publishActivity(row) {
  if (!row) return;
  try {
    const bounty = await prisma.bounty.findUnique({
      where: { id: row.bountyId },
      select: { createdBy: true, teamId: true },
    });
    if (!bounty) return;

    const [admins, teamAdmins] = await Promise.all([
      prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } }),
      bounty.teamId
        ? prisma.teamMember.findMany({
            where: { teamId: bounty.teamId, role: { in: ["OWNER", "ADMIN"] } },
            select: { userId: true },
          })
        : [],
    ]);

    const audience = new Set([
      bounty.createdBy,
      ...admins.map((u) => u.id),
      ...teamAdmins.map((m) => m.userId),
    ]);
    audience.forEach((userId) => sendToUser(userId, "bounty_activity", row));
  } catch (err) {
    console.error("Failed to publish bounty activity:", err);
  }
}

// Outside a transaction (client == null) this publishes immediately.
// Inside a transaction, it returns the row and the caller must call
// publishActivity(row) AFTER the transaction commits, so a rollback
// never emits a phantom event.
async function logActivity(client, { bountyId, actorId, type, meta }) {
  const row = await (client ?? prisma).bountyActivity.create({
    data: { bountyId, actorId: actorId ?? null, type, ...(meta && { meta }) },
    include: { actor: { select: USER_SELECT_BASIC } },
  });
  if (!client) publishActivity(row);
  return row;
}

module.exports = { logActivity, publishActivity };
