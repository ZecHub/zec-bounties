// Defaults and validation for the create-bounty form (components/new-bounty-modal.tsx).
// Kept free of React so it can be tested with plain `node --test`.

export const DEFAULT_DEADLINE_DAYS = 14;

export type BountyQuota = {
  limit: number | null;
  used: number;
  remaining: number | null;
  resetsAt: string | null;
};

// Local midnight of the given day, so date-picker values compare by calendar day.
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// The deadline a new bounty starts with: DEFAULT_DEADLINE_DAYS calendar days from today.
export function defaultDeadline(now: Date = new Date()): Date {
  const day = startOfDay(now);
  day.setDate(day.getDate() + DEFAULT_DEADLINE_DAYS);
  return day;
}

export function validateReward(amount: number): string | undefined {
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Enter a reward greater than 0 ZEC.";
  }
  return undefined;
}

// Today is allowed; any earlier day is not.
export function validateDeadline(
  deadline: Date | null | undefined,
  now: Date = new Date(),
): string | undefined {
  if (!(deadline instanceof Date) || isNaN(deadline.getTime())) {
    return "Choose a deadline.";
  }
  if (startOfDay(deadline).getTime() < startOfDay(now).getTime()) {
    return "The deadline can't be in the past.";
  }
  return undefined;
}

// Admins and users without a limit are never blocked.
export function isQuotaReached(
  quota: BountyQuota | null | undefined,
  isAdmin: boolean,
): boolean {
  if (isAdmin || !quota || quota.limit === null) return false;
  if (quota.remaining !== null) return quota.remaining <= 0;
  return quota.used >= quota.limit;
}

// The week resets at Monday 00:00 UTC (see getCalendarWeekBounds in the backend),
// so the date is shown in UTC to match the day the server counts from.
export function formatQuotaResetDate(
  resetsAt: string | null | undefined,
  locale?: string,
): string | null {
  if (!resetsAt) return null;
  const date = new Date(resetsAt);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// "X of Y used, resets on [date]", or null when the user has no limit.
export function formatQuotaStatus(
  quota: BountyQuota | null | undefined,
  locale?: string,
): string | null {
  if (!quota || quota.limit === null) return null;
  const resets = formatQuotaResetDate(quota.resetsAt, locale);
  return resets
    ? `${quota.used} of ${quota.limit} used, resets on ${resets}`
    : `${quota.used} of ${quota.limit} used this week`;
}
