/**
 * Pagination helpers for the bounty list.
 *
 * Extracted as a pure function so the "is there another page?" decision can be
 * unit-tested without React, and so the reset vs. append cases are explicit.
 */

export interface HasMoreBountiesInput {
  /** True when the list was just replaced (page 1), false when appending. */
  reset: boolean;
  /** Length of the list BEFORE this fetch was applied (the stale closure value). */
  previousCount: number;
  /** Number of items returned by this page. */
  incomingCount: number;
  /** Total number of bounties reported by the backend for this query. */
  total: number;
  /** Page size requested from the backend. */
  pageSize: number;
}

/**
 * Whether more bounties remain to load after the current fetch.
 *
 * The count of what is now loaded depends on whether the list was reset:
 *   - reset  -> the visible list is exactly this page, so loaded = incomingCount.
 *   - append -> this page was added to the previous list, so
 *               loaded = previousCount + incomingCount.
 *
 * Using previousCount + incomingCount in BOTH cases was the bug: after a
 * refresh (reset) it added the pre-refresh length to the first page, e.g.
 * 20 + 10 = 30 against a total of 25, so "has more" was false and the list
 * could no longer be scrolled past page 1.
 *
 * A short final page (incomingCount < pageSize) also means there is nothing
 * more to load, which additionally makes empty results (incomingCount === 0)
 * settle to false.
 */
export function computeHasMoreBounties({
  reset,
  previousCount,
  incomingCount,
  total,
  pageSize,
}: HasMoreBountiesInput): boolean {
  const loadedCount = reset ? incomingCount : previousCount + incomingCount;
  return incomingCount === pageSize && loadedCount < total;
}
