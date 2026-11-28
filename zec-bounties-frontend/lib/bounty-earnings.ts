type EarningDateFields = {
  paidAt?: Date | string | null;
  exportedAt?: Date | string | null;
  dateCreated?: Date | string | null;
  createdAt?: Date | string | null;
};

// Earnings are counted when the bounty was paid on-platform or exported for
// an off-platform payout. Creation is only a fallback for legacy rows.
export function bountyEarningDate(bounty: EarningDateFields): Date | null {
  for (const raw of [
    bounty.paidAt,
    bounty.exportedAt,
    bounty.dateCreated,
    bounty.createdAt,
  ]) {
    if (!raw) continue;
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

export function buildMonthlyEarnings<
  T extends EarningDateFields & { bountyAmount: number },
>(
  bounties: T[],
  year: number,
  monthLabels: string[],
) {
  const amounts = new Array(monthLabels.length).fill(0);
  const grouped: T[][] = monthLabels.map(() => []);

  for (const bounty of bounties) {
    const date = bountyEarningDate(bounty);
    if (!date || date.getFullYear() !== year) continue;

    const month = date.getMonth();
    amounts[month] += bounty.bountyAmount;
    grouped[month] = [...grouped[month], bounty];
  }

  return monthLabels.map((label, index) => ({
    label,
    amount: amounts[index] || 0,
    bounties: grouped[index] || [],
  }));
}
