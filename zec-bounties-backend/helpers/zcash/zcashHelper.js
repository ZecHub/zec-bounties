const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const path = require("path");

function getWalletDataDir(walletId) {
  if (!walletId) {
    throw new Error("walletId is required");
  }

  return path.join(process.cwd(), "wallets", walletId);
}

/**
 * Fetch the latest Zcash wallet params for a user.
 *
 * @param {string} ownerId
 * @returns {Promise<Object|null>}
 */
async function getLatestZcashParams(ownerId) {
  if (!ownerId) throw new Error("ownerId is required");

  const params = await prisma.zcashParams.findFirst({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    select: {
      walletId: true,
      serverUrl: true,
      chain: true,
      accountName: true,
    },
  });

  if (!params) return null;

  return {
    ...params,
    dataDir: getWalletDataDir(params.walletId),
  };
}

/**
 * Get the server-side verification wallet.
 *
 * This wallet is owned by the application, not a user.
 */
function getVerificationZcashParams() {
  const {
    ZCASH_VERIFICATION_WALLET_PATH,
    ZCASH_VERIFICATION_CHAIN,
    ZCASH_VERIFICATION_SERVER,
  } = process.env;

  if (!ZCASH_VERIFICATION_WALLET_PATH) {
    throw new Error("Verification wallet is not configured");
  }

  return {
    dataDir: ZCASH_VERIFICATION_WALLET_PATH,
    chain: ZCASH_VERIFICATION_CHAIN || "mainnet",
    serverUrl: ZCASH_VERIFICATION_SERVER || "https://zec.rocks:443",
  };
}

/**
 * Get the default Zcash wallet for a user.
 * Falls back to their most recently created wallet.
 *
 * @param {string} ownerId
 * @returns {Promise<Object|null>}
 */
async function getDefaultZcashParams(ownerId) {
  if (!ownerId) throw new Error("ownerId is required");

  let params = await prisma.zcashParams.findFirst({
    where: {
      ownerId,
      isDefault: true,
    },
    select: {
      walletId: true,
      serverUrl: true,
      chain: true,
      accountName: true,
      isDefault: true,
      isTeam: true,
      teamId: true,
    },
  });

  if (!params) {
    params = await prisma.zcashParams.findFirst({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      select: {
        walletId: true,
        serverUrl: true,
        chain: true,
        accountName: true,
        isDefault: true,
        isTeam: true,
        teamId: true,
      },
    });
  }

  if (!params) return null;

  return {
    ...params,
    dataDir: getWalletDataDir(params.walletId),
  };
}

function getSystemWalletParams() {
  const { LOGIN_WALLET_CHAIN, ZCASH_SERVER_URL, LOGIN_WALLET_DATA_DIR } =
    process.env;

  if (!LOGIN_WALLET_CHAIN || !ZCASH_SERVER_URL || !LOGIN_WALLET_DATA_DIR) {
    throw new Error(
      "System wallet not configured: set LOGIN_WALLET_CHAIN, ZCASH_SERVER_URL, LOGIN_WALLET_DATA_DIR",
    );
  }

  return {
    chain: LOGIN_WALLET_CHAIN,
    serverUrl: ZCASH_SERVER_URL,
    dataDir: LOGIN_WALLET_DATA_DIR,
  };
}

module.exports = {
  getLatestZcashParams,
  getDefaultZcashParams,
  getVerificationZcashParams,
  getWalletDataDir,
  getSystemWalletParams,
};
