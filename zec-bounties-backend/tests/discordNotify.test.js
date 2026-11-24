const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

function loadDiscordNotifyWithMock(axiosMock) {
  const targetPath = require.resolve("../utils/discord/discordNotify");
  delete require.cache[targetPath];

  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "axios") {
      return axiosMock;
    }
    return origLoad.apply(this, arguments);
  };

  try {
    return require(targetPath);
  } finally {
    Module._load = origLoad;
  }
}

test("addMembersToThread skips HTTP calls when bot token or threadId is missing", async () => {
  const putCalls = [];
  const prevToken = process.env.DISCORD_BOT_TOKEN;
  delete process.env.DISCORD_BOT_TOKEN;

  const { addMembersToThread } = loadDiscordNotifyWithMock({
    put: async (...args) => putCalls.push(args),
    post: async () => ({ data: {} }),
  });

  try {
    await addMembersToThread("thread-1", ["u1", "u2"]);
    assert.equal(putCalls.length, 0);

    process.env.DISCORD_BOT_TOKEN = "tok-123";
    await addMembersToThread("", ["u1"]);
    assert.equal(putCalls.length, 0);

    await addMembersToThread("thread-1", ["u1", null, "u1", "u2"]);
    assert.equal(putCalls.length, 2);
    assert.equal(putCalls[0][2].headers.Authorization, "Bot tok-123");
  } finally {
    if (prevToken === undefined) delete process.env.DISCORD_BOT_TOKEN;
    else process.env.DISCORD_BOT_TOKEN = prevToken;
  }
});

test("createBountyThread returns thread id even if welcome message fails", async () => {
  const prevToken = process.env.DISCORD_BOT_TOKEN;
  const prevChan = process.env.DISCORD_BOUNTY_CHANNEL_ID;
  process.env.DISCORD_BOT_TOKEN = "bot-secret";
  process.env.DISCORD_BOUNTY_CHANNEL_ID = "chan-42";

  const posts = [];
  const { createBountyThread } = loadDiscordNotifyWithMock({
    put: async () => ({}),
    post: async (url, body) => {
      posts.push({ url, body });
      if (url.endsWith("/threads")) {
        return { data: { id: "thread-999" } };
      }
      throw new Error("Discord message rate-limited");
    },
  });

  try {
    const threadId = await createBountyThread({ title: "Fix RPC parser" }, ["u1"]);
    assert.equal(threadId, "thread-999");
    assert.equal(posts.length, 2);
    assert.equal(posts[0].body.name, "bounty-Fix RPC parser");
  } finally {
    if (prevToken === undefined) delete process.env.DISCORD_BOT_TOKEN;
    else process.env.DISCORD_BOT_TOKEN = prevToken;
    if (prevChan === undefined) delete process.env.DISCORD_BOUNTY_CHANNEL_ID;
    else process.env.DISCORD_BOUNTY_CHANNEL_ID = prevChan;
  }
});

test("notifyNewBounty sanitizes missing difficulty/amount and caps title to 256 chars", async () => {
  const prevWebhook = process.env.DISCORD_NOTIFY_WEBHOOK_URL;
  process.env.DISCORD_NOTIFY_WEBHOOK_URL = "https://discord.example/webhook";

  const sent = [];
  const { notifyNewBounty } = loadDiscordNotifyWithMock({
    post: async (url, payload) => {
      sent.push({ url, payload });
    },
    put: async () => ({}),
  });

  try {
    await notifyNewBounty({ title: "Pending", suggestionReviewStatus: "PENDING" });
    assert.equal(sent.length, 0);

    await notifyNewBounty({
      title: "A".repeat(300),
      description: "Desc",
      bountyAmount: 5,
      difficulty: undefined,
    });
    assert.equal(sent.length, 1);
    const embed = sent[0].payload.embeds[0];
    assert.ok(embed.title.length <= 256);
    assert.equal(embed.fields[0].value, "5 ZEC");
    assert.equal(embed.fields[1].value, "N/A");
  } finally {
    if (prevWebhook === undefined) delete process.env.DISCORD_NOTIFY_WEBHOOK_URL;
    else process.env.DISCORD_NOTIFY_WEBHOOK_URL = prevWebhook;
  }
});
