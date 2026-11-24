const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolvePayingWallet,
} = require("../helpers/zcash/resolvePayingWallet");

function createFakePrisma({ bounty, paramsByMatcher }) {
  const queries = [];
  return {
    queries,
    bounty: {
      async findUnique(args) {
        queries.push({ model: "bounty", args });
        return typeof bounty === "function" ? bounty(args) : bounty;
      },
    },
    zcashParams: {
      async findFirst(args) {
        queries.push({ model: "zcashParams", args });
        return paramsByMatcher ? paramsByMatcher(args) : null;
      },
    },
  };
}

test("resolvePayingWallet: rejects empty or non-string bountyId before querying DB", async () => {
  const prisma = createFakePrisma({ bounty: null });
  for (const invalidId of [undefined, null, "", "   ", 123, {}]) {
    await assert.rejects(
      () => resolvePayingWallet(invalidId, prisma),
      /bountyId must be a non-empty string/,
    );
  }
  assert.equal(prisma.queries.length, 0);
});

test("resolvePayingWallet: trims bountyId and resolves ADMIN default wallet", async () => {
  const expectedWallet = { id: "w-admin", accountName: "Treasury", isDefault: true };
  const prisma = createFakePrisma({
    bounty: {
      id: "bounty-1",
      createdByUser: { id: "admin-1", role: "ADMIN", isManOfSteel: false },
    },
    paramsByMatcher: ({ where }) =>
      where.ownerId === "admin-1" && where.isDefault === true
        ? expectedWallet
        : null,
  });

  const wallet = await resolvePayingWallet("  bounty-1  ", prisma);
  assert.deepEqual(wallet, expectedWallet);
  assert.equal(prisma.queries[0].args.where.id, "bounty-1");
});

test("resolvePayingWallet: resolves ManOfSteel wallet and rejects when missing", async () => {
  const mosWallet = { id: "w-mos", accountName: "ManOfSteel" };
  const prismaOk = createFakePrisma({
    bounty: {
      id: "bounty-2",
      createdByUser: { id: "user-mos", role: "CLIENT", isManOfSteel: true },
    },
    paramsByMatcher: ({ where }) =>
      where.ownerId === "user-mos" && where.accountName === "ManOfSteel"
        ? mosWallet
        : null,
  });

  assert.deepEqual(await resolvePayingWallet("bounty-2", prismaOk), mosWallet);

  const prismaMissing = createFakePrisma({
    bounty: {
      id: "bounty-2",
      createdByUser: { id: "user-mos", role: "CLIENT", isManOfSteel: true },
    },
    paramsByMatcher: () => null,
  });
  await assert.rejects(
    () => resolvePayingWallet("bounty-2", prismaMissing),
    /has no "ManOfSteel" ZcashParams account/,
  );
});

test("resolvePayingWallet: prefers Main wallet for regular users and falls back to earliest account", async () => {
  const mainWallet = { id: "w-main", accountName: "Main" };
  const prismaMain = createFakePrisma({
    bounty: {
      id: "bounty-3",
      createdByUser: { id: "user-1", role: "CLIENT", isManOfSteel: false },
    },
    paramsByMatcher: ({ where }) =>
      where.accountName === "Main" ? mainWallet : null,
  });
  assert.deepEqual(await resolvePayingWallet("bounty-3", prismaMain), mainWallet);

  const earliestWallet = { id: "w-first", accountName: "Custom" };
  const prismaFallback = createFakePrisma({
    bounty: {
      id: "bounty-4",
      createdByUser: { id: "user-2", role: "CLIENT", isManOfSteel: false },
    },
    paramsByMatcher: ({ where, orderBy }) =>
      where.accountName === undefined && orderBy?.createdAt === "asc"
        ? earliestWallet
        : null,
  });
  assert.deepEqual(
    await resolvePayingWallet("bounty-4", prismaFallback),
    earliestWallet,
  );
});

test("resolvePayingWallet: throws descriptive errors for missing bounty, missing creator, and missing admin/regular wallet", async () => {
  await assert.rejects(
    () => resolvePayingWallet("missing-b", createFakePrisma({ bounty: null })),
    /Bounty missing-b not found/,
  );

  await assert.rejects(
    () =>
      resolvePayingWallet(
        "orphan-b",
        createFakePrisma({ bounty: { id: "orphan-b", createdByUser: null } }),
      ),
    /Bounty orphan-b has no creator/,
  );

  await assert.rejects(
    () =>
      resolvePayingWallet(
        "admin-b",
        createFakePrisma({
          bounty: {
            id: "admin-b",
            createdByUser: { id: "admin-2", role: "ADMIN", isManOfSteel: false },
          },
          paramsByMatcher: () => null,
        }),
      ),
    /Admin admin-2 has no default ZcashParams set/,
  );

  await assert.rejects(
    () =>
      resolvePayingWallet(
        "client-b",
        createFakePrisma({
          bounty: {
            id: "client-b",
            createdByUser: { id: "client-9", role: "CLIENT", isManOfSteel: false },
          },
          paramsByMatcher: () => null,
        }),
      ),
    /User client-9 has no ZcashParams configured/,
  );
});
