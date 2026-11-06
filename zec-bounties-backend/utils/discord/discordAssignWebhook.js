const axios = require("axios");

const WEBHOOK_URL = process.env.DISCORD_BOT_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

async function notifyAssignment({ discordUsername, bountyId, bountyTitle }) {
  const payload = {
    discordUsername,
    bountyId,
    bountyTitle,
    bountyUrl: `${FRONTEND_URL}/bounty/${bountyId}`,
  };
  console.log("[discord-notify] sending payload:", JSON.stringify(payload));

  if (!WEBHOOK_URL || !WEBHOOK_SECRET) {
    console.error(
      "WEBHOOK_ENV / WEBHOOK_SECRET not set — skipping Discord assign notify",
    );
    return;
  }
  if (!discordUsername) {
    console.log("[discord-notify] skipped — no discordUsername for this user");
    return;
  }

  try {
    await axios.post(WEBHOOK_URL, payload, {
      headers: { "X-Webhook-Secret": WEBHOOK_SECRET },
    });
    console.log(
      `[discord-notify] sent for ${discordUsername} (bounty ${bountyId})`,
    );
  } catch (err) {
    console.error(
      "Discord assign webhook call failed:",
      err.response?.data || err.message,
    );
  }
}

// Sends notifyAssignment for every current assignee. Used when a bounty reaches IN_PROGRESS
// outside the assignee routes (e.g. an approved suggestion); the bot ignores repeats.
async function notifyBountyAssignees(prisma, bountyId) {
  const bounty = await prisma.bounty.findUnique({
    where: { id: bountyId },
    select: {
      title: true,
      assignees: { select: { user: { select: { discordUsername: true } } } },
    },
  });
  if (!bounty) return;
  await Promise.all(
    bounty.assignees.map((a) =>
      notifyAssignment({
        discordUsername: a.user?.discordUsername,
        bountyId,
        bountyTitle: bounty.title,
      }),
    ),
  );
}

// Sends the bot the bounty's status, payment and assignees so it can close channels that
// are no longer needed.
async function notifyBountyState(prisma, bountyId) {
  if (!WEBHOOK_URL || !WEBHOOK_SECRET) return;
  try {
    const bounty = await prisma.bounty.findUnique({
      where: { id: bountyId },
      select: {
        status: true,
        isPaid: true,
        assignees: {
          select: { userId: true, user: { select: { discordUsername: true } } },
        },
      },
    });
    if (!bounty) return;
    await axios.post(
      WEBHOOK_URL,
      {
        event: "bounty_state",
        bountyId,
        status: bounty.status,
        isPaid: bounty.isPaid === true,
        assignees: bounty.assignees.map((a) => ({
          userId: a.userId,
          discordUsername: a.user?.discordUsername || null,
        })),
      },
      { headers: { "X-Webhook-Secret": WEBHOOK_SECRET } },
    );
    console.log(
      `[discord-notify] state sent (bounty ${bountyId}, ${bounty.status})`,
    );
  } catch (err) {
    console.error(
      "Discord state webhook call failed:",
      err.response?.data || err.message,
    );
  }
}

// notifyBountyAssignees and notifyBountyState are used by the bounty, team and transaction routes.
module.exports = { notifyAssignment, notifyBountyAssignees, notifyBountyState };
