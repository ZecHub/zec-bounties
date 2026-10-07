const MAX_SUGGESTION_REVIEW_REASON_LENGTH = 500;

function buildSuggestionReviewUpdate({ action, reason }) {
  if (!["approve", "edit", "decline"].includes(action)) {
    throw new Error("Invalid suggestion review action");
  }

  if (typeof reason !== 'string' || !reason.trim()) {
    throw new Error("A review reason is required");
  }

  const reviewReason = reason.trim();
  if (reviewReason.length > MAX_SUGGESTION_REVIEW_REASON_LENGTH) {
    throw new Error(
      `Review reason must be ${MAX_SUGGESTION_REVIEW_REASON_LENGTH} characters or fewer`,
    );
  }

  if (action === "approve") {
    return {
      isApproved: true,
      status: "IN_PROGRESS",
      suggestionReviewStatus: "APPROVED",
      suggestionReviewReason: reviewReason,
    };
  }

  if (action === "decline") {
    return {
      isApproved: false,
      status: "CANCELLED",
      suggestionReviewStatus: "DECLINED",
      suggestionReviewReason: reviewReason,
    };
  }

  return {
    suggestionReviewStatus: "PENDING",
    suggestionReviewReason: reviewReason,
  };
}

module.exports = {
  MAX_SUGGESTION_REVIEW_REASON_LENGTH,
  buildSuggestionReviewUpdate,
};