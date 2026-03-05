const express = require("express");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const router = express.Router();
const axios = require("axios");
const { authenticate, isAdmin } = require("../middleware/auth");
const executeZingoQuickSend = require("../utils/zingoLibQuickSend.js");
const { findDueBounties } = require("../helpers/db-query.js");
const {
  buildPaymentList,
  updateDueBounties,
  storeTransactions,
} = require("../helpers/db-query.js");
const { initZcashOnce } = require("../zcash/init");
const executeZingoCli = require("../utils/zingoLib.js");
const executeZingoCliTransactions = require("../utils/zingoLibTransactions.js");
const executeZingoCheckBalance = require("../utils/zingoLibCheckBalance.js");
const executeZingoCliAddresses = require("../utils/zingoLibAddresses.js");
const { getLatestZcashParams } = require("../helpers/zcash/zcashHelper.js.js");
const executeZingoParseAddress = require("../utils/zingoLibParseAddress.js");
const executeZingoCliSync = require("../utils/zingoLibSync.js");
const { resolvePayingWallet } = require("../helpers/zcash/resolvePayingWallet");
const { buildPaymentListGrouped } = require("../helpers/db-query");

const { sendRealtimeUpdate } = require("../middleware/websocket");

// List transactions (Admin)
router.get("/", authenticate, isAdmin, async (req, res) => {
  const params = await getLatestZcashParams(req.user.id);
  console.log(params);
  const txs = await executeZingoCliTransactions("transactions", params);

  // ✅ Broadcast transactions fetched
  sendRealtimeUpdate(
    "transactions_fetched",
    { transactions: txs },
    req.user.id,
  );

  res.json(txs);
});

router.get("/balance", authenticate, isAdmin, async (req, res) => {
  const params = await getLatestZcashParams(req.user.id);
  if (!params) {
    await initZcashOnce((ownerId = req.user.id), (accountName = "Main"));
  }
  console.log(params);
  const data = await executeZingoCheckBalance("balance", params);

  let balance;
  if (params.chain === "testnet") {
    balance = data.confirmed_orchard_balance;
  } else if (params.chain === "mainnet") {
    balance = data.confirmed_sapling_balance;
  }

  // ✅ Broadcast balance fetched
  sendRealtimeUpdate("balance_fetched", { balance }, req.user.id);

  res.json(balance);
});

router.post("/accounts", authenticate, async (req, res) => {
  const { accountName } = req.body;

  if (!accountName) {
    return res.status(400).json({ error: "accountName is required" });
  }

  try {
    const params = await initZcashOnce(req.user.id, accountName);

    // ✅ Broadcast account created
    sendRealtimeUpdate("account_created", { accountName, params }, req.user.id);

    res.json({ message: `Account "${accountName}" initialized`, params });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List transactions (Admin)
router.get("/addresses", authenticate, isAdmin, async (req, res) => {
  const params = await getLatestZcashParams(req.user.id);
  const status = await executeZingoCliSync("sync status", params);
  console.log("status", status);

  const addressesList = await executeZingoCliAddresses("addresses", params);

  try {
    const addresses = addressesList[0];
    const result = addresses.encoded_address;

    // ✅ Broadcast addresses fetched
    sendRealtimeUpdate("addresses_fetched", { addresses }, req.user.id);

    res.json(addresses);
  } catch {
    res.json("Error in the Address");
  }
});

// List transactions (Admin)
// router.post("/authorize-payment", authenticate, isAdmin, async (req, res) => {
//   const dueBounties = await findDueBounties();
//   const { paymentList, totalZecAmount } = await buildPaymentList(dueBounties);
//   const params = await getLatestZcashParams(req.user.id);
//   console.log(params);
//   const sendResult = await executeZingoQuickSend(paymentList, params);

//   const result = sendResult[1];
//   await updateDueBounties();

//   // ✅ Broadcast payment authorized
//   sendRealtimeUpdate(
//     "payment_authorized",
//     {
//       result,
//       totalZecAmount,
//       bountyCount: dueBounties.length,
//     },
//     req.user.id,
//   );

//   res.json(result);
// });

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
          select: { id: true, name: true, z_address: true },
        },
      },
    });

    if (bounties.length === 0) {
      return res.status(400).json({
        error:
          "None of the selected bounties are eligible for payment (must be DONE, approved, and unpaid)",
      });
    }

    // Build payment list, skipping any bounty whose assignee has no z_address
    const paymentList = [];
    const skipped = [];

    for (const bounty of bounties) {
      if (!bounty.assigneeUser?.z_address) {
        skipped.push({
          id: bounty.id,
          title: bounty.title,
          reason: "Assignee has no z_address",
        });
        continue;
      }

      paymentList.push({
        address: bounty.assigneeUser.z_address,
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

    // Store transaction record
    await storeTransactions(
      txResult,
      paymentList.reduce((sum, p) => sum + p.amount, 0),
    );

    sendRealtimeUpdate(
      "payment_authorized",
      {
        result: txResult,
        paidCount: paidBountyIds.length,
        skippedCount: skipped.length,
        skipped,
        walletAccountName: adminWallet.accountName,
      },
      req.user.id,
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

router.post(
  "/:id/authorize-payment",
  authenticate,
  isAdmin,
  async (req, res) => {
    try {
      const { id: bountyId } = req.params;
      const { paymentAuthorized, paymentScheduled } = req.body;
      const userRole = req.user.role;

      if (userRole !== "ADMIN") {
        return res.status(403).json({
          error: "Only administrators can authorize payments",
        });
      }

      const dueBounties = await findDueBounties();
      const paymentList = await buildPaymentList(dueBounties);

      const bounty = await prisma.bounty.findUnique({
        where: { id: bountyId },
        include: {
          assigneeUser: true,
          createdByUser: true,
        },
      });

      if (!bounty) {
        return res.status(404).json({ error: "Bounty not found" });
      }

      if (bounty.status !== "DONE" || !bounty.isApproved) {
        return res.status(400).json({
          error:
            "Bounty must be completed and approved before payment authorization",
        });
      }

      if (
        paymentScheduled?.type === "sunday_batch" &&
        !bounty.assigneeUser?.z_address
      ) {
        return res.status(400).json({
          error: "Assignee must have a Z-address configured for batch payments",
        });
      }

      const updatedBounty = await prisma.bounty.update({
        where: { id: bountyId },
        data: {
          paymentAuthorized: paymentAuthorized || true,
          paymentScheduled: paymentScheduled
            ? JSON.stringify(paymentScheduled)
            : null,
        },
        include: {
          createdByUser: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              avatar: true,
            },
          },
          assigneeUser: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              avatar: true,
              z_address: true,
            },
          },
        },
      });

      const responseData = {
        ...updatedBounty,
        paymentScheduled: updatedBounty.paymentScheduled
          ? JSON.parse(updatedBounty.paymentScheduled)
          : null,
      };

      // ✅ Broadcast payment authorized for specific bounty
      sendRealtimeUpdate(
        "bounty_payment_authorized",
        responseData,
        req.user.id,
      );

      res.json(responseData);
    } catch (error) {
      console.error("Error authorizing payment:", error);
      res.status(500).json({
        error: "Failed to authorize payment",
        details: error.message,
      });
    }
  },
);

router.put(
  "/:id/authorize-payment",
  authenticate,
  isAdmin,
  async (req, res) => {
    try {
      const { id: bountyId } = req.params;
      const { paymentAuthorized, paymentScheduled } = req.body;
      const userRole = req.user.role;

      if (userRole !== "ADMIN") {
        return res.status(403).json({
          error: "Only administrators can authorize payments",
        });
      }

      const bounty = await prisma.bounty.findUnique({
        where: { id: bountyId },
        include: {
          assigneeUser: true,
          createdByUser: true,
        },
      });

      if (!bounty) {
        return res.status(404).json({ error: "Bounty not found" });
      }

      if (bounty.status !== "DONE" || !bounty.isApproved) {
        return res.status(400).json({
          error:
            "Bounty must be completed and approved before payment authorization",
        });
      }

      if (
        paymentScheduled?.type === "sunday_batch" &&
        !bounty.assigneeUser?.z_address
      ) {
        return res.status(400).json({
          error: "Assignee must have a Z-address configured for batch payments",
        });
      }

      const updatedBounty = await prisma.bounty.update({
        where: { id: bountyId },
        data: {
          paymentAuthorized: paymentAuthorized || true,
          paymentScheduled: paymentScheduled
            ? JSON.stringify(paymentScheduled)
            : null,
        },
        include: {
          createdByUser: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              avatar: true,
            },
          },
          assigneeUser: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              avatar: true,
              z_address: true,
            },
          },
        },
      });

      const responseData = {
        ...updatedBounty,
        paymentScheduled: updatedBounty.paymentScheduled
          ? JSON.parse(updatedBounty.paymentScheduled)
          : null,
      };

      // ✅ Broadcast payment authorized for specific bounty
      sendRealtimeUpdate(
        "bounty_payment_authorized",
        responseData,
        req.user.id,
      );

      res.json(responseData);
    } catch (error) {
      console.error("Error authorizing payment:", error);
      res.status(500).json({
        error: "Failed to authorize payment",
        details: error.message,
      });
    }
  },
);

// Process batch payments
router.post(
  "/process-batch-payments",
  authenticate,
  isAdmin,
  async (req, res) => {
    try {
      const { payments, batchTimestamp } = req.body;
      const userRole = req.user.role;

      if (userRole !== "ADMIN") {
        return res.status(403).json({
          error: "Only administrators can process batch payments",
        });
      }

      if (!payments || !Array.isArray(payments)) {
        return res.status(400).json({
          error: "Invalid payments data",
        });
      }

      if (payments.length === 0) {
        return res.json({
          success: true,
          message: "No payments to process",
          processedCount: 0,
        });
      }

      const batchId = `batch_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      console.log("Processing batch payment:", {
        batchId,
        batchTimestamp,
        paymentCount: payments.length,
        totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
        payments: payments,
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const processedPayments = payments.map((payment) => ({
        ...payment,
        status: "processed",
        transactionId: `tx_${Math.random().toString(36).substr(2, 9)}`,
      }));

      const result = {
        success: true,
        batchId,
        message: `Successfully processed ${payments.length} payments`,
        processedCount: payments.length,
        totalAmount: payments.reduce((sum, p) => sum + p.amount, 0),
        payments: processedPayments,
        zcashPayload: payments,
      };

      // ✅ Broadcast batch payment processed
      sendRealtimeUpdate("batch_payment_processed", result, req.user.id);

      res.json(result);
    } catch (error) {
      console.error("Error processing batch payments:", error);
      res.status(500).json({
        success: false,
        error: "Failed to process batch payments",
        message: error.message,
      });
    }
  },
);

// Process instant payment (for immediate payments)
router.post(
  "/process-instant-payment",
  authenticate,
  isAdmin,
  async (req, res) => {
    try {
      const { address, amount, memo, bountyId } = req.body;
      const userRole = req.user.role;

      if (userRole !== "ADMIN") {
        return res.status(403).json({
          error: "Only administrators can process payments",
        });
      }

      if (!address || !amount || !bountyId) {
        return res.status(400).json({
          error: "Missing required fields: address, amount, bountyId",
        });
      }

      console.log("Processing instant payment:", {
        bountyId,
        address,
        amount,
        memo,
        timestamp: new Date().toISOString(),
      });

      await new Promise((resolve) => setTimeout(resolve, 500));

      const transactionId = `tx_instant_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const result = {
        success: true,
        message: "Instant payment processed successfully",
        transactionId,
        amount,
        address,
        memo,
        bountyId,
      };

      // ✅ Broadcast instant payment processed
      sendRealtimeUpdate("instant_payment_processed", result, req.user.id);

      res.json(result);
    } catch (error) {
      console.error("Error processing instant payment:", error);
      res.status(500).json({
        success: false,
        error: "Failed to process instant payment",
        message: error.message,
      });
    }
  },
);

// Mark bounty as paid (called after successful payment processing)
router.put("/:id/mark-paid", authenticate, isAdmin, async (req, res) => {
  try {
    const { id: bountyId } = req.params;
    const { isPaid, paymentBatchId, paidAt } = req.body;
    const userRole = req.user.role;

    if (userRole !== "ADMIN") {
      return res.status(403).json({
        error: "Only administrators can mark bounties as paid",
      });
    }

    const updatedBounty = await prisma.bounty.update({
      where: { id: bountyId },
      data: {
        isPaid: isPaid || true,
        paymentBatchId: paymentBatchId || null,
        paidAt: paidAt ? new Date(paidAt) : new Date(),
      },
      include: {
        createdByUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            avatar: true,
          },
        },
        assigneeUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            avatar: true,
            z_address: true,
          },
        },
      },
    });

    // ✅ Broadcast bounty marked as paid
    sendRealtimeUpdate("bounty_marked_paid", updatedBounty, req.user.id);

    res.json(updatedBounty);
  } catch (error) {
    console.error("Error marking bounty as paid:", error);
    res.status(500).json({
      error: "Failed to mark bounty as paid",
      details: error.message,
    });
  }
});

// Pay bounty
router.post("/pay/:bountyId", authenticate, isAdmin, async (req, res) => {
  const bountyId = Number(req.params.bountyId);
  const bounty = await prisma.bounty.findUnique({
    where: { id: bountyId },
    include: { assignee: true },
  });

  if (!bounty.approved) {
    return res.status(400).send("Bounty not approved");
  }

  if (!bounty.assignee?.zecAddress) {
    return res.status(400).send("Assignee has no address");
  }

  const rpcPayload = {
    jsonrpc: "1.0",
    id: "pay",
    method: "z_sendmany",
    params: [
      process.env.ADMIN_WALLET_ADDRESS,
      [{ address: bounty.assignee.zecAddress, amount: bounty.bountyAmountZec }],
    ],
  };

  try {
    const rpcRes = await axios.post(process.env.ZCASH_RPC_URL, rpcPayload, {
      auth: {
        username: process.env.ZCASH_RPC_USER,
        password: process.env.ZCASH_RPC_PASS,
      },
    });
    const txHash = rpcRes.data.result;

    await prisma.transaction.create({
      data: {
        bountyId,
        adminId: req.user.id,
        txHash,
        amountZec: bounty.bountyAmountZec,
      },
    });

    // ✅ Broadcast bounty paid
    sendRealtimeUpdate(
      "bounty_paid",
      {
        bountyId,
        txHash,
        amount: bounty.bountyAmountZec,
      },
      req.user.id,
    );

    res.json({ txHash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
