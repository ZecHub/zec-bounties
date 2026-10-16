const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_SUGGESTION_REVIEW_REASON_LENGTH,
  buildSuggestionReviewUpdate,
} = require('../utils/bountySuggestionReview');

describe('buildSuggestionReviewUpdate', () => {
  it('approves a suggestion and activates its delivery workflow', () => {
    assert.deepEqual(
      buildSuggestionReviewUpdate({ action: 'approve', reason: 'Scope confirmed.' }),
      {
        isApproved: true,
        status: 'IN_PROGRESS',
        suggestionReviewStatus: 'APPROVED',
        suggestionReviewReason: 'Scope confirmed.',
      },
    );
  });

  it('declines a suggestion with a visible reason', () => {
    assert.deepEqual(
      buildSuggestionReviewUpdate({ action: 'decline', reason: 'Already covered.' }),
      {
        isApproved: false,
        status: 'CANCELLED',
        suggestionReviewStatus: 'DECLINED',
        suggestionReviewReason: 'Already covered.',
      },
    );
  });

  it('keeps edited suggestions pending and records the reason', () => {
    assert.deepEqual(
      buildSuggestionReviewUpdate({ action: 'edit', reason: 'Clarified deliverables.' }),
      {
        suggestionReviewStatus: 'PENDING',
        suggestionReviewReason: 'Clarified deliverables.',
      },
    );
  });

  it('requires a short, non-empty reason', () => {
    assert.throws(
      () => buildSuggestionReviewUpdate({ action: 'decline', reason: '  ' }),
      /reason is required/i,
    );
    assert.throws(
      () =>
        buildSuggestionReviewUpdate({
          action: 'approve',
          reason: 'x'.repeat(MAX_SUGGESTION_REVIEW_REASON_LENGTH + 1),
        }),
      /500 characters or fewer/i,
    );
  });
});