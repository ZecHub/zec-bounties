const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Resolves which ZcashParams record should be used to pay out a bounty,
 * based on who created the bounty and their account type.
 *
 * Rules:
 *  - ADMIN creator      → their isDefault = true zcashParams
 *  - isManOfSteel user  → their accountName = "ManOfSteel" zcashParams
 *  - Regular user       → their first/only zcashParams (fallback: "Main")
 *
 * @param {string} bountyId
 * @returns {Promise<object>} The resolved ZcashParams record
 */
async function resolvePayingWallet(bountyId) {
  const bounty = await prisma.bounty.findUnique({
    where: { id: bountyId },
    include: {
      createdByUser: {
        select: {
          id: true,
          role: true,
          isManOfSteel: true,
        },
      },
    },
  });

  if (!bounty) throw new Error(`Bounty ${bountyId} not found`);

  const creator = bounty.createdByUser;
  if (!creator) throw new Error(`Bounty ${bountyId} has no creator`);

  let params = null;

  if (creator.role === "ADMIN") {
    // Admin: use their explicitly flagged default account
    params = await prisma.zcashParams.findFirst({
      where: {
        ownerId: creator.id,
        isDefault: true,
      },
    });

    if (!params) {
      throw new Error(
        `Admin ${creator.id} has no default ZcashParams set. ` +
          `Please mark one account as default before authorizing payments.`,
      );
    }
  } else if (creator.isManOfSteel) {
    // Man of Steel user: use their special named account
    params = await prisma.zcashParams.findFirst({
      where: {
        ownerId: creator.id,
        accountName: "ManOfSteel",
      },
    });

    if (!params) {
      throw new Error(
        `User ${creator.id} is marked isManOfSteel but has no "ManOfSteel" ` +
          `ZcashParams account. Please import the wallet first.`,
      );
    }
  } else {
    // Regular client: prefer "Main", fall back to whichever account they have
    params = await prisma.zcashParams.findFirst({
      where: {
        ownerId: creator.id,
        accountName: "Main",
      },
    });

    // Fallback: just grab their first account if no "Main" exists
    if (!params) {
      params = await prisma.zcashParams.findFirst({
        where: { ownerId: creator.id },
        orderBy: { createdAt: "asc" },
      });
    }

    if (!params) {
      throw new Error(
        `User ${creator.id} has no ZcashParams configured. ` +
          `They must set up a wallet before their bounties can be paid.`,
      );
    }
  }

  return params;
}

module.exports = { resolvePayingWallet };
