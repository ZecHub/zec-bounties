const { PrismaClient } = require("@prisma/client");
const executeZingoParseAddres = require("../utils/zingoLibParseAddress.js");
const { resolvePayingWallet } = require("./zcash/resolvePayingWallet");

const prisma = new PrismaClient();

async function findDueBounties() {
  const dueBounties = await prisma.bounty.findMany({
    where: {
      AND: [{ status: "DONE" }, { isPaid: false }],
    },
  });

  return dueBounties;
}

async function buildPaymentList(bounties) {
  const results = [];
  let totalZecAmount = 0;

  for (const bounty of bounties) {
    if (!bounty.assignee) continue;

    const user = await prisma.user.findUnique({
      where: { id: bounty.assignee },
      select: { z_address: true },
    });

    if (!user?.z_address) continue;

    // Add to total before converting to zatoshis
    totalZecAmount += bounty.bountyAmount;

    const zatoshis = Math.round(bounty.bountyAmount * 1e8);

    results.push({
      address: user.z_address,
      amount: zatoshis,
      memo: `Bounty payment for ${bounty.title}`,
    });
  }

  return {
    paymentList: results,
    totalZecAmount: totalZecAmount,
  };
}

/**
 * Builds a map of walletParams → payments[].
 * Each entry represents one wallet that needs to send one or more payments.
 *
 * @param {Array} dueBounties - Bounties returned by findDueBounties()
 * @returns {Promise<Array<{ walletParams: object, payments: Array }>>}
 */
async function buildPaymentListGrouped(dueBounties) {
  // Map: zcashParamsId → { walletParams, payments[] }
  const walletMap = new Map();

  for (const bounty of dueBounties) {
    if (!bounty.assigneeUser?.z_address) {
      console.log(bounty);
      console.warn(`Skipping bounty ${bounty.id} — assignee has no z_address`);
      continue;
    }

    let walletParams;
    try {
      walletParams = await resolvePayingWallet(bounty.createdBy);
    } catch (err) {
      console.error(
        `Skipping bounty ${bounty.id} — wallet resolution failed: ${err.message}`,
      );
      continue;
    }

    const key = walletParams.id;

    if (!walletMap.has(key)) {
      walletMap.set(key, { walletParams, payments: [] });
    }

    walletMap.get(key).payments.push({
      address: bounty.assigneeUser.z_address,
      amount: bounty.bountyAmount,
      memo: `Bounty: ${bounty.title} (ID: ${bounty.id})`,
      bountyId: bounty.id,
    });
  }

  return Array.from(walletMap.values());
}

async function updateDueBounties() {
  // First, find the bounties that need to be updated
  const updateBounties = await prisma.bounty.findMany({
    where: {
      AND: [{ status: "DONE" }, { isPaid: false }],
    },
  });

  console.log("Due bounties:", updateBounties);

  // Update all found bounties to mark them as paid
  if (updateBounties.length > 0) {
    const updateResult = await prisma.bounty.updateMany({
      where: {
        AND: [{ status: "DONE" }, { isPaid: false }],
      },
      data: {
        isPaid: true,
        paymentAuthorized: true,
        paidAt: new Date(), // Optional: track when payment was marked
      },
    });

    console.log(`Updated ${updateResult.count} bounties to paid status`);

    return {
      foundBounties: updateBounties,
      updatedCount: updateResult.count,
    };
  }

  console.log("No bounties to update");
  return {
    foundBounties: updateBounties,
    updatedCount: 0,
  };
}

// Add this function to store transactions
async function storeTransactions(txHashes, totalAmount) {
  const transactions = [];

  // for (const txHash of txHashes) {
  try {
    const transaction = await prisma.transaction.create({
      data: {
        txHash: txHashes,
        amount: totalAmount,
      },
    });
    transactions.push(transaction);
  } catch (error) {
    console.error(`Failed to store transaction ${txHashes}:`, error);
  }
  // }

  return transactions;
}

async function verifyZaddress(z_address, params) {
  const state = await executeZingoParseAddres(z_address, params);

  console.log(state);
  try {
    const result = state[1] || state;
    if (
      result.status === "success" &&
      result.chain_name + "net" === "testnet"
      // &&
      // result.address_kind === "sapling"
    ) {
      return true;
    } else {
      return false;
    }
  } catch {
    return null;
  }
  // return true;
}

module.exports = {
  buildPaymentList,
  findDueBounties,
  verifyZaddress,
  updateDueBounties,
  storeTransactions,
  buildPaymentListGrouped,
};
