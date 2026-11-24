const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const path = require("path");

function getWalletDataDir(walletId) {
  if (typeof walletId !== "string" || !walletId.trim()) {
    throw new Error("walletId is required");
  }

  const trimmed = walletId.trim();
  if (
    trimmed === "." ||
    trimmed === ".." ||
    trimmed.includes("\0") ||
    trimmed.includes("/") ||
    trimmed.includes("\\")
  ) {
    throw new Error("Invalid walletId");
  }

  const walletsRoot = path.resolve(process.cwd(), "wallets");
  const resolved = path.resolve(walletsRoot, trimmed);
  const rel = path.relative(walletsRoot, resolved);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Invalid walletId");
  }

  return path.join(process.cwd(), "wallets", trimmed);
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
  const dataDir = process.env.ZCASH_VERIFICATION_WALLET_PATH?.trim();
  const chain = process.env.ZCASH_VERIFICATION_CHAIN?.trim();
  const serverUrl = process.env.ZCASH_VERIFICATION_SERVER?.trim();

  if (!dataDir) {
    throw new Error("Verification wallet is not configured");
  }

  return {
    dataDir,
    chain: chain || "mainnet",
    serverUrl: serverUrl || "https://zec.rocks:443",
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
  const chain = process.env.LOGIN_WALLET_CHAIN?.trim();
  const serverUrl = process.env.ZCASH_SERVER_URL?.trim();
  const dataDir = process.env.LOGIN_WALLET_DATA_DIR?.trim();

  if (!chain || !serverUrl || !dataDir) {
    throw new Error(
      "System wallet not configured: set LOGIN_WALLET_CHAIN, ZCASH_SERVER_URL, LOGIN_WALLET_DATA_DIR",
    );
  }

  return {
    chain,
    serverUrl,
    dataDir,
  };
}

module.exports = {
  getLatestZcashParams,
  getDefaultZcashParams,
  getVerificationZcashParams,
  getWalletDataDir,
  getSystemWalletParams,
};
