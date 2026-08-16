const express = require("express");
const prisma = require("../prisma/client");
const router = express.Router();
const { authenticate, isAdmin } = require("../middleware/auth");
const executeZingoQuickSend = require("../utils/zingo/zingoLibQuickSend.js");
const { randomUUID } = require("crypto");
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
const { delCache, deleteCacheByPattern } = require("../utils/cache");
const executeZingoCliInfo = require("../utils/zingo/zingoLibInfo");

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
    const { bountyIds, idempotencyKey } = req.body;

    if (!bountyIds || !Array.isArray(bountyIds) || bountyIds.length === 0) {
      return res
        .status(400)
        .json({ error: "No bounties selected for payment" });
    }

    // A retrying client reuses its key; a fresh attempt generates a new one.
    // The server-side fallback keeps direct API callers working, they just
    // don't get replay protection.
    const batchKey =
      typeof idempotencyKey === "string" && idempotencyKey.trim()
        ? idempotencyKey.trim()
        : randomUUID();

    // Replay guard. A live prior attempt (anything not cleanly failed) means
    // this request already ran, possibly still in flight, so refuse it. A
    // batch that only produced FAILED rows released its bounties cleanly, so
    // the same key may retry; those stale rows are cleared inside the claim
    // transaction below (scoped to FAILED) so a concurrent same-key retry can
    // never delete the winner's fresh PENDING rows.
    const live = await prisma.transaction.findMany({
      where: { batchKey, status: { not: "FAILED" } },
    });
    if (live.length > 0) {
      return res.status(409).json({
        error: "This payment request was already submitted",
        details: `Found ${live.length} recorded transaction(s) for this request (${[...new Set(live.map((r) => r.status))].join(", ")}). Check the Transactions tab before paying again.`,
        records: live.map(serializeTxRecord),
      });
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

    // Team wallets live under wallets/team:<teamId>/ — same layout
    // getDefaultZcashParams uses. Building the path off the user id for a
    // team-default wallet used to point zingo at an empty directory.
    const walletOwnerDir =
      adminWallet.isTeam && adminWallet.teamId
        ? `team:${adminWallet.teamId}`
        : req.user.id;

    adminWallet.dataDir = path.join(
      process.cwd(),
      "wallets",
      walletOwnerDir,
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

      // Addresses are user-editable profile data and end up inside a
      // single-quoted REPL command (and address validation on the profile
      // endpoint has historically been lax), so only canonical base58/bech32
      // characters pass. Never "clean up" an address — skip it.
      if (!/^[a-z0-9]+$/i.test(payoutAddress)) {
        skipped.push({
          id: bounty.id,
          title: bounty.title,
          reason: "Assignee's payout address contains invalid characters",
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

    // Claim before send: flip the payable set to in-flight and write PENDING
    // records, all in one transaction. The isPaid/paymentInFlight conditions
    // in the where-clause are the compare-and-swap — a concurrent request for
    // any of the same bounties claims fewer rows than it asked for and backs
    // out here instead of paying them a second time.
    const payableIds = paymentList.map((p) => p.bountyId);
    const bountyById = new Map(bounties.map((b) => [b.id, b]));

    // Thrown inside the claim to force a rollback. Prisma interactive
    // transactions COMMIT on return — bailing out with a return value would
    // commit the partially-claimed rows and wedge them in-flight with no
    // Transaction row to resolve them through.
    const claimConflict = new Error("claim-conflict");

    try {
      await prisma.$transaction(async (tx) => {
        // Clear any cleanly-failed prior attempt under this key so the retry
        // can re-create rows without hitting the [bountyId, batchKey] unique
        // constraint. Scoped to FAILED and atomic with the claim, so a losing
        // concurrent request rolls this back and never touches the winner's
        // PENDING rows.
        await tx.transaction.deleteMany({
          where: { batchKey, status: "FAILED" },
        });

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
            chain: bountyById.get(p.bountyId).chain,
            batchKey,
            initiatedBy: req.user.id,
            walletAccount: adminWallet.accountName,
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

    let sendResult;
    try {
      sendResult = await executeZingoQuickSend(paymentList, adminWallet);
    } catch (err) {
      // quicksend only throws before anything is written to the wallet
      // (missing binary, spawn failure, malformed address) — nothing was
      // sent. 503 rather than 500: it's a service precondition, and the
      // request is safe to retry once the wallet setup is fixed.
      await releaseClaim(batchKey, payableIds, err.message);
      return res.status(503).json({
        success: false,
        error: "Payment failed before sending",
        details: err.message,
      });
    }

    if (sendResult.error) {
      console.error("❌ Zingo payment error:", sendResult.error);
      await releaseClaim(batchKey, payableIds, sendResult.error, sendResult.raw);
      return res.status(422).json({
        success: false,
        error: "Payment failed",
        details: sendResult.error,
      });
    }

    if (sendResult.timedOut || sendResult.txids.length === 0) {
      // The send may or may not be on-chain. Keep the bounties in-flight so
      // a retry can't double-pay, record what we saw, and hand the decision
      // to a human (POST /records/:id/resolve) once the wallet history has
      // been checked.
      await prisma.transaction.updateMany({
        where: { batchKey },
        data: {
          status: "UNKNOWN",
          rawResult: sendResult.raw || null,
          errorDetail: sendResult.timedOut
            ? "Timed out waiting for zingo output; the transaction may still have been broadcast"
            : "Zingo produced no recognizable outcome",
        },
      });
      await Promise.all(payableIds.map((id) => invalidateBounty(id)));

      sendRealtimeUpdate(
        "payment_authorized",
        { outcome: "unknown", bountyIds: [], inFlightBountyIds: payableIds, batchKey },
        req.user.id,
      );

      return res.status(502).json({
        success: false,
        outcome: "unknown",
        error: "Payment outcome unknown",
        details:
          "zingo did not confirm the send. The affected bounties are locked against retry — check the wallet's transaction history, then resolve them from the Transactions tab.",
        batchKey,
      });
    }

    // One shielded tx normally covers the whole batch, so every row gets the
    // first txid; the full output stays in rawResult in case zingo split it.
    const txid = sendResult.txids[0];
    const paidAt = new Date();

    await prisma.$transaction([
      prisma.transaction.updateMany({
        where: { batchKey },
        data: {
          status: "BROADCAST",
          txid,
          rawResult: sendResult.raw || null,
          settledAt: paidAt,
        },
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

    // ✅ Broadcast payment result to ALL admins (this is a shared event)
    sendRealtimeUpdate(
      "payment_authorized",
      {
        bountyIds: payableIds,
        txids: sendResult.txids,
        paidCount: payableIds.length,
        skippedCount: skipped.length,
        skipped,
        walletAccountName: adminWallet.accountName,
      },
      req.user.id, // exclude sender since they get the HTTP response
    );

    res.json({
      success: true,
      txids: sendResult.txids,
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

// Manual settlement for sends whose outcome we couldn't observe: UNKNOWN
// after a timeout, or PENDING left behind by a crash mid-send. The admin
// checks the wallet history and tells us what actually happened.
router.post(
  "/records/:id/resolve",
  authenticate,
  isAdmin,
  async (req, res) => {
    try {
      const { outcome, txid } = req.body;

      const record = await prisma.transaction.findUnique({
        where: { id: req.params.id },
      });

      if (!record) {
        return res.status(404).json({ error: "Payment record not found" });
      }
      if (record.status !== "UNKNOWN" && record.status !== "PENDING") {
        return res
          .status(400)
          .json({ error: `Record is already settled (${record.status})` });
      }

      // A PENDING row younger than the send timeout may still settle on its
      // own — don't let a resolve race the in-flight request.
      if (
        record.status === "PENDING" &&
        Date.now() - new Date(record.createdAt).getTime() < 2 * 60 * 1000
      ) {
        return res.status(409).json({
          error:
            "This send may still be in flight — wait a couple of minutes, refresh, then resolve",
        });
      }

      if (outcome === "broadcast") {
        if (typeof txid !== "string" || !/^[0-9a-f]{64}$/i.test(txid.trim())) {
          return res.status(400).json({
            error:
              "A 64-character hex txid from the wallet history is required to resolve as broadcast",
          });
        }

        const settledAt = new Date();
        const [updatedRecord, updatedBounty] = await prisma.$transaction([
          prisma.transaction.update({
            where: { id: record.id },
            data: { status: "BROADCAST", txid: txid.trim().toLowerCase(), settledAt },
          }),
          prisma.bounty.update({
            where: { id: record.bountyId },
            data: {
              isPaid: true,
              paymentAuthorized: true,
              paidAt: settledAt,
              paymentInFlight: false,
            },
            include: {
              createdByUser: {
                select: { id: true, name: true, email: true, role: true, avatar: true },
              },
              assigneeUser: {
                select: { id: true, name: true, email: true, role: true, avatar: true, z_address: true },
              },
            },
          }),
        ]);
        await invalidateBounty(record.bountyId);

        // Peers full-replace their card from this payload; without the txid
        // they would drop the explorer link until the next refetch.
        sendRealtimeUpdate(
          "bounty_marked_paid",
          { ...updatedBounty, paymentTxId: updatedRecord.txid },
          req.user.id,
        );

        return res.json({ success: true, record: serializeTxRecord(updatedRecord) });
      }

      if (outcome === "failed") {
        // Resolving as failed re-opens the bounty for payment; if the send
        // actually broadcast, the next payout is a double-pay. Make the
        // caller say they checked.
        if (req.body.confirm !== true) {
          return res.status(400).json({
            error:
              'Resolving as failed re-opens the bounty for payment. Pass confirm: true after checking the wallet history.',
          });
        }
        const [updatedRecord] = await prisma.$transaction([
          prisma.transaction.update({
            where: { id: record.id },
            data: {
              status: "FAILED",
              settledAt: new Date(),
              errorDetail: "Resolved manually: not found in wallet history",
            },
          }),
          prisma.bounty.update({
            where: { id: record.bountyId },
            data: { paymentInFlight: false },
          }),
        ]);
        await invalidateBounty(record.bountyId);

        sendRealtimeUpdate(
          "payment_authorized",
          { outcome: "released", bountyIds: [], inFlightBountyIds: [record.bountyId] },
          req.user.id,
        );

        return res.json({ success: true, record: serializeTxRecord(updatedRecord) });
      }

      return res
        .status(400)
        .json({ error: 'outcome must be "broadcast" or "failed"' });
    } catch (error) {
      console.error("Error resolving payment record:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

module.exports = router;
