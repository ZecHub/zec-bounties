const axios = require("axios");

const WEBHOOK_TIMEOUT_MS = 10_000;

function getWebhookConfig() {
  const webhookUrl =
    typeof process.env.DISCORD_BOT_WEBHOOK_URL === "string"
      ? process.env.DISCORD_BOT_WEBHOOK_URL.trim()
      : "";
  const webhookSecret =
    typeof process.env.WEBHOOK_SECRET === "string"
      ? process.env.WEBHOOK_SECRET.trim()
      : "";
  const rawFrontendUrl =
    typeof process.env.FRONTEND_URL === "string"
      ? process.env.FRONTEND_URL.trim()
      : "";
  const frontendUrl = (rawFrontendUrl || "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
  return { webhookUrl, webhookSecret, frontendUrl };
}

async function notifyAssignment({ discordUsername, bountyId, bountyTitle }) {
  const { webhookUrl, webhookSecret, frontendUrl } = getWebhookConfig();
  if (!webhookUrl || !webhookSecret) {
    console.error(
      "DISCORD_BOT_WEBHOOK_URL / WEBHOOK_SECRET not set — skipping Discord assign notify",
    );
    return;
  }

  const normalizedUsername =
    typeof discordUsername === "string" ? discordUsername.trim() : "";
  if (!normalizedUsername) {
    console.log("[discord-notify] skipped — no discordUsername for this user");
    return;
  }

  const payload = {
    discordUsername: normalizedUsername,
    bountyId,
    bountyTitle,
    bountyUrl: `${frontendUrl}/bounty/${bountyId}`,
  };
  console.log("[discord-notify] sending payload:", JSON.stringify(payload));

  try {
    await axios.post(webhookUrl, payload, {
      headers: { "X-Webhook-Secret": webhookSecret },
      timeout: WEBHOOK_TIMEOUT_MS,
    });
    console.log(
      `[discord-notify] sent for ${normalizedUsername} (bounty ${bountyId})`,
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
  const { webhookUrl, webhookSecret } = getWebhookConfig();
  if (!webhookUrl || !webhookSecret) return;

  try {
    const bounty = await prisma.bounty.findUnique({
      where: { id: bountyId },
      select: {
        title: true,
        assignees: { select: { user: { select: { discordUsername: true } } } },
      },
    });
    if (!bounty || !Array.isArray(bounty.assignees)) return;
    await Promise.all(
      bounty.assignees.map((a) =>
        notifyAssignment({
          discordUsername: a.user?.discordUsername,
          bountyId,
          bountyTitle: bounty.title,
        }),
      ),
    );
  } catch (err) {
    console.error(
      "Discord assignees lookup failed:",
      err.response?.data || err.message,
    );
  }
}

// Sends the bot the bounty's status, payment and assignees so it can close channels that
// are no longer needed.
async function notifyBountyState(prisma, bountyId) {
  const { webhookUrl, webhookSecret } = getWebhookConfig();
  if (!webhookUrl || !webhookSecret) return;

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
    const assignees = Array.isArray(bounty.assignees) ? bounty.assignees : [];
    await axios.post(
      webhookUrl,
      {
        event: "bounty_state",
        bountyId,
        status: bounty.status,
        isPaid: bounty.isPaid === true,
        assignees: assignees.map((a) => ({
          userId: a.userId,
          discordUsername: a.user?.discordUsername || null,
        })),
      },
      {
        headers: { "X-Webhook-Secret": webhookSecret },
        timeout: WEBHOOK_TIMEOUT_MS,
      },
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
