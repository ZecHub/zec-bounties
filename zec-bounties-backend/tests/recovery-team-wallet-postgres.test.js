const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

// Integration test for the fix in POST /auth/recovery/verify-otp: the wallet
// lookup must be scoped to the caller's PERSONAL wallets (teamId: null) so a
// team wallet copy (which every member is synced, pointing at the shared team
// wallet dir) can never be resolved and have its seed returned.
//
// Runs against a disposable Postgres database carrying the Prisma schema.
const databaseUrl = process.env.TEST_DATABASE_URL;

test(
  "recovery lookup never resolves a team wallet copy",
  {
    skip:
      !databaseUrl &&
      "Set TEST_DATABASE_URL to a disposable database with the Prisma schema",
  },
  async (t) => {
    const { PrismaClient } = require("@prisma/client");
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    const id = randomUUID();
    const memberId = `rec-member-${id}`;
    const accountName = "TeamPayouts";
    const sharedWalletId = `shared-team-wallet-${id}`;
    let teamId;

    // The exact lookup verify-otp runs after OTP verification.
    const lookup = () =>
      db.zcashParams.findFirst({
        where: { accountName, ownerId: memberId, teamId: null },
        select: { walletId: true },
      });

    try {
      await db.user.create({
        data: { id: memberId, name: "Recovery member", role: "HUNTER" },
      });
      const team = await db.team.create({
        data: { name: `Recovery team ${id}`, isVerified: true },
      });
      teamId = team.id;

      // The member's SYNCED team-wallet copy: owned by the member, pointing at
      // the shared team wallet directory (what syncWalletToMembers writes).
      await db.zcashParams.create({
        data: {
          ownerId: memberId,
          accountName,
          walletId: sharedWalletId,
          chain: "mainnet",
          serverUrl: "https://zec.rocks:443",
          isTeam: true,
          teamId,
          isDefault: true,
        },
      });

      await t.test("a member's team wallet copy is not recoverable", async () => {
        // Demonstrate the bug: the PRE-fix lookup (ownerId only, no teamId
        // filter) resolves the shared team wallet copy — that is the row whose
        // seed verify-otp used to return to any member.
        const preFix = await db.zcashParams.findFirst({
          where: { accountName, ownerId: memberId },
          select: { walletId: true, isTeam: true },
        });
        assert.ok(
          preFix && preFix.isTeam && preFix.walletId === sharedWalletId,
          "pre-fix lookup would resolve the shared team wallet",
        );

        // The fix: scoping to teamId:null excludes it, so no seed is reachable.
        assert.equal(
          await lookup(),
          null,
          "team wallet copy must be excluded from personal recovery",
        );
      });

      await t.test(
        "a genuine personal wallet of the same name is still recoverable",
        async () => {
          await db.zcashParams.create({
            data: {
              ownerId: memberId,
              accountName,
              walletId: `personal-wallet-${id}`,
              chain: "mainnet",
              serverUrl: "https://zec.rocks:443",
              isTeam: false,
              teamId: null,
            },
          });

          const found = await lookup();
          assert.ok(found, "personal wallet must be recoverable");
          assert.notEqual(
            found.walletId,
            sharedWalletId,
            "must never resolve to the shared team wallet dir",
          );
        },
      );
    } finally {
      await db.zcashParams.deleteMany({ where: { ownerId: memberId } });
      if (teamId) {
        await db.team.deleteMany({ where: { id: teamId } }).catch(() => {});
      }
      await db.user.deleteMany({ where: { id: memberId } }).catch(() => {});
      await db.$disconnect();
    }
  },
);
