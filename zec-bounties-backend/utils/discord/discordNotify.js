const axios = require("axios");

const DISCORD_API = "https://discord.com/api/v10";
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const BOUNTY_CHANNEL_ID = process.env.DISCORD_BOUNTY_CHANNEL_ID;
const NOTIFY_WEBHOOK_URL = process.env.DISCORD_NOTIFY_WEBHOOK_URL;

const botHeaders = {
  Authorization: `Bot ${BOT_TOKEN}`,
  "Content-Type": "application/json",
};

async function notifyNewBounty(bounty) {
  if (!NOTIFY_WEBHOOK_URL) return;
  try {
    await axios.post(NOTIFY_WEBHOOK_URL, {
      embeds: [
        {
          title: `🆕 ${bounty.title}`,
          description: bounty.description?.slice(0, 200),
          fields: [
            {
              name: "Reward",
              value: `${bounty.bountyAmount} ZEC`,
              inline: true,
            },
            { name: "Difficulty", value: bounty.difficulty, inline: true },
          ],
        },
      ],
    });
  } catch (err) {
    console.error(
      "Discord webhook notify failed:",
      err.response?.data || err.message,
    );
  }
}

// Adds Discord user IDs to an existing thread. Each add is caught
// individually — a user who's never joined the guild (see caveat below)
// shouldn't block the rest of the roster from being added.
async function addMembersToThread(threadId, discordIds) {
  const validIds = [...new Set((discordIds || []).filter(Boolean))];
  await Promise.all(
    validIds.map((discordId) =>
      axios
        .put(
          `${DISCORD_API}/channels/${threadId}/thread-members/${discordId}`,
          {},
          { headers: botHeaders },
        )
        .catch((err) =>
          console.error(
            `Failed to add ${discordId} to thread ${threadId}:`,
            err.response?.data || err.message,
          ),
        ),
    ),
  );
}

// Creates a new private thread and seeds it with the given participants.
// Returns the thread ID (to be persisted on the bounty) or null on failure.
async function createBountyThread(bounty, participantDiscordIds) {
  if (!BOT_TOKEN || !BOUNTY_CHANNEL_ID) return null;

  try {
    const { data: thread } = await axios.post(
      `${DISCORD_API}/channels/${BOUNTY_CHANNEL_ID}/threads`,
      {
        name: `bounty-${bounty.title.slice(0, 50)}`,
        type: 12, // GUILD_PRIVATE_THREAD
        invitable: false,
      },
      { headers: botHeaders },
    );

    await addMembersToThread(thread.id, participantDiscordIds);

    await axios.post(
      `${DISCORD_API}/channels/${thread.id}/messages`,
      { content: `Private thread for **${bounty.title}**. Coordinate here.` },
      { headers: botHeaders },
    );

    return thread.id;
  } catch (err) {
    console.error(
      "Failed to create bounty thread:",
      err.response?.data || err.message,
    );
    return null;
  }
}

module.exports = { notifyNewBounty, createBountyThread, addMembersToThread };
