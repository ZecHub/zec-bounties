const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { randomUUID } = require("node:crypto");

// Integration test for the recovery step in utils/payoutRecovery.js, which
// runs a send timeout after the server starts: it must move to UNKNOWN only
// the PENDING payout records an earlier process left behind, however recent.
// A record this process claimed is never touched, nor is a settled one.
//
// Runs against a disposable Postgres database carrying the Prisma schema.
const databaseUrl = process.env.TEST_DATABASE_URL;

test(
  "start-up recovery picks only PENDING records claimed before the start",
  {
    skip:
      !databaseUrl &&
      "Set TEST_DATABASE_URL to a disposable database with the Prisma schema",
  },
  async () => {
    const { PrismaClient } = require("@prisma/client");
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    // The module uses the app's shared client; hand it this one.
    const clientFile = require.resolve(path.join("..", "prisma", "client.js"));
    require.cache[clientFile] = {
      id: clientFile,
      filename: clientFile,
      loaded: true,
      exports: db,
    };
    console.warn = () => {};
    const {
      bootedAt,
      recoverInterruptedPayouts,
    } = require("../utils/payoutRecovery");

    const id = randomUUID();
    const userId = `recovery-${id}`;
    const at = (ms) => new Date(bootedAt.getTime() + ms);

    try {
      await db.user.create({
        data: { id: userId, name: "Recovery test", role: "HUNTER" },
      });
      const bounty = await db.bounty.create({
        data: {
          title: "Recovery fixture",
          description: "Fixture",
          bountyAmount: 0.01,
          timeToComplete: new Date("2099-01-01"),
          createdBy: userId,
          paymentInFlight: true,
        },
      });

      const rows = {
        oldBeforeStart: { status: "PENDING", createdAt: at(-10 * 60 * 1000) },
        recentBeforeStart: { status: "PENDING", createdAt: at(-1000) },
        afterStart: { status: "PENDING", createdAt: at(1000) },
        settled: { status: "BROADCAST", createdAt: at(-10 * 60 * 1000) },
        alreadyUnknown: {
          status: "UNKNOWN",
          errorDetail: "Timed out waiting for zingo output",
          createdAt: at(-10 * 60 * 1000),
        },
      };
      const ids = {};
      for (const [name, row] of Object.entries(rows)) {
        const created = await db.transaction.create({
          data: {
            bountyId: bounty.id,
            amountZat: 1000n,
            toAddress: "u1recipient",
            memo: name,
            batchKey: `${id}-${name}`,
            chain: "MAIN",
            initiatedBy: userId,
            walletAccount: "Main",
            ...row,
          },
        });
        ids[name] = created.id;
      }
      const statusOf = async (name) =>
        (await db.transaction.findUnique({ where: { id: ids[name] } })).status;

      await recoverInterruptedPayouts();
      assert.equal(await statusOf("oldBeforeStart"), "UNKNOWN");
      assert.equal(await statusOf("recentBeforeStart"), "UNKNOWN");
      const recovered = await db.transaction.findUnique({
        where: { id: ids.oldBeforeStart },
      });
      assert.match(recovered.errorDetail, /restarted during the send/);

      // This process's own claim, the settled record and the record already
      // waiting for an admin are left alone.
      assert.equal(await statusOf("afterStart"), "PENDING");
      assert.equal(await statusOf("settled"), "BROADCAST");
      const unknown = await db.transaction.findUnique({
        where: { id: ids.alreadyUnknown },
      });
      assert.equal(unknown.errorDetail, "Timed out waiting for zingo output");

      // Recovery never unlocks the bounty; an admin resolves each record.
      const after = await db.bounty.findUnique({ where: { id: bounty.id } });
      assert.equal(after.paymentInFlight, true);
      assert.equal(after.isPaid, false);
    } finally {
      await db.transaction.deleteMany({
        where: { batchKey: { startsWith: id } },
      });
      await db.bounty.deleteMany({ where: { createdBy: userId } });
      await db.user.deleteMany({ where: { id: userId } }).catch(() => {});
      await db.$disconnect();
    }
  },
);
