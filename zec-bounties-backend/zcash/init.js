const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Wallet directory
// ---------------------------------------------------------------------------

/**
 * Returns the filesystem directory for a wallet.
 *
 * All wallets now use:
 *
 *   wallets/<walletId>/
 *
 * The walletId is stored in zcashParams and is the canonical filesystem
 * identifier for the wallet.
 */
function getWalletDataDir(walletId) {
  if (!walletId) {
    throw new Error("walletId is required");
  }

  return path.join(process.cwd(), "wallets", walletId);
}

// ---------------------------------------------------------------------------
// Individual wallet initialization
// ---------------------------------------------------------------------------

/**
 * Initializes a Zcash account for a given owner.
 * Creates both the DB record and the wallet directory if they don't exist.
 * Idempotent — safe to call multiple times.
 *
 * @param {string} ownerId
 * @param {string} [accountName="Main"]
 * @param {string} [chain="mainnet"]  - "mainnet" or "testnet"
 * @param {string|null} [teamId=null] - Optional team ID
 * @returns {Promise<object>} The zcashParams DB record
 */
async function initZcashOnce(
  ownerId,
  accountName = "Main",
  chain = "mainnet",
  teamId = null,
) {
  if (!ownerId) throw new Error("ownerId is required");

  // SQLite does not treat NULLs as equal in unique indexes, so use
  // findFirst instead of findUnique for this lookup.
  const existing = await prisma.zcashParams.findFirst({
    where: {
      ownerId,
      accountName,
      teamId,
    },
  });

  if (existing) {
    // Existing wallet: use its persisted walletId.
    const walletDir = getWalletDataDir(existing.walletId);

    fs.mkdirSync(walletDir, { recursive: true });

    console.log(`✅ Zcash already initialized for account "${accountName}"`);
    console.log(`   walletId: ${existing.walletId}`);
    console.log(`   dataDir: ${walletDir}`);

    return existing;
  }

  // New wallet gets its own unique filesystem identity.
  const walletId = crypto.randomUUID();
  const walletDir = getWalletDataDir(walletId);

  fs.mkdirSync(walletDir, { recursive: true });

  console.log(`🚀 Initializing Zcash for account "${accountName}"`);
  console.log(`   walletId: ${walletId}`);
  console.log(`   dataDir: ${walletDir}`);

  try {
    const params = await prisma.zcashParams.create({
      data: {
        walletId,
        ownerId,
        accountName,
        chain,
        ...(teamId && {
          teamId,
          isTeam: true,
        }),
      },
    });

    console.log(`✅ Zcash initialization complete for "${accountName}"`);

    return params;
  } catch (err) {
    if (err.code === "P2002") {
      console.log(
        `⚠️ Race condition handled for "${accountName}", fetching existing record`,
      );

      const existing = await prisma.zcashParams.findFirst({
        where: {
          ownerId,
          accountName,
          teamId,
        },
      });

      if (!existing) {
        throw err;
      }

      // Make sure the persisted wallet directory exists.
      const walletDir = getWalletDataDir(existing.walletId);
      fs.mkdirSync(walletDir, { recursive: true });

      return existing;
    }

    throw err;
  }
}

// ---------------------------------------------------------------------------
// Team wallet initialization
// ---------------------------------------------------------------------------

/**
 * Initializes a Zcash account for a given team.
 * Creates both the DB record and the wallet directory if they don't exist.
 * Idempotent — safe to call multiple times.
 *
 * Team wallets use the exact same walletId filesystem structure:
 *
 *   wallets/<walletId>/
 *
 * @param {string} teamId
 * @param {string} [accountName="Main"]
 * @param {string} [chain="mainnet"]  - "mainnet" or "testnet"
 * @returns {Promise<object>} The zcashParams DB record
 */
async function initZcashOnceForTeams(
  teamId,
  accountName = "Main",
  chain = "mainnet",
) {
  if (!teamId) throw new Error("teamId is required");

  const existing = await prisma.zcashParams.findFirst({
    where: {
      ownerId: teamId,
      accountName,
      teamId,
    },
  });

  if (existing) {
    const walletDir = getWalletDataDir(existing.walletId);

    fs.mkdirSync(walletDir, { recursive: true });

    console.log(
      `✅ Zcash already initialized for team account "${accountName}"`,
    );
    console.log(`   walletId: ${existing.walletId}`);
    console.log(`   dataDir: ${walletDir}`);

    return existing;
  }

  const walletId = crypto.randomUUID();
  const walletDir = getWalletDataDir(walletId);

  fs.mkdirSync(walletDir, { recursive: true });

  console.log(`🚀 Initializing Zcash wallet for team account "${accountName}"`);
  console.log(`   walletId: ${walletId}`);
  console.log(`   dataDir: ${walletDir}`);

  try {
    const params = await prisma.zcashParams.create({
      data: {
        walletId,
        ownerId: teamId,
        accountName,
        chain,
        isTeam: true,
        teamId,
      },
    });

    console.log(`✅ Zcash initialization complete for team "${accountName}"`);

    return params;
  } catch (err) {
    if (err.code === "P2002") {
      console.log(
        `⚠️ Race condition handled for team "${accountName}", fetching existing record`,
      );

      const existing = await prisma.zcashParams.findFirst({
        where: {
          ownerId: teamId,
          accountName,
          teamId,
        },
      });

      if (!existing) {
        throw err;
      }

      const walletDir = getWalletDataDir(existing.walletId);
      fs.mkdirSync(walletDir, { recursive: true });

      return existing;
    }

    throw err;
  }
}

module.exports = {
  initZcashOnce,
  initZcashOnceForTeams,
  getWalletDataDir,
};
