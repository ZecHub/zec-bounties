const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  validateBountyCreate,
  validateBountyUpdate,
  validateCategory,
  isValidFutureDate,
} = require("../helpers/validateBounty");

describe("isValidFutureDate strict type checks", () => {
  it("rejects arrays, plain objects, booleans, whitespace, and non-finite numbers", () => {
    for (const bad of [
      [2099],
      [2099, 1, 1],
      { valueOf: () => Date.now() + 86400_000 },
      true,
      false,
      "",
      "   ",
      Infinity,
      -Infinity,
      NaN,
    ]) {
      assert.equal(isValidFutureDate(bad), false, `expected false for ${JSON.stringify(bad)}`);
    }
  });

  it("accepts future Date objects, ISO strings, and epoch millisecond numbers", () => {
    const futureMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
    assert.equal(isValidFutureDate(futureMs), true);
    assert.equal(isValidFutureDate(new Date(futureMs)), true);
    assert.equal(isValidFutureDate(new Date(futureMs).toISOString()), true);
  });
});

describe("validateBountyCreate / validateBountyUpdate non-object guards", () => {
  it("returns validation error instead of throwing on null/undefined/array payloads", () => {
    for (const bad of [null, undefined, [], "string", 42]) {
      const c = validateBountyCreate(bad);
      assert.equal(c.valid, false);
      assert.match(c.error, /object/i);

      const u = validateBountyUpdate(bad);
      assert.equal(u.valid, false);
      assert.match(u.error, /object/i);
    }
  });
});

describe("validateCategory whitespace handling", () => {
  it("treats whitespace-only categoryId as optional without querying Prisma", async () => {
    let queried = false;
    const prisma = {
      bountyCategory: {
        findUnique: async () => {
          queried = true;
          return null;
        },
      },
    };

    assert.deepEqual(await validateCategory(prisma, "   "), { valid: true });
    assert.deepEqual(await validateCategory(prisma, ""), { valid: true });
    assert.deepEqual(await validateCategory(prisma, null), { valid: true });
    assert.deepEqual(await validateCategory(prisma, undefined), { valid: true });
    assert.equal(queried, false);
  });

  it("trims surrounding whitespace before querying Prisma and rejects unknown categories", async () => {
    const queriedNames = [];
    const prisma = {
      bountyCategory: {
        findUnique: async ({ where }) => {
          queriedNames.push(where.name);
          return where.name === "Design" ? { name: "Design" } : null;
        },
      },
    };

    assert.deepEqual(await validateCategory(prisma, "  Design  "), { valid: true });
    assert.deepEqual(queriedNames, ["Design"]);

    const missing = await validateCategory(prisma, "  UnknownCat  ");
    assert.equal(missing.valid, false);
    assert.equal(missing.error, 'Category "UnknownCat" does not exist');

    const badType = await validateCategory(prisma, 123);
    assert.equal(badType.valid, false);
  });
});
