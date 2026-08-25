const { PrismaClient } = require("@prisma/client");
const { randomUUID } = require("crypto");

const prisma = new PrismaClient();

async function main() {
  try {
    const wallets = await prisma.zcashParams.findMany({
      where: {
        walletId: null,
      },
      select: {
        id: true,
        accountName: true,
      },
    });

    console.log(`Found ${wallets.length} wallets without walletId`);

    for (const wallet of wallets) {
      await prisma.zcashParams.update({
        where: {
          id: wallet.id,
        },
        data: {
          walletId: randomUUID(),
        },
      });

      console.log(
        `Assigned walletId to "${wallet.accountName}" (id: ${wallet.id})`,
      );
    }

    console.log("Migration completed successfully.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
