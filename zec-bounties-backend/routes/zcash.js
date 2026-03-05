const express = require("express");
const axios = require("axios");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const { authenticate, isAdmin } = require("../middleware/auth");
const { initZcashOnce } = require("../zcash/init");
const { zcashParams } = require("../prisma/client");
const executeZingoCliSeed = require("../utils/zingoLibSeed");
const { getLatestZcashParams } = require("../helpers/zcash/zcashHelper.js");

const { sendRealtimeUpdate } = require("../middleware/websocket");

const router = express.Router();
const prisma = new PrismaClient();

/**
 * POST /api/zcash/import-wallet
 * Import a wallet using seed phrase (seed phrase is never stored)
 * Protected route - requires authentication
 */
router.post("/import-wallet", authenticate, async (req, res) => {
  try {
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
    const words = seedPhrase.trim().split(/\s+/);
    if (words.length !== 24) {
      return res.status(400).json({
        success: false,
        message: "Invalid seed phrase. Must be 24 words.",
      });
    }

    // Check if account already exists for this user
    const existing = await prisma.zcashParams.findUnique({
      where: {
        ownerId_accountName: {
          ownerId: userId,
          accountName: accountName,
        },
      },
    });

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
      // If initialization fails, delete the params entry
      await prisma.zcashParams.delete({
        where: {
          ownerId_accountName: {
            ownerId: userId,
            accountName: accountName,
          },
        },
      });

      console.error("Error initializing wallet:", initError);
      return res.status(500).json({
        success: false,
        message: "Failed to initialize wallet",
        error: initError.message,
      });
    }

    const newParams = await getLatestZcashParams(userId);
    console.log(newParams);
    await executeZingoCliSeed(newParams, seedPhrase, birthdayHeight);

    res.status(201).json({
      success: true,
      message: "Wallet imported successfully. Syncing in progress...",
      data: params,
    });
  } catch (error) {
    console.error("Error importing wallet:", error);
    res.status(500).json({
      success: false,
      message: "Failed to import wallet",
      error: error.message,
    });
  }
});

/**
 * GET /api/zcash/params
 * Get all Zcash parameters for the authenticated user
 * Protected route - requires authentication
 */
router.get("/params", authenticate, async (req, res) => {
  try {
    const userId = req.user.id; // Assuming authenticate middleware sets req.user

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

    const params = await prisma.zcashParams.findUnique({
      where: {
        ownerId_accountName: {
          ownerId: userId,
          accountName: accountName,
        },
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

    // Check if account already exists for this user
    const existing = await prisma.zcashParams.findUnique({
      where: {
        ownerId_accountName: {
          ownerId: userId,
          accountName: accountName,
        },
      },
    });

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

    // Check if parameters exist for this user
    const existing = await prisma.zcashParams.findUnique({
      where: {
        ownerId_accountName: {
          ownerId: userId,
          accountName: accountName,
        },
      },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: `Zcash parameters not found for account: ${accountName}`,
      });
    }

    // If changing account name, check if new name already exists for this user
    if (newAccountName && newAccountName !== accountName) {
      const nameExists = await prisma.zcashParams.findUnique({
        where: {
          ownerId_accountName: {
            ownerId: userId,
            accountName: newAccountName,
          },
        },
      });

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

    // Update parameters
    const params = await prisma.zcashParams.update({
      where: {
        ownerId_accountName: {
          ownerId: userId,
          accountName: accountName,
        },
      },
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
    const existing = await prisma.zcashParams.findUnique({
      where: {
        ownerId_accountName: {
          ownerId: userId,
          accountName: accountName,
        },
      },
    });

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

    // If changing account name, check if new name already exists for this user
    if (updateData.accountName && updateData.accountName !== accountName) {
      const nameExists = await prisma.zcashParams.findUnique({
        where: {
          ownerId_accountName: {
            ownerId: userId,
            accountName: updateData.accountName,
          },
        },
      });

      if (nameExists) {
        return res.status(409).json({
          success: false,
          message: `You already have an account named '${updateData.accountName}'`,
        });
      }
    }

    // Update parameters
    const params = await prisma.zcashParams.update({
      where: {
        ownerId_accountName: {
          ownerId: userId,
          accountName: accountName,
        },
      },
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
const { invalidateZingo } = require("../utils/getZingo"); // your process pool helper

router.delete("/params/:accountName", authenticate, async (req, res) => {
  try {
    const { accountName } = req.params;
    const userId = req.user.id;

    // Fetch existing parameters
    const existing = await prisma.zcashParams.findUnique({
      where: {
        ownerId_accountName: {
          ownerId: userId,
          accountName: accountName,
        },
      },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: `Zcash parameters not found for account: ${accountName}`,
      });
    }

    // Build the dataDir path (from existing params)
    const dataDir = path.join(
      process.cwd(),
      "wallets",
      userId,
      existing.accountName,
      existing.chain,
    );
    const chain = existing.chain || "mainnet";
    const serverUrl = existing.serverUrl || "http://127.0.0.1:8137";

    // 1️⃣ Invalidate / kill the running zingo process for this wallet
    invalidateZingo({ chain, serverUrl, dataDir });

    // 2️⃣ Delete the data folder from disk
    if (dataDir) {
      await fs.rm(dataDir, { recursive: true, force: true });
      console.log(`Deleted wallet folder at ${dataDir}`);
    }

    // 3️⃣ Delete the database record
    await prisma.zcashParams.delete({
      where: {
        ownerId_accountName: {
          ownerId: userId,
          accountName: accountName,
        },
      },
    });

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

      // Wrap both writes in a transaction to prevent lock contention
      const updated = await prisma.$transaction(
        async (tx) => {
          // Clear any existing default for this admin first
          await tx.zcashParams.updateMany({
            where: { ownerId: userId, isDefault: true },
            data: { isDefault: false },
          });

          // Set the new default
          return tx.zcashParams.update({
            where: {
              ownerId_accountName: { ownerId: userId, accountName },
            },
            data: { isDefault: true },
          });
        },
        {
          timeout: 10000, // 10s — gives SQLite time to release any existing locks
        },
      );

      sendRealtimeUpdate("default_wallet_updated", updated, userId);

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

    // Upsert parameters
    const params = await prisma.zcashParams.upsert({
      where: {
        ownerId_accountName: {
          ownerId: userId,
          accountName: accountName,
        },
      },
      update: {
        ...(chain !== undefined && { chain }),
        ...(serverUrl !== undefined && { serverUrl }),
      },
      create: {
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
    const params = await prisma.zcashParams.findUnique({
      where: {
        ownerId_accountName: {
          ownerId: userId,
          accountName: accountName,
        },
      },
    });

    if (!params) {
      return res.status(404).json({
        success: false,
        message: `Zcash parameters not found for account: ${accountName}`,
      });
    }

    // Test connection to Zcash server
    try {
      const response = await axios.post(
        params.serverUrl,
        {
          jsonrpc: "2.0",
          id: "test",
          method: "getblockchaininfo",
          params: [],
        },
        {
          timeout: 5000,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      res.json({
        success: true,
        message: "Connection successful",
        data: {
          connected: true,
          chain: response.data.result?.chain || "unknown",
          blocks: response.data.result?.blocks || 0,
        },
      });
    } catch (connectionError) {
      res.status(503).json({
        success: false,
        message: "Failed to connect to Zcash server",
        error: connectionError.message,
      });
    }
  } catch (error) {
    console.error("Error testing connection:", error);
    res.status(500).json({
      success: false,
      message: "Failed to test connection",
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
