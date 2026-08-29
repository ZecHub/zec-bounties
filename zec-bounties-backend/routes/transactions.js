const express = require("express");
const prisma = require("../prisma/client");
const router = express.Router();
const { authenticate, isAdmin } = require("../middleware/auth");
const executeZingoQuickSend = require("../utils/zingo/zingoLibQuickSend.js");
const { initZcashOnce } = require("../zcash/init");
const executeZingoCliTransactions = require("../utils/zingo/zingoLibTransactions.js");
const executeZingoCliAddresses = require("../utils/zingo/zingoLibAddresses.js");
const { getDefaultZcashParams } = require("../helpers/zcash/zcashHelper.js");
const executeZingoCliSync = require("../utils/zingo/zingoLibSync.js");
const executeZingoCliRescan = require("../utils/zingo/zingoLibRescan.js");
const executeZingoCliQuit = require("../utils/zingo/zingoLibQuit.js");
const executeZingoCliBalance = require("../utils/zingo/zingoLibBalance.js");
const { delCache, deleteCacheByPattern } = require("../utils/cache");
const { sendRealtimeUpdate, sendToUser } = require("../middleware/websocket");
const path = require("path");

const invalidateBounty = async (bountyId) => {
  await Promise.all([
    delCache(`bounty:${bountyId}`),
    deleteCacheByPattern("bounties:*"),
  ]);
};

// List transactions (Admin)
router.get("/", authenticate, isAdmin, async (req, res) => {
  const params = await getDefaultZcashParams(req.user.id);
  const txs = await executeZingoCliTransactions(params);

  // ✅ Send transactions only to the requesting admin
  sendToUser(req.user.id, "transactions_fetched", { transactions: txs });

  res.json({
    transactions: txs,
    chain: params?.chain,
    serverUrl: params?.serverUrl,
  });
});

router.get("/rescan", authenticate, isAdmin, async (req, res) => {
  const params = await getDefaultZcashParams(req.user.id);
  if (!params) {
    await initZcashOnce((ownerId = req.user.id), (accountName = "Main"));
  }
  // await executeZingoCliQuit("quit", params);
  await executeZingoCliRescan("rescan", params);

  res.json("Rescan started");
});

router.get("/sync-status", authenticate, isAdmin, async (req, res) => {
  const params = await getDefaultZcashParams(req.user.id);
  if (!params) {
    await initZcashOnce((ownerId = req.user.id), (accountName = "Main"));
  }
  const data = await executeZingoCliSync("sync status", params);
  console.log("status", data);

  const syncStatusJson = data;

  // ✅ Send balance only to the requesting admin (not broadcast)
  sendToUser(req.user.id, "sync_status", { data });

  res.json(syncStatusJson);
});

router.get("/balance", authenticate, isAdmin, async (req, res) => {
  const params = await getDefaultZcashParams(req.user.id);
  if (!params) {
    await initZcashOnce((ownerId = req.user.id), (accountName = "Main"));
  }
  const data = await executeZingoCliBalance("balance", params);

  // ✅ Send balance only to the requesting admin (not broadcast)
  sendToUser(req.user.id, "balance_fetched", { balance: data });

  res.json(data);
});

router.post("/accounts", authenticate, async (req, res) => {
  const { accountName } = req.body;

  if (!accountName) {
    return res.status(400).json({ error: "accountName is required" });
  }

  try {
    const params = await initZcashOnce(req.user.id, accountName);

    // ✅ Send account created only to the requesting user
    sendToUser(req.user.id, "account_created", { accountName, params });

    res.json({ message: `Account "${accountName}" initialized`, params });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List addresses (Admin)
router.get("/addresses", authenticate, isAdmin, async (req, res) => {
  const params = await getDefaultZcashParams(req.user.id);
  const status = await executeZingoCliSync("sync status", params);
  console.log("status-add", status);

  const addresses = await executeZingoCliAddresses("addresses", params);

  try {
    const result = addresses[0].encoded_address;
    console.log("addresses", result);

    // ✅ Send addresses only to the requesting admin (not broadcast)
    sendToUser(req.user.id, "addresses_fetched", { addresses });

    res.json(addresses);
  } catch {
    res.json("Error in the Address");
  }
});

router.post("/authorize-payment", authenticate, isAdmin, async (req, res) => {
  try {
    const { bountyIds } = req.body; // array of selected bounty IDs from admin

    if (!bountyIds || !Array.isArray(bountyIds) || bountyIds.length === 0) {
      return res
        .status(400)
        .json({ error: "No bounties selected for payment" });
    }

    // Resolve the acting admin's default wallet
    const adminWallet = await prisma.zcashParams.findFirst({
      where: {
        ownerId: req.user.id,
        isDefault: true,
      },
    });

    if (!adminWallet) {
      return res.status(400).json({
        error:
          "No default wallet configured. Please set a default wallet in settings before authorizing payments.",
      });
    }

    const bountyChainForWallet =
      adminWallet.chain === "mainnet" ? "MAIN" : "TEST";

    adminWallet.dataDir = path.join(
      process.cwd(),
      "wallets",
      req.user.id,
      adminWallet.accountName,
      adminWallet.chain,
    );

    // Fetch the selected bounties with their assignees
    const bounties = await prisma.bounty.findMany({
      where: {
        id: { in: bountyIds },
        status: "DONE",
        isPaid: false,
        isApproved: true,
      },
      include: {
        assigneeUser: {
          select: { id: true, name: true, z_address: true, UA_address: true },
        },
      },
    });

    const chainMismatches = bounties.filter(
      (b) => b.chain !== bountyChainForWallet,
    );
    if (chainMismatches.length > 0) {
      return res.status(400).json({
        error: `Chain mismatch: your default wallet is on ${adminWallet.chain} but ${chainMismatches.length} selected bounty/ies are on ${bountyChainForWallet === "MAIN" ? "testnet" : "mainnet"}. Switch your default wallet or deselect those bounties.`,
        mismatched: chainMismatches.map((b) => ({
          id: b.id,
          title: b.title,
          chain: b.chain,
        })),
      });
    }

    if (bounties.length === 0) {
      return res.status(400).json({
        error:
          "None of the selected bounties are eligible for payment (must be DONE, approved, and unpaid)",
      });
    }

    // Build payment list, skipping any bounty whose assignee has no z_address
    const paymentList = [];
    const skipped = [];

    console.log(bounties);

    for (const bounty of bounties) {
      const payoutAddress =
        bounty.chain === "MAIN"
          ? bounty.assigneeUser?.UA_address
          : bounty.assigneeUser?.z_address;

      if (!payoutAddress) {
        skipped.push({
          id: bounty.id,
          title: bounty.title,
          reason: `Assignee has no ${bounty.chain === "MAIN" ? "UA address" : "z_address"}`,
        });
        continue;
      }

      paymentList.push({
        address: payoutAddress,
        amount: Math.round(bounty.bountyAmount * 1e8), // zatoshis
        memo: `Bounty: ${bounty.title} (ID: ${bounty.id})`,
        bountyId: bounty.id,
      });
    }

    if (paymentList.length === 0) {
      return res.status(400).json({
        error:
          "No payable bounties — all selected assignees are missing z_addresses",
        skipped,
      });
    }

    console.log(
      `💸 Paying ${paymentList.length} bounties from wallet "${adminWallet.accountName}" (admin: ${req.user.id})`,
    );

    // Execute payment
    const sendResult = await executeZingoQuickSend(paymentList, adminWallet);

    if (sendResult.error) {
      const errorMessage = sendResult.error || "Unknown payment error";
      console.error("❌ Zingo payment error:", errorMessage);
      return res.status(422).json({
        success: false,
        error: "Payment failed",
        details: errorMessage,
      });
    }

    const txResult = sendResult[1];

    // Mark all successfully queued bounties as paid
    const paidBountyIds = paymentList.map((p) => p.bountyId);
    await prisma.bounty.updateMany({
      where: { id: { in: paidBountyIds } },
      data: {
        isPaid: true,
        paymentAuthorized: true,
        paidAt: new Date(),
      },
    });
    await Promise.all(paidBountyIds.map((id) => invalidateBounty(id)));

    // ✅ Broadcast payment result to ALL admins (this is a shared event)
    sendRealtimeUpdate(
      "payment_authorized",
      {
        result: txResult,
        paidCount: paidBountyIds.length,
        skippedCount: skipped.length,
        skipped,
        walletAccountName: adminWallet.accountName,
      },
      req.user.id, // exclude sender since they get the HTTP response
    );

    res.json({
      success: true,
      result: txResult,
      paidCount: paidBountyIds.length,
      skipped,
    });
  } catch (error) {
    console.error("Error in authorize-payment:", error);
    res.status(500).json({ error: error.message });
  }
});


module.exports = router;
