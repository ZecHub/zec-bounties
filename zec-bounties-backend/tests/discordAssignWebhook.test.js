const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

function loadWebhookWithMock(axiosMock) {
  const targetPath = require.resolve("../utils/discord/discordAssignWebhook");
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

test("notifyAssignment reads env dynamically, trims values, and normalizes FRONTEND_URL", async () => {
  const prevUrl = process.env.DISCORD_BOT_WEBHOOK_URL;
  const prevSecret = process.env.WEBHOOK_SECRET;
  const prevFrontend = process.env.FRONTEND_URL;

  delete process.env.DISCORD_BOT_WEBHOOK_URL;
  delete process.env.WEBHOOK_SECRET;
  delete process.env.FRONTEND_URL;

  const calls = [];
  const { notifyAssignment } = loadWebhookWithMock({
    post: async (url, payload, config) => {
      calls.push({ url, payload, config });
    },
  });

  try {
    // Missing env vars -> skips cleanly
    await notifyAssignment({
      discordUsername: "alice",
      bountyId: "b1",
      bountyTitle: "Fix parser",
    });
    assert.equal(calls.length, 0);

    // Populate env AFTER module import with trailing slashes and surrounding whitespace
    process.env.DISCORD_BOT_WEBHOOK_URL = "  https://bot.example/assign  ";
    process.env.WEBHOOK_SECRET = "  secret-xyz  ";
    process.env.FRONTEND_URL = "https://bounties.zechub.wiki///";

    // Whitespace-only username -> skipped
    await notifyAssignment({
      discordUsername: "   ",
      bountyId: "b1",
      bountyTitle: "Fix parser",
    });
    assert.equal(calls.length, 0);

    // Valid call -> trimmed URL, secret, username, normalized bountyUrl, and timeout set
    await notifyAssignment({
      discordUsername: " alice ",
      bountyId: "b1",
      bountyTitle: "Fix parser",
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://bot.example/assign");
    assert.equal(calls[0].payload.discordUsername, "alice");
    assert.equal(calls[0].payload.bountyUrl, "https://bounties.zechub.wiki/bounty/b1");
    assert.equal(calls[0].config.headers["X-Webhook-Secret"], "secret-xyz");
    assert.ok(calls[0].config.timeout > 0);
  } finally {
    if (prevUrl === undefined) delete process.env.DISCORD_BOT_WEBHOOK_URL;
    else process.env.DISCORD_BOT_WEBHOOK_URL = prevUrl;
    if (prevSecret === undefined) delete process.env.WEBHOOK_SECRET;
    else process.env.WEBHOOK_SECRET = prevSecret;
    if (prevFrontend === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = prevFrontend;
  }
});

test("notifyBountyAssignees skips DB when unconfigured and catches DB errors safely", async () => {
  const prevUrl = process.env.DISCORD_BOT_WEBHOOK_URL;
  const prevSecret = process.env.WEBHOOK_SECRET;
  delete process.env.DISCORD_BOT_WEBHOOK_URL;
  delete process.env.WEBHOOK_SECRET;

  const { notifyBountyAssignees } = loadWebhookWithMock({
    post: async () => ({}),
  });

  let dbCalls = 0;
  const fakePrisma = {
    bounty: {
      findUnique: async () => {
        dbCalls += 1;
        throw new Error("DB unreachable");
      },
    },
  };

  try {
    await notifyBountyAssignees(fakePrisma, "b1");
    assert.equal(dbCalls, 0);

    process.env.DISCORD_BOT_WEBHOOK_URL = "https://bot.example/assign";
    process.env.WEBHOOK_SECRET = "secret-xyz";

    // Must not reject even when Prisma throws
    await assert.doesNotReject(() => notifyBountyAssignees(fakePrisma, "b1"));
    assert.equal(dbCalls, 1);
  } finally {
    if (prevUrl === undefined) delete process.env.DISCORD_BOT_WEBHOOK_URL;
    else process.env.DISCORD_BOT_WEBHOOK_URL = prevUrl;
    if (prevSecret === undefined) delete process.env.WEBHOOK_SECRET;
    else process.env.WEBHOOK_SECRET = prevSecret;
  }
});

test("notifyBountyState posts normalized status payload with timeout", async () => {
  const prevUrl = process.env.DISCORD_BOT_WEBHOOK_URL;
  const prevSecret = process.env.WEBHOOK_SECRET;
  process.env.DISCORD_BOT_WEBHOOK_URL = "https://bot.example/state";
  process.env.WEBHOOK_SECRET = "secret-state";

  const calls = [];
  const { notifyBountyState } = loadWebhookWithMock({
    post: async (url, payload, config) => {
      calls.push({ url, payload, config });
    },
  });

  const fakePrisma = {
    bounty: {
      findUnique: async () => ({
        status: "DONE",
        isPaid: true,
        assignees: [
          { userId: "u1", user: { discordUsername: "alice" } },
          { userId: "u2", user: {} },
        ],
      }),
    },
  };

  try {
    await notifyBountyState(fakePrisma, "b99");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://bot.example/state");
    assert.deepEqual(calls[0].payload, {
      event: "bounty_state",
      bountyId: "b99",
      status: "DONE",
      isPaid: true,
      assignees: [
        { userId: "u1", discordUsername: "alice" },
        { userId: "u2", discordUsername: null },
      ],
    });
    assert.equal(calls[0].config.headers["X-Webhook-Secret"], "secret-state");
    assert.ok(calls[0].config.timeout > 0);
  } finally {
    if (prevUrl === undefined) delete process.env.DISCORD_BOT_WEBHOOK_URL;
    else process.env.DISCORD_BOT_WEBHOOK_URL = prevUrl;
    if (prevSecret === undefined) delete process.env.WEBHOOK_SECRET;
    else process.env.WEBHOOK_SECRET = prevSecret;
  }
});
