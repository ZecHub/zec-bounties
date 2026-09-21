/**
 * Shared server-side validation for bounty create and edit operations.
 *
 * `validateBountyCreate`  — checks all required fields on POST /api/bounties.
 * `validateBountyUpdate`  — checks only the fields present in req.body on PUT /api/bounties/:id.
 * `validateCategory`      — confirms that a categoryId exists in bounty_categories.
 *
 * Every function returns `{ valid: true }` or `{ valid: false, error: string }`.
 */

// ─── Limits ──────────────────────────────────────────────────────────────────
const TITLE_MIN = 3;
const TITLE_MAX = 200;
const DESC_MIN = 10;
const DESC_MAX = 10000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isFinitePositiveNumber(value) {
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) && n > 0;
}

function isValidFutureDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return !isNaN(d.getTime()) && d.getTime() > Date.now();
}

// ─── Create validation ──────────────────────────────────────────────────────

function validateBountyCreate({ title, description, bountyAmount, timeToComplete }) {
  // Title
  if (!isNonEmptyString(title)) {
    return { valid: false, error: "Title is required" };
  }
  const trimmedTitle = title.trim();
  if (trimmedTitle.length < TITLE_MIN) {
    return {
      valid: false,
      error: `Title must be at least ${TITLE_MIN} characters`,
    };
  }
  if (trimmedTitle.length > TITLE_MAX) {
    return {
      valid: false,
      error: `Title must be at most ${TITLE_MAX} characters`,
    };
  }

  // Description
  if (!isNonEmptyString(description)) {
    return { valid: false, error: "Description is required" };
  }
  const trimmedDesc = description.trim();
  if (trimmedDesc.length < DESC_MIN) {
    return {
      valid: false,
      error: `Description must be at least ${DESC_MIN} characters`,
    };
  }
  if (trimmedDesc.length > DESC_MAX) {
    return {
      valid: false,
      error: `Description must be at most ${DESC_MAX} characters`,
    };
  }

  // Bounty amount
  if (bountyAmount === undefined || bountyAmount === null || bountyAmount === "") {
    return { valid: false, error: "Bounty amount is required" };
  }
  if (!isFinitePositiveNumber(bountyAmount)) {
    return {
      valid: false,
      error: "Bounty amount must be a finite positive number",
    };
  }

  // Deadline
  if (!timeToComplete) {
    return { valid: false, error: "Completion deadline is required" };
  }
  if (!isValidFutureDate(timeToComplete)) {
    return {
      valid: false,
      error: "Completion deadline must be a valid future date",
    };
  }

  return { valid: true };
}

// ─── Update validation (partial — only checks fields that are present) ──────

function validateBountyUpdate(body) {
  // Title (only if provided)
  if (body.title !== undefined) {
    if (!isNonEmptyString(body.title)) {
      return { valid: false, error: "Title cannot be empty" };
    }
    const trimmedTitle = body.title.trim();
    if (trimmedTitle.length < TITLE_MIN) {
      return {
        valid: false,
        error: `Title must be at least ${TITLE_MIN} characters`,
      };
    }
    if (trimmedTitle.length > TITLE_MAX) {
      return {
        valid: false,
        error: `Title must be at most ${TITLE_MAX} characters`,
      };
    }
  }

  // Description (only if provided)
  if (body.description !== undefined) {
    if (!isNonEmptyString(body.description)) {
      return { valid: false, error: "Description cannot be empty" };
    }
    const trimmedDesc = body.description.trim();
    if (trimmedDesc.length < DESC_MIN) {
      return {
        valid: false,
        error: `Description must be at least ${DESC_MIN} characters`,
      };
    }
    if (trimmedDesc.length > DESC_MAX) {
      return {
        valid: false,
        error: `Description must be at most ${DESC_MAX} characters`,
      };
    }
  }

  // Bounty amount (only if provided)
  if (body.bountyAmount !== undefined) {
    if (!isFinitePositiveNumber(body.bountyAmount)) {
      return {
        valid: false,
        error: "Bounty amount must be a finite positive number",
      };
    }
  }

  // Deadline (only if provided)
  if (body.timeToComplete !== undefined) {
    if (!isValidFutureDate(body.timeToComplete)) {
      return {
        valid: false,
        error: "Completion deadline must be a valid future date",
      };
    }
  }

  return { valid: true };
}

// ─── Category validation (requires prisma instance) ─────────────────────────

async function validateCategory(prisma, categoryId) {
  if (!categoryId) return { valid: true }; // optional

  const category = await prisma.bountyCategory.findUnique({
    where: { name: categoryId },
  });
  if (!category) {
    return {
      valid: false,
      error: `Category "${categoryId}" does not exist`,
    };
  }
  return { valid: true };
}

module.exports = {
  validateBountyCreate,
  validateBountyUpdate,
  validateCategory,
  // Exported for testing
  isNonEmptyString,
  isFinitePositiveNumber,
  isValidFutureDate,
  TITLE_MIN,
  TITLE_MAX,
  DESC_MIN,
  DESC_MAX,
};
