const express = require("express");
const prisma = require("../prisma/client");
const router = express.Router();
const axios = require("axios");
const { authenticate, isAdmin } = require("../middleware/auth");
const executeZingoQuickSend = require("../utils/zingo/zingoLibQuickSend.js");
const { findDueBounties } = require("../helpers/db-query.js");
const {
  buildPaymentList,
  updateDueBounties,
  storeTransactions,
} = require("../helpers/db-query.js");
const { initZcashOnce } = require("../zcash/init");
const executeZingoCli = require("../utils/zingo/zingoLib.js");
const executeZingoCliTransactions = require("../utils/zingo/zingoLibTransactions.js");
const executeZingoCheckBalance = require("../utils/zingo/zingoLibCheckBalance.js");
const executeZingoCliAddresses = require("../utils/zingo/zingoLibAddresses.js");
const {
  getLatestZcashParams,
  getDefaultZcashParams,
} = require("../helpers/zcash/zcashHelper.js");
const executeZingoParseAddress = require("../utils/zingo/zingoLibParseAddress.js");
const executeZingoCliSync = require("../utils/zingo/zingoLibSync.js");
const executeZingoCliRescan = require("../utils/zingo/zingoLibRescan.js");
const executeZingoCliRecoveryInfo = require("../utils/zingo/zingoLibRecoveryInfo.js");
const executeZingoCliQuit = require("../utils/zingo/zingoLibQuit.js");
const executeZingoCliBalance = require("../utils/zingo/zingoLibBalance.js");
const { resolvePayingWallet } = require("../helpers/zcash/resolvePayingWallet");
const { buildPaymentListGrouped } = require("../helpers/db-query");
const { delCache, deleteCacheByPattern } = require("../utils/cache");
const executeZingoCliInfo = require("../utils/zingo/zingoLibInfo");
const { randomUUID } = require("crypto");

const { sendRealtimeUpdate, sendToUser } = require("../middleware/websocket");

const path = require("path");

const invalidateBounty = async (bountyId) => {
  await Promise.all([
    delCache(`bounty:${bountyId}`),
    deleteCacheByPattern("bounties:*"),
  ]);
};

// BigInt doesn't survive res.json; total ZEC supply in zatoshis still fits a
// double, so Number is safe for amounts.
const serializeTxRecord = (record) => ({
  ...record,
  amountZat: Number(record.amountZat),
});

// Clean failure before anything reached the network: record it and put the
// bounties back in the payable set.
async function releaseClaim(batchKey, bountyIds, errorDetail, raw) {
  await prisma.$transaction([
    prisma.transaction.updateMany({
      where: { batchKey },
      data: {
        status: "FAILED",
        errorDetail: errorDetail || null,
        rawResult: raw || null,
        settledAt: new Date(),
      },
    }),
    prisma.bounty.updateMany({
      where: { id: { in: bountyIds } },
      data: { paymentInFlight: false },
    }),
  ]);
  await Promise.all(bountyIds.map((id) => invalidateBounty(id)));
}

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
    const adminWallet = await getDefaultZcashParams(req.user.id);

    if (!adminWallet) {
      return res.status(400).json({
        error:
          "No default wallet configured. Please set a default wallet in settings before authorizing payments.",
      });
    }

    const bountyChainForWallet =
      adminWallet.chain === "mainnet" ? "MAIN" : "TEST";

    // Fetch the selected bounties with their assignees
    const bounties = await prisma.bounty.findMany({
      where: {
        id: { in: bountyIds },
        status: "DONE",
        isPaid: false,
        isApproved: true,
        paymentInFlight: false,
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
        chain: bounty.chain,
      });
    }

    if (paymentList.length === 0) {
      return res.status(400).json({
        error:
          "No payable bounties — all selected assignees are missing z_addresses",
        skipped,
      });
    }

    // ── Claim before send ───────────────────────────────────────────────
    // Flip paymentInFlight -> true and write PENDING Transaction rows, all
    // in one DB transaction, BEFORE anything is sent. The where-clause here
    // is the compare-and-swap: if another request already claimed any of
    // these bounties, `count` comes back lower than expected and we throw
    // to force a rollback (an interactive transaction commits on return,
    // so bailing with a plain return would still commit a partial claim).
    const payableIds = paymentList.map((p) => p.bountyId);
    const batchKey = randomUUID();
    const claimConflict = new Error("claim-conflict");

    try {
      await prisma.$transaction(async (tx) => {
        const result = await tx.bounty.updateMany({
          where: {
            id: { in: payableIds },
            status: "DONE",
            isApproved: true,
            isPaid: false,
            paymentInFlight: false,
          },
          data: { paymentInFlight: true },
        });

        if (result.count !== payableIds.length) throw claimConflict;

        await tx.transaction.createMany({
          data: paymentList.map((p) => ({
            bountyId: p.bountyId,
            amountZat: BigInt(p.amount),
            toAddress: p.address,
            memo: p.memo,
            batchKey,
          })),
        });
      });
    } catch (err) {
      if (err !== claimConflict) throw err;
      return res.status(409).json({
        error:
          "Some of the selected bounties are already being paid by another request. Refresh and try again.",
      });
    }

    console.log(
      `💸 Paying ${paymentList.length} bounties from wallet "${adminWallet.accountName}" (admin: ${req.user.id}, batch: ${batchKey})`,
    );

    // ── Send ─────────────────────────────────────────────────────────────
    let sendResult;
    try {
      sendResult = await executeZingoQuickSend(paymentList, adminWallet);
    } catch (err) {
      // quicksend only rejects on timeout — by then the command was
      // already written to the wallet process, so the send may have gone
      // through. Outcome unknown: do NOT release the claim, or a retry
      // could double-pay. Leave paymentInFlight = true and flag for a human.
      console.error(
        `⚠️ UNKNOWN payment outcome for batch ${batchKey} (bounties: ${payableIds.join(", ")}): ${err.message}`,
      );
      await prisma.transaction.updateMany({
        where: { batchKey },
        data: { status: "UNKNOWN" },
      });
      return res.status(502).json({
        success: false,
        outcome: "unknown",
        error: "Payment outcome unknown — the send may have completed",
        details:
          "The wallet didn't confirm in time. These bounties are locked and will NOT be auto-retried. Check the wallet's transaction history before taking further action.",
        batchKey,
      });
    }

    if (sendResult.timedOut) {
      console.error(
        `⚠️ UNKNOWN payment outcome for batch ${batchKey} (bounties: ${payableIds.join(", ")}): send timed out`,
      );
      await prisma.transaction.updateMany({
        where: { batchKey },
        data: { status: "UNKNOWN" },
      });
      return res.status(502).json({
        success: false,
        outcome: "unknown",
        error: "Payment outcome unknown — the send may have completed",
        details:
          "The wallet didn't confirm in time. These bounties are locked and will NOT be auto-retried. Check the wallet's transaction history before taking further action.",
        batchKey,
      });
    }

    if (sendResult.error) {
      // Structured failure from the tool — nothing was broadcast, safe to
      // release the claim so these bounties become payable again.
      const errorMessage = sendResult.error || "Unknown payment error";
      console.error("❌ Zingo payment error:", errorMessage);

      await releaseClaim(batchKey, payableIds, errorMessage, sendResult.raw);

      return res.status(422).json({
        success: false,
        error: "Payment failed",
        details: errorMessage,
      });
    }

    // ── Clean success ────────────────────────────────────────────────────
    const txResult = sendResult[1];
    const txid = sendResult.txids?.[0] ?? txResult?.txid ?? null;
    const paidAt = new Date();

    await prisma.$transaction([
      prisma.transaction.updateMany({
        where: { batchKey },
        data: { status: "BROADCAST", txid, settledAt: paidAt },
      }),
      prisma.bounty.updateMany({
        where: { id: { in: payableIds } },
        data: {
          isPaid: true,
          paymentAuthorized: true,
          paidAt,
          paymentInFlight: false,
        },
      }),
    ]);
    await Promise.all(payableIds.map((id) => invalidateBounty(id)));

    sendRealtimeUpdate(
      "payment_authorized",
      {
        result: txResult,
        paidCount: payableIds.length,
        skippedCount: skipped.length,
        skipped,
        walletAccountName: adminWallet.accountName,
        batchKey,
      },
      req.user.id, // exclude sender since they get the HTTP response
    );

    res.json({
      success: true,
      result: txResult,
      batchKey,
      paidCount: payableIds.length,
      skipped,
    });
  } catch (error) {
    console.error("Error in authorize-payment:", error);
    res.status(500).json({ error: error.message });
  }
});

// Durable payout records (DB) — as opposed to GET / above, which is the live
// wallet history and knows nothing about bounties.
router.get("/records", authenticate, isAdmin, async (req, res) => {
  try {
    const records = await prisma.transaction.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        bounty: {
          select: {
            id: true,
            title: true,
            chain: true,
            assigneeUser: { select: { id: true, name: true, nickname: true } },
          },
        },
      },
    });

    res.json({ records: records.map(serializeTxRecord) });
  } catch (error) {
    console.error("Error fetching payment records:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/records/:id/resolve", authenticate, isAdmin, async (req, res) => {
  const { outcome, txid } = req.body; // "broadcast" or "failed"
  const record = await prisma.transaction.findUnique({
    where: { id: req.params.id },
  });
  if (record.status !== "UNKNOWN")
    return res.status(409).json({ error: "already settled" });

  if (outcome === "broadcast") {
    await prisma.$transaction([
      prisma.transaction.update({
        where: { id: record.id },
        data: { status: "BROADCAST", txid, settledAt: new Date() },
      }),
      prisma.bounty.update({
        where: { id: record.bountyId },
        data: { isPaid: true, paymentInFlight: false, paidAt: new Date() },
      }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.transaction.update({
        where: { id: record.id },
        data: { status: "FAILED", settledAt: new Date() },
      }),
      prisma.bounty.update({
        where: { id: record.bountyId },
        data: { paymentInFlight: false },
      }),
    ]);
  }
  res.json({ success: true });
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

      // const dueBounties = await findDueBounties();
      // const paymentList = await buildPaymentList(dueBounties);

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
      await invalidateBounty(bountyId);

      // ✅ Broadcast bounty payment authorization to ALL (shared bounty state)
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
      await invalidateBounty(bountyId);

      // ✅ Broadcast bounty payment authorization to ALL (shared bounty state)
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

      // ✅ Broadcast batch payment result to ALL admins (shared event)
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

      // ✅ Broadcast instant payment result to ALL admins (shared event)
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
    await invalidateBounty(bountyId);

    // ✅ Broadcast bounty paid status to ALL (shared bounty state)
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
  const bountyId = req.params.bountyId;

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
    await invalidateBounty(bountyId);

    // ✅ Broadcast bounty paid to ALL admins (shared event)
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
