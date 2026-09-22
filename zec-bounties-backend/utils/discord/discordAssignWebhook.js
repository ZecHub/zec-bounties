const axios = require("axios");

const WEBHOOK_URL = process.env.DISCORD_BOT_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

async function notifyAssignment({ discordUsername, bountyId, bountyTitle }) {
  console.log("[discord-notify] called with:", {
    discordUsername,
    bountyId,
    bountyTitle,
  }); // ← new

  if (!WEBHOOK_URL || !WEBHOOK_SECRET) {
    console.log(WEBHOOK_URL, WEBHOOK_SECRET);
    console.error(
      "WEBHOOK_ENV / WEBHOOK_SECRET not set — skipping Discord assign notify",
    );
    return;
  }
  if (!discordUsername) {
    console.log("[discord-notify] skipped — no discordUsername for this user"); // ← new
    return;
  }

  try {
    await axios.post(
      WEBHOOK_URL,
      { discordUsername, bountyId, bountyTitle },
      { headers: { "X-Webhook-Secret": WEBHOOK_SECRET } },
    );
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

module.exports = { notifyAssignment };
