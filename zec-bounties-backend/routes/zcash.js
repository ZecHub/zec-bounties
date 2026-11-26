const express = require("express");
const axios = require("axios");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const prisma = require("../prisma/client");
const { authenticate, isAdmin } = require("../middleware/auth");
const { initZcashOnce } = require("../zcash/init");
const { zcashParams } = require("../prisma/client");
const executeZingoCliSeed = require("../utils/zingo/zingoLibSeed");
const {
  getWalletDataDir,
  getDefaultZcashParams,
} = require("../helpers/zcash/zcashHelper.js");
const executeZingoCliInfo = require("../utils/zingo/zingoLibInfo");
const {
  validateWalletConnection,
} = require("../helpers/zcash/walletConnection");

const { sendToUser } = require("../middleware/websocket");

const router = express.Router();

// ---------------------------------------------------------------------------
// Helper — look up a non-team wallet by (ownerId, accountName).
// SQLite does NOT treat two NULLs as equal in a unique index, so Prisma's
// findUnique with teamId:null throws. We use findFirst with an explicit
// `teamId: null` filter instead, then do all writes via the record's PK.
// ---------------------------------------------------------------------------
function findUserWallet(ownerId, accountName) {
  return prisma.zcashParams.findFirst({
    where: { ownerId, accountName, teamId: null },
  });
}

function findTeamWallet(ownerId, accountName) {
  return prisma.zcashParams.findFirst({
    where: { ownerId, accountName },
  });
}

// ---------------------------------------------------------------------------
// Resource guards for import-wallet. Each successful import spawns a zingo-cli
// seed-restore process and allocates a wallet data directory. Without bounds,
// an authenticated caller can exhaust CPU/memory/fds/disk by firing imports in
// a loop or in parallel (the role gate is TEAM, which is self-selectable), so
// the endpoint caps concurrency per-user and globally, plus total wallets held.
// ---------------------------------------------------------------------------
const MAX_CONCURRENT_IMPORTS = 3; // global cap on simultaneous restores
const MAX_WALLETS_PER_USER = 25; // cap on total wallets a single user can hold
let activeImports = 0; // global in-flight restore count
const importingUsers = new Set(); // userIds with an import currently in flight

/**
 * POST /api/zcash/import-wallet
 * Import a wallet using seed phrase (seed phrase is never stored)
 * Protected route - requires authentication
 */
router.post("/import-wallet", authenticate, async (req, res) => {
  let acquired = false;
  try {
    // Only ADMIN and TEAM roles are allowed.
    if (!["ADMIN", "TEAM"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: Only ADMIN and TEAM roles can import wallets.",
      });
    }

    const { accountName, seedPhrase, chain, serverUrl, birthdayHeight } =
      req.body;
    const userId = req.user.id;

    // Validation
    if (!accountName || !seedPhrase) {
      return res.status(400).json({
        success: false,
        message: "Account name and seed phrase are required",
      });
    }

    // Validate seed phrase format (24 words)
    const words =
      typeof seedPhrase === "string" ? seedPhrase.trim().split(/\s+/) : [];
    if (words.length !== 24) {
      return res.status(400).json({
        success: false,
        message: "Invalid seed phrase. Must be 24 words.",
      });
    }

    const connectionError = validateWalletConnection({
      chain: chain || "mainnet",
      serverUrl: serverUrl || "https://zec.rocks:443",
    });
    if (connectionError) {
      return res.status(400).json({ success: false, message: connectionError });
    }

    // Reserve a slot BEFORE any await so a burst of parallel requests cannot
    // all pass the check before the counters move. One in-flight import per
    // user, and a global cap on concurrent zingo-cli restores.
    if (importingUsers.has(userId)) {
      return res.status(429).json({
        success: false,
        message: "An import is already in progress for your account. Please wait for it to finish.",
      });
    }
    if (activeImports >= MAX_CONCURRENT_IMPORTS) {
      return res.status(503).json({
        success: false,
        message: "The server is busy importing wallets. Please try again shortly.",
      });
    }
    importingUsers.add(userId);
    activeImports++;
    acquired = true;

    // Cap total wallets per user to bound slow, serial accumulation of data
    // directories (each import allocates one).
    const walletCount = await prisma.zcashParams.count({
      where: { ownerId: userId },
    });
    if (walletCount >= MAX_WALLETS_PER_USER) {
      return res.status(429).json({
        success: false,
        message: `Wallet limit reached (${MAX_WALLETS_PER_USER}). Delete an existing wallet before importing another.`,
      });
    }

    // Check if account already exists for this user
    const existing = await findUserWallet(userId, accountName);

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `You already have a Zcash account named: ${accountName}`,
      });
    }

    // Create Zcash params entry (without storing seed phrase)
    const params = await prisma.zcashParams.create({
      data: {
        chain: chain || "mainnet",
        serverUrl: serverUrl || "https://zec.rocks:443",
        accountName,
        ownerId: userId,
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Initialize Zcash wallet with seed phrase
    // NOTE: The seed phrase is passed to initZcashOnce but NOT stored
    try {
      await initZcashOnce(userId, accountName, chain);
    } catch (initError) {
      // If initialization fails, delete the params entry via PK
      await prisma.zcashParams.delete({ where: { id: params.id } });

      console.error("Error initializing wallet:", initError);
      return res.status(500).json({
        success: false,
        message: "Failed to initialize wallet",
        error: initError.message,
      });
    }

    const zingoParams = {
      ...params,
      dataDir: getWalletDataDir(params.walletId),
    };

    try {
      await executeZingoCliSeed(zingoParams, seedPhrase, birthdayHeight);
    } catch (seedError) {
      // If the restore fails, remove the wallet again (same steps as
      // DELETE /params/:accountName) so the name can be reused on retry
      invalidateZingo({
        chain: params.chain || "mainnet",
        serverUrl: params.serverUrl || "http://127.0.0.1:8137",
        dataDir: zingoParams.dataDir,
      });
      await fs.rm(zingoParams.dataDir, { recursive: true, force: true });
      await prisma.zcashParams.delete({ where: { id: params.id } });

      console.error("Error restoring wallet from seed:", seedError);
      return res.status(500).json({
        success: false,
        message: "Failed to restore wallet from seed phrase",
        error: seedError.message,
      });
    }

    await prisma.$transaction(
      async (tx) => {
        await tx.zcashParams.updateMany({
          where: { ownerId: userId, isDefault: true },
          data: { isDefault: false },
        });
        await tx.zcashParams.update({
          where: { id: params.id },
          data: { isDefault: true },
        });
      },
      { timeout: 10000 },
    );

    // Re-fetch params so the response includes isDefault: true
    const updatedParams = await prisma.zcashParams.findUnique({
      where: { id: params.id },
      include: { owner: { select: { id: true, name: true, email: true } } },
    });

    res.status(201).json({
      success: true,
      message: "Wallet imported successfully. Syncing in progress...",
      data: updatedParams,
    });
  } catch (error) {
    console.error("Error importing wallet:", error);
    res.status(500).json({
      success: false,
      message: "Failed to import wallet",
      error: error.message,
    });
  } finally {
    // Release the reserved slot on every path once it was acquired.
    if (acquired) {
      activeImports--;
      importingUsers.delete(req.user.id);
    }
  }
});

/**
 * GET /api/zcash/params
 * Get all Zcash parameters for the authenticated user
 * Protected route - requires authentication
 */
/**
 * GET /api/zcash/params
 * Get all Zcash parameters for the authenticated user
 * Includes params owned by the user AND params belonging to teams the user is part of
 * Protected route - requires authentication
 */
router.get("/params", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const params = await prisma.zcashParams.findMany({
      where: { ownerId: userId },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({
      success: true,
      data: params,
    });
  } catch (error) {
    console.error("Error fetching Zcash params:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch Zcash parameters",
      error: error.message,
    });
  }
});

/**
 * GET /api/zcash/params/all
 * Get all Zcash parameters (admin only)
 * Protected route - requires admin authentication
 */
router.get("/params/all", authenticate, isAdmin, async (req, res) => {
  try {
    const params = await prisma.zcashParams.findMany({
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({
      success: true,
      data: params,
    });
  } catch (error) {
    console.error("Error fetching Zcash params:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch Zcash parameters",
      error: error.message,
    });
  }
});

/**
 * GET /api/zcash/params/:accountName
 * Get Zcash parameters by account name for the authenticated user
 * Protected route - requires authentication
 */
router.get("/params/:accountName", authenticate, async (req, res) => {
  try {
    const { accountName } = req.params;
    const userId = req.user.id;

    const params = await prisma.zcashParams.findFirst({
      where: { ownerId: userId, accountName },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!params) {
      return res.status(404).json({
        success: false,
        message: `Zcash parameters not found for account: ${accountName}`,
      });
    }

    res.json({
      success: true,
      data: params,
    });
  } catch (error) {
    console.error("Error fetching Zcash params:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch Zcash parameters",
      error: error.message,
    });
  }
});

/**
 * POST /api/zcash/params
 * Create new Zcash parameters for the authenticated user
 * Protected route - requires authentication
 */
router.post("/params", authenticate, async (req, res) => {
  try {
    const { chain, serverUrl, accountName } = req.body;
    const userId = req.user.id;

    // Validation
    if (!accountName) {
      return res.status(400).json({
        success: false,
        message: "Account name is required",
      });
    }

    const connectionError = validateWalletConnection({
      chain: chain || "mainnet",
      serverUrl: serverUrl || "https://zec.rocks:443",
    });
    if (connectionError) {
      return res.status(400).json({ success: false, message: connectionError });
    }

    // Check if account already exists for this user
    const existing = await findUserWallet(userId, accountName);

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `You already have a Zcash account named: ${accountName}`,
      });
    }

    // Create new parameters
    const params = await prisma.zcashParams.create({
      data: {
        chain: chain || "mainnet",
        serverUrl: serverUrl || "https://zec.rocks:443",
        accountName,
        ownerId: userId,
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: "Zcash parameters created successfully",
      data: params,
    });
  } catch (error) {
    console.error("Error creating Zcash params:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create Zcash parameters",
      error: error.message,
    });
  }
});

/**
 * PUT /api/zcash/params/:accountName
 * Update existing Zcash parameters for the authenticated user
 * Protected route - requires authentication
 */
router.put("/params/:accountName", authenticate, async (req, res) => {
  try {
    const { accountName } = req.params;
    const { chain, serverUrl, accountName: newAccountName } = req.body;
    const userId = req.user.id;

    const connectionError = validateWalletConnection({ chain, serverUrl });
    if (connectionError) {
      return res.status(400).json({ success: false, message: connectionError });
    }

    // Check if parameters exist for this user
    const existing = await findUserWallet(userId, accountName);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: `Zcash parameters not found for account: ${accountName}`,
      });
    }

    // If changing account name, check if new name already exists for this user
    if (newAccountName && newAccountName !== accountName) {
      const nameExists = await findUserWallet(userId, newAccountName);

      if (nameExists) {
        return res.status(409).json({
          success: false,
          message: `You already have an account named '${newAccountName}'`,
        });
      }
    }

    // Build update data object
    const updateData = {};
    if (chain !== undefined) updateData.chain = chain;
    if (serverUrl !== undefined) updateData.serverUrl = serverUrl;
    if (newAccountName !== undefined) updateData.accountName = newAccountName;

    // Update via PK to avoid null compound key issue
    const params = await prisma.zcashParams.update({
      where: { id: existing.id },
      data: updateData,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    res.json({
      success: true,
      message: "Zcash parameters updated successfully",
      data: params,
    });
  } catch (error) {
    console.error("Error updating Zcash params:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update Zcash parameters",
      error: error.message,
    });
  }
});

/**
 * PATCH /api/zcash/params/:accountName
 * Partially update Zcash parameters for the authenticated user
 * Protected route - requires authentication
 */
router.patch("/params/:accountName", authenticate, async (req, res) => {
  try {
    const { accountName } = req.params;
    const updates = req.body;
    const userId = req.user.id;

    // Check if parameters exist for this user
    const existing = await findUserWallet(userId, accountName);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: `Zcash parameters not found for account: ${accountName}`,
      });
    }

    // Filter only allowed fields
    const allowedFields = ["chain", "serverUrl", "accountName"];
    const updateData = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields to update",
      });
    }

    const connectionError = validateWalletConnection(updateData);
    if (connectionError) {
      return res.status(400).json({ success: false, message: connectionError });
    }

    // If changing account name, check if new name already exists for this user
    if (updateData.accountName && updateData.accountName !== accountName) {
      const nameExists = await findUserWallet(userId, updateData.accountName);

      if (nameExists) {
        return res.status(409).json({
          success: false,
          message: `You already have an account named '${updateData.accountName}'`,
        });
      }
    }

    // Update via PK to avoid null compound key issue
    const params = await prisma.zcashParams.update({
      where: { id: existing.id },
      data: updateData,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
    await initZcashOnce(req.user.id, params.accountName);

    res.json({
      success: true,
      message: "Zcash parameters updated successfully",
      data: params,
    });
  } catch (error) {
    console.error("Error updating Zcash params:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update Zcash parameters",
      error: error.message,
    });
  }
});

/**
 * DELETE /api/zcash/params/:accountName
 * Delete Zcash parameters for the authenticated user
 * Protected route - requires authentication
 */
const { promises: fs } = require("fs");
const path = require("path");
const { invalidateZingo } = require("../utils/zingo/getZingo");

router.delete("/params/:accountName", authenticate, async (req, res) => {
  try {
    const { accountName } = req.params;
    const userId = req.user.id;

    const existing =
      (await findUserWallet(userId, accountName)) ??
      (await findTeamWallet(userId, accountName));

    console.log("exi", existing);

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: `Zcash parameters not found for account: ${accountName}`,
      });
    }

    // A team wallet copy shares the team's wallet directory. Deleting it goes
    // through DELETE /api/teams/:teamId/wallet, which also clears every
    // member's copy.
    if (existing.teamId) {
      return res.status(403).json({
        success: false,
        message: "The team owner can delete a team wallet from the team page",
      });
    }

    const chain = existing.chain || "mainnet";
    const serverUrl = existing.serverUrl || "http://127.0.0.1:8137";
    const dataDir = getWalletDataDir(existing.walletId);

    invalidateZingo({ chain, serverUrl, dataDir });

    await fs.rm(dataDir, { recursive: true, force: true });

    await prisma.zcashParams.delete({ where: { id: existing.id } });

    res.json({
      success: true,
      message: "Zcash parameters and wallet deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting Zcash params:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete Zcash parameters",
      error: error.message,
    });
  }
});

router.patch(
  "/params/:accountName/set-default",
  authenticate,
  isAdmin,
  async (req, res) => {
    try {
      const { accountName } = req.params;
      const userId = req.user.id;
      const { teamId } = req.body;

      const existing = teamId
        ? await prisma.zcashParams.findFirst({ where: { accountName, teamId } })
        : await prisma.zcashParams.findFirst({
            where: { accountName, ownerId: userId, teamId: null },
          });

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: `Zcash parameters not found for account: ${accountName}`,
        });
      }

      const updated = await prisma.$transaction(
        async (tx) => {
          const currentDefault = await tx.zcashParams.findFirst({
            where: { isDefault: true, ownerId: userId },
          });

          if (currentDefault) {
            await tx.zcashParams.update({
              where: { id: currentDefault.id },
              data: { isDefault: false },
            });
          }

          return tx.zcashParams.update({
            where: { id: existing.id },
            data: { isDefault: true },
          });
        },
        { timeout: 10000 },
      );

      sendToUser(userId, "default_wallet_updated", updated);

      res.json({ success: true, data: updated });
    } catch (error) {
      console.error("Error setting default wallet:", error);
      res.status(500).json({ error: "Failed to set default wallet" });
    }
  },
);

/**
 * POST /api/zcash/params/upsert
 * Create or update Zcash parameters (upsert operation) for the authenticated user
 * Protected route - requires authentication
 */
router.post("/params/upsert", authenticate, async (req, res) => {
  try {
    const { chain, serverUrl, accountName } = req.body;
    const userId = req.user.id;

    // Validation
    if (!accountName) {
      return res.status(400).json({
        success: false,
        message: "Account name is required",
      });
    }

    // Prisma's upsert requires a unique key — since teamId:null breaks the
    // compound key in SQLite, we do a manual find-then-create-or-update.
    const existing = await findUserWallet(userId, accountName);

    const connectionError = validateWalletConnection(
      existing
        ? { chain, serverUrl }
        : {
            chain: chain || "mainnet",
            serverUrl: serverUrl || "https://zec.rocks:443",
          },
    );
    if (connectionError) {
      return res.status(400).json({ success: false, message: connectionError });
    }

    let params;
    if (existing) {
      params = await prisma.zcashParams.update({
        where: { id: existing.id },
        data: {
          ...(chain !== undefined && { chain }),
          ...(serverUrl !== undefined && { serverUrl }),
        },
        include: { owner: { select: { id: true, name: true, email: true } } },
      });
    } else {
      params = await prisma.zcashParams.create({
        data: {
          chain: chain || "mainnet",
          serverUrl: serverUrl || "https://zec.rocks:443",
          accountName,
          ownerId: userId,
        },
        include: { owner: { select: { id: true, name: true, email: true } } },
      });
    }

    res.json({
      success: true,
      message: "Zcash parameters saved successfully",
      data: params,
    });
  } catch (error) {
    console.error("Error upserting Zcash params:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save Zcash parameters",
      error: error.message,
    });
  }
});

/**
 * POST /api/zcash/test-connection/:accountName
 * Test connection to Zcash server for the authenticated user's account
 * Protected route - requires authentication
 */
router.post("/test-connection/:accountName", authenticate, async (req, res) => {
  try {
    const { accountName } = req.params;
    const userId = req.user.id;

    // Get parameters for this user
    const params = await findUserWallet(userId, accountName);

    if (!params) {
      return res.status(404).json({
        success: false,
        message: `Zcash parameters not found for account: ${accountName}`,
      });
    }

    const info = await executeZingoCliInfo("info", params);

    res.json(info);
  } catch (error) {
    console.error("Error testing connection:", error);
    res.status(500).json({
      success: false,
      message: "Failed to test connection",
      error: error.message,
    });
  }
});

router.get("/info", authenticate, isAdmin, async (req, res) => {
  try {
    let params = await getDefaultZcashParams(req.user.id);

    if (!params) {
      await initZcashOnce(req.user.id, "Main");

      params = await getDefaultZcashParams(req.user.id);
    }

    if (!params) {
      return res.status(404).json({
        success: false,
        message: "No Zcash wallet available",
      });
    }

    const info = await executeZingoCliInfo("info", params);

    res.json(info);
  } catch (error) {
    console.error("Error getting Zcash info:", error);

    res.status(500).json({
      success: false,
      message: "Failed to get Zcash information",
      error: error.message,
    });
  }
});

// Error handling middleware for this router
router.use((error, req, res, next) => {
  console.error("Zcash route error:", error);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: error.message,
  });
});

module.exports = router;
