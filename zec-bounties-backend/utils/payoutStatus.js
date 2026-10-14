// Payout tracker: turns a bounty and its latest Transaction row into the
// four states a contributor sees — Approved, Queued, Broadcast, Confirmed —
// plus a plain-language problem when the payout is stuck or failed.
//
// Pure on purpose (no DB, no wallet) so it can be tested directly.

const STATES = ["APPROVED", "QUEUED", "BROADCAST", "CONFIRMED"];

// Contributors get a message, not raw wallet output (which can carry paths,
// addresses or stack text). Admins also get the underlying detail.
const MESSAGES = {
  failed:
    "The payout could not be sent. Nothing left the wallet, so it will be retried. No action is needed from you.",
  unknown:
    "The payout was attempted but its outcome isn't clear yet. It is paused and an admin is checking the wallet history, so it won't be paid twice.",
  backend_unreachable:
    "We can't reach the Zcash node right now, so the latest status may be out of date. Your payout isn't affected and this will refresh automatically.",
};

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

// `record` is the bounty's most recent Transaction row (or null).
function derivePayoutState(bounty, record) {
  if (!bounty || !bounty.isApproved) return null;

  if (!record) return { state: "APPROVED", problem: null };

  switch (record.status) {
    case "PENDING":
      return { state: "QUEUED", problem: null };
    case "BROADCAST":
      return {
        state: record.confirmedAt ? "CONFIRMED" : "BROADCAST",
        problem: null,
      };
    case "FAILED":
      // Clean failure: the bounty is payable again, so it sits at Approved.
      return { state: "APPROVED", problem: "failed" };
    case "UNKNOWN":
      // Locked against retry until an admin resolves it; it was attempted,
      // so it stays at Queued.
      return { state: "QUEUED", problem: "unknown" };
    default:
      return { state: "APPROVED", problem: null };
  }
}

// `backend` is { reachable: boolean|null, checkedAt: Date|null } from the
// confirmation check; null means no check was attempted.
function buildPayoutStatus(bounty, record, { isAdmin = false, backend = null } = {}) {
  const derived = derivePayoutState(bounty, record);
  if (!derived) return { bountyId: bounty?.id ?? null, state: null };

  let problem = derived.problem;
  // A node that can't be reached only matters while we are still waiting on
  // a confirmation; it never overrides a real failure.
  if (
    !problem &&
    derived.state === "BROADCAST" &&
    backend &&
    backend.reachable === false
  ) {
    problem = "backend_unreachable";
  }

  const sent = record?.status === "BROADCAST";

  return {
    bountyId: bounty.id,
    state: derived.state,
    steps: STATES,
    txid: sent ? record.txid ?? null : null,
    // The memo is the human-readable reference when no txid exists yet.
    memoRef: record?.memo ?? null,
    chain: bounty.chain ?? null,
    timestamps: {
      approvedAt: iso(bounty.completedAt),
      queuedAt: iso(record?.createdAt),
      broadcastAt: sent ? iso(record.settledAt) : null,
      confirmedAt: iso(record?.confirmedAt),
    },
    error: problem
      ? {
          code: problem,
          message: MESSAGES[problem],
          ...(isAdmin && record?.errorDetail
            ? { detail: record.errorDetail }
            : {}),
        }
      : null,
    backend: backend
      ? { reachable: backend.reachable, checkedAt: iso(backend.checkedAt) }
      : null,
  };
}

module.exports = { STATES, MESSAGES, derivePayoutState, buildPayoutStatus };
