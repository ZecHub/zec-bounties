const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  validateBountyCreate,
  validateBountyUpdate,
  isNonEmptyString,
  isFinitePositiveNumber,
  isValidFutureDate,
  TITLE_MIN,
  TITLE_MAX,
  DESC_MIN,
  DESC_MAX,
} = require("../helpers/validateBounty");

// ─── Helper unit tests ─────────────────────────────────────────────────────

describe("isNonEmptyString", () => {
  it("returns false for undefined", () => {
    assert.equal(isNonEmptyString(undefined), false);
  });
  it("returns false for null", () => {
    assert.equal(isNonEmptyString(null), false);
  });
  it("returns false for empty string", () => {
    assert.equal(isNonEmptyString(""), false);
  });
  it("returns false for whitespace-only string", () => {
    assert.equal(isNonEmptyString("   "), false);
  });
  it("returns true for a non-empty string", () => {
    assert.equal(isNonEmptyString("hello"), true);
  });
});

describe("isFinitePositiveNumber", () => {
  it("returns false for NaN", () => {
    assert.equal(isFinitePositiveNumber(NaN), false);
  });
  it("returns false for Infinity", () => {
    assert.equal(isFinitePositiveNumber(Infinity), false);
  });
  it("returns false for -Infinity", () => {
    assert.equal(isFinitePositiveNumber(-Infinity), false);
  });
  it("returns false for 0", () => {
    assert.equal(isFinitePositiveNumber(0), false);
  });
  it("returns false for negative numbers", () => {
    assert.equal(isFinitePositiveNumber(-5), false);
  });
  it("returns false for non-numeric strings", () => {
    assert.equal(isFinitePositiveNumber("abc"), false);
  });
  it("returns false for empty string", () => {
    assert.equal(isFinitePositiveNumber(""), false);
  });
  it("returns true for a positive number", () => {
    assert.equal(isFinitePositiveNumber(0.05), true);
  });
  it("returns true for a positive numeric string", () => {
    assert.equal(isFinitePositiveNumber("10.5"), true);
  });
});

describe("isValidFutureDate", () => {
  it("returns false for invalid date string", () => {
    assert.equal(isValidFutureDate("not-a-date"), false);
  });
  it("returns false for a past date", () => {
    assert.equal(isValidFutureDate("2020-01-01"), false);
  });
  it("returns false for null", () => {
    assert.equal(isValidFutureDate(null), false);
  });
  it("returns false for undefined", () => {
    assert.equal(isValidFutureDate(undefined), false);
  });
  it("returns true for a future date", () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    assert.equal(isValidFutureDate(future), true);
  });
  it("returns true for a future ISO string", () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    assert.equal(isValidFutureDate(future.toISOString()), true);
  });
});

// ─── Create validation ─────────────────────────────────────────────────────

describe("validateBountyCreate", () => {
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const validPayload = {
    title: "Fix the login page",
    description: "The login page crashes when the user enters an invalid email address. Fix this.",
    bountyAmount: 0.05,
    timeToComplete: futureDate,
  };

  it("accepts a valid payload", () => {
    const result = validateBountyCreate(validPayload);
    assert.deepStrictEqual(result, { valid: true });
  });

  // Title
  it("rejects missing title", () => {
    const result = validateBountyCreate({ ...validPayload, title: undefined });
    assert.equal(result.valid, false);
    assert.match(result.error, /title/i);
  });
  it("rejects empty title", () => {
    const result = validateBountyCreate({ ...validPayload, title: "" });
    assert.equal(result.valid, false);
  });
  it("rejects whitespace-only title", () => {
    const result = validateBountyCreate({ ...validPayload, title: "   " });
    assert.equal(result.valid, false);
  });
  it("rejects title shorter than minimum", () => {
    const result = validateBountyCreate({ ...validPayload, title: "ab" });
    assert.equal(result.valid, false);
    assert.match(result.error, new RegExp(String(TITLE_MIN)));
  });
  it("rejects title longer than maximum", () => {
    const result = validateBountyCreate({ ...validPayload, title: "a".repeat(TITLE_MAX + 1) });
    assert.equal(result.valid, false);
    assert.match(result.error, new RegExp(String(TITLE_MAX)));
  });

  // Description
  it("rejects missing description", () => {
    const result = validateBountyCreate({ ...validPayload, description: undefined });
    assert.equal(result.valid, false);
    assert.match(result.error, /description/i);
  });
  it("rejects empty description", () => {
    const result = validateBountyCreate({ ...validPayload, description: "" });
    assert.equal(result.valid, false);
  });
  it("rejects description shorter than minimum", () => {
    const result = validateBountyCreate({ ...validPayload, description: "short" });
    assert.equal(result.valid, false);
    assert.match(result.error, new RegExp(String(DESC_MIN)));
  });
  it("rejects description longer than maximum", () => {
    const result = validateBountyCreate({ ...validPayload, description: "a".repeat(DESC_MAX + 1) });
    assert.equal(result.valid, false);
    assert.match(result.error, new RegExp(String(DESC_MAX)));
  });

  // Bounty amount
  it("rejects missing bountyAmount", () => {
    const result = validateBountyCreate({ ...validPayload, bountyAmount: undefined });
    assert.equal(result.valid, false);
    assert.match(result.error, /amount/i);
  });
  it("rejects zero bountyAmount", () => {
    const result = validateBountyCreate({ ...validPayload, bountyAmount: 0 });
    assert.equal(result.valid, false);
  });
  it("rejects negative bountyAmount", () => {
    const result = validateBountyCreate({ ...validPayload, bountyAmount: -1 });
    assert.equal(result.valid, false);
  });
  it("rejects NaN bountyAmount", () => {
    const result = validateBountyCreate({ ...validPayload, bountyAmount: NaN });
    assert.equal(result.valid, false);
  });
  it("rejects Infinity bountyAmount", () => {
    const result = validateBountyCreate({ ...validPayload, bountyAmount: Infinity });
    assert.equal(result.valid, false);
  });
  it("rejects non-numeric string bountyAmount", () => {
    const result = validateBountyCreate({ ...validPayload, bountyAmount: "abc" });
    assert.equal(result.valid, false);
  });
  it("rejects empty string bountyAmount", () => {
    const result = validateBountyCreate({ ...validPayload, bountyAmount: "" });
    assert.equal(result.valid, false);
  });

  // Deadline
  it("rejects missing timeToComplete", () => {
    const result = validateBountyCreate({ ...validPayload, timeToComplete: undefined });
    assert.equal(result.valid, false);
    assert.match(result.error, /deadline/i);
  });
  it("rejects invalid date string", () => {
    const result = validateBountyCreate({ ...validPayload, timeToComplete: "not-a-date" });
    assert.equal(result.valid, false);
  });
  it("rejects past date", () => {
    const result = validateBountyCreate({ ...validPayload, timeToComplete: "2020-01-01" });
    assert.equal(result.valid, false);
    assert.match(result.error, /future/i);
  });
});

// ─── Update validation ─────────────────────────────────────────────────────

describe("validateBountyUpdate", () => {
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  it("accepts empty body (no fields to validate)", () => {
    const result = validateBountyUpdate({});
    assert.deepStrictEqual(result, { valid: true });
  });

  it("accepts valid partial update with title only", () => {
    const result = validateBountyUpdate({ title: "Updated title" });
    assert.deepStrictEqual(result, { valid: true });
  });

  it("accepts valid partial update with all fields", () => {
    const result = validateBountyUpdate({
      title: "Updated title",
      description: "This is a sufficiently long description for testing.",
      bountyAmount: 1.5,
      timeToComplete: futureDate,
    });
    assert.deepStrictEqual(result, { valid: true });
  });

  // Title
  it("rejects empty title when provided", () => {
    const result = validateBountyUpdate({ title: "" });
    assert.equal(result.valid, false);
  });
  it("rejects whitespace-only title when provided", () => {
    const result = validateBountyUpdate({ title: "  " });
    assert.equal(result.valid, false);
  });
  it("rejects too-short title when provided", () => {
    const result = validateBountyUpdate({ title: "ab" });
    assert.equal(result.valid, false);
  });

  // Description
  it("rejects empty description when provided", () => {
    const result = validateBountyUpdate({ description: "" });
    assert.equal(result.valid, false);
  });
  it("rejects too-short description when provided", () => {
    const result = validateBountyUpdate({ description: "short" });
    assert.equal(result.valid, false);
  });

  // Bounty amount
  it("rejects zero bountyAmount when provided", () => {
    const result = validateBountyUpdate({ bountyAmount: 0 });
    assert.equal(result.valid, false);
  });
  it("rejects negative bountyAmount when provided", () => {
    const result = validateBountyUpdate({ bountyAmount: -5 });
    assert.equal(result.valid, false);
  });
  it("rejects NaN bountyAmount when provided", () => {
    const result = validateBountyUpdate({ bountyAmount: "not-a-number" });
    assert.equal(result.valid, false);
  });

  // Deadline
  it("rejects past date when provided", () => {
    const result = validateBountyUpdate({ timeToComplete: "2020-06-15" });
    assert.equal(result.valid, false);
  });
  it("rejects invalid date string when provided", () => {
    const result = validateBountyUpdate({ timeToComplete: "garbage" });
    assert.equal(result.valid, false);
  });

  // Ignores fields it doesn't own
  it("ignores unrelated fields like chain or teamId", () => {
    const result = validateBountyUpdate({ chain: "MAIN", teamId: "some-id" });
    assert.deepStrictEqual(result, { valid: true });
  });
});
