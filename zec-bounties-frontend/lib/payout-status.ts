// Payout tracker helpers for the bounty detail page. Kept free of React so
// they can be tested with plain `node --test`.

export type PayoutState = "APPROVED" | "QUEUED" | "BROADCAST" | "CONFIRMED";

export type PayoutErrorCode = "failed" | "unknown" | "backend_unreachable";

export interface PayoutStatus {
  bountyId: string | null;
  // null until the submission is approved.
  state: PayoutState | null;
  txid?: string | null;
  // Human-readable reference (the payment memo) shown when there is no txid yet.
  memoRef?: string | null;
  chain?: string | null;
  timestamps?: {
    approvedAt: string | null;
    queuedAt: string | null;
    broadcastAt: string | null;
    confirmedAt: string | null;
  };
  error?: { code: PayoutErrorCode; message: string; detail?: string } | null;
  backend?: { reachable: boolean | null; checkedAt: string | null } | null;
}

export type StepStatus = "done" | "current" | "upcoming" | "problem";

export interface PayoutStep {
  state: PayoutState;
  label: string;
  hint: string;
  timestampKey: keyof NonNullable<PayoutStatus["timestamps"]>;
}

export const PAYOUT_STEPS: PayoutStep[] = [
  {
    state: "APPROVED",
    label: "Approved",
    hint: "Your work was accepted.",
    timestampKey: "approvedAt",
  },
  {
    state: "QUEUED",
    label: "Queued",
    hint: "The payout is lined up to be sent.",
    timestampKey: "queuedAt",
  },
  {
    state: "BROADCAST",
    label: "Broadcast",
    hint: "Sent to the Zcash network.",
    timestampKey: "broadcastAt",
  },
  {
    state: "CONFIRMED",
    label: "Confirmed",
    hint: "Mined into a block.",
    timestampKey: "confirmedAt",
  },
];

const QUEUED_INDEX = 1;

// One status per step, in PAYOUT_STEPS order. A failed or stalled payout is
// shown on the Queued step, where the send was attempted; an unreachable node
// is only a warning and leaves the steps as they were.
export function getStepStatuses(
  status: Pick<PayoutStatus, "state" | "error"> | null | undefined,
): StepStatus[] {
  const upcoming = PAYOUT_STEPS.map(() => "upcoming" as StepStatus);
  if (!status?.state) return upcoming;

  const code = status.error?.code;
  if (code === "failed" || code === "unknown") {
    return upcoming.map((_, i) =>
      i < QUEUED_INDEX ? "done" : i === QUEUED_INDEX ? "problem" : "upcoming",
    );
  }

  if (status.state === "CONFIRMED") return upcoming.map(() => "done");

  const current = PAYOUT_STEPS.findIndex((s) => s.state === status.state);
  return upcoming.map((_, i) =>
    i < current ? "done" : i === current ? "current" : "upcoming",
  );
}

export const POLL_ACTIVE_MS = 30_000;
export const POLL_BACKOFF_MS = 120_000;

// How long to wait before asking again, or null to stop. A confirmed payout
// is final, and an approved/failed one only changes when an admin acts.
export function nextPollDelay(
  status: Pick<PayoutStatus, "state" | "error" | "backend"> | null | undefined,
): number | null {
  if (!status?.state || status.state === "CONFIRMED") return null;
  if (status.state === "APPROVED" && !status.error) return POLL_BACKOFF_MS;
  if (status.state === "APPROVED") return null;
  // Node trouble: keep trying, but gently.
  if (status.backend?.reachable === false) return POLL_BACKOFF_MS;
  return POLL_ACTIVE_MS;
}

// "Oct 11, 2026, 10:05 AM" — or null for a missing or invalid timestamp.
export function formatPayoutTime(
  iso: string | null | undefined,
  locale = "en-US",
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function shortTxid(txid: string): string {
  return txid.length > 20 ? `${txid.slice(0, 10)}…${txid.slice(-8)}` : txid;
}

export type PayoutFetchResult =
  | { kind: "ok"; status: PayoutStatus }
  // Signed out, not involved in the bounty, or no such bounty: show nothing.
  | { kind: "hidden" }
  // Network failure or a server error: keep the last known status on screen.
  | { kind: "error" };

// Fetches the payout status and sorts the outcome into what the page should
// do. An aborted request is rethrown so callers can tell it from a failure.
export async function requestPayoutStatus(
  url: string,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
): Promise<PayoutFetchResult> {
  try {
    const res = await fetchImpl(url, init);
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      return { kind: "hidden" };
    }
    if (!res.ok) return { kind: "error" };
    return { kind: "ok", status: (await res.json()) as PayoutStatus };
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    return { kind: "error" };
  }
}
