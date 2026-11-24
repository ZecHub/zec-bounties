const axios = require("axios");

const DISCORD_API = "https://discord.com/api/v10";

function getBotHeaders() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return null;
  return {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json",
  };
}

async function notifyNewBounty(bounty) {
  if (!bounty || bounty.suggestionReviewStatus === "PENDING") return;
  const webhookUrl = process.env.DISCORD_NOTIFY_WEBHOOK_URL;
  if (!webhookUrl) return;
  const title =
    typeof bounty.title === "string" && bounty.title.trim()
      ? bounty.title.trim()
      : "Untitled Bounty";
  const amount =
    bounty.bountyAmount !== undefined && bounty.bountyAmount !== null
      ? `${bounty.bountyAmount} ZEC`
      : "N/A";
  const difficulty =
    typeof bounty.difficulty === "string" && bounty.difficulty.trim()
      ? bounty.difficulty.trim()
      : "N/A";
  try {
    await axios.post(webhookUrl, {
      embeds: [
        {
          title: `🆕 ${title}`.slice(0, 256),
          description:
            typeof bounty.description === "string"
              ? bounty.description.slice(0, 200)
              : undefined,
          fields: [
            {
              name: "Reward",
              value: amount,
              inline: true,
            },
            { name: "Difficulty", value: difficulty, inline: true },
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
  const botHeaders = getBotHeaders();
  if (!botHeaders || !threadId) return;

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
  const botHeaders = getBotHeaders();
  const bountyChannelId = process.env.DISCORD_BOUNTY_CHANNEL_ID;
  if (!botHeaders || !bountyChannelId) return null;

  const title =
    typeof bounty?.title === "string" && bounty.title.trim()
      ? bounty.title.trim()
      : "untitled";

  let thread;
  try {
    ({ data: thread } = await axios.post(
      `${DISCORD_API}/channels/${bountyChannelId}/threads`,
      {
        name: `bounty-${title.slice(0, 50)}`,
        type: 12, // GUILD_PRIVATE_THREAD
        invitable: false,
      },
      { headers: botHeaders },
    ));
  } catch (err) {
    console.error(
      "Failed to create bounty thread:",
      err.response?.data || err.message,
    );
    return null;
  }

  await addMembersToThread(thread.id, participantDiscordIds);

  try {
    await axios.post(
      `${DISCORD_API}/channels/${thread.id}/messages`,
      { content: `Private thread for **${title}**. Coordinate here.` },
      { headers: botHeaders },
    );
  } catch (err) {
    console.error(
      `Failed to post welcome message to thread ${thread.id}:`,
      err.response?.data || err.message,
    );
  }

  return thread.id;
}

module.exports = { notifyNewBounty, createBountyThread, addMembersToThread };
