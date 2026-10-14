"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { backendUrl } from "@/lib/configENV";
import { getExplorerUrl } from "@/lib/explorer";
import {
  PAYOUT_STEPS,
  formatPayoutTime,
  getStepStatuses,
  nextPollDelay,
  requestPayoutStatus,
  shortTxid,
  type PayoutStatus,
  type StepStatus,
} from "@/lib/payout-status";

/* ─── presentation ───────────────────────────────────────────────────────── */

const DOT: Record<StepStatus, string> = {
  done: "bg-emerald-500 text-white border-emerald-500",
  current: "bg-background text-blue-600 border-blue-500 ring-4 ring-blue-500/15",
  upcoming: "bg-background text-muted-foreground/50 border-border",
  problem: "bg-red-500 text-white border-red-500",
};

function StepIcon({ status, index }: { status: StepStatus; index: number }) {
  if (status === "done") return <Check className="w-3.5 h-3.5" aria-hidden />;
  if (status === "problem") return <X className="w-3.5 h-3.5" aria-hidden />;
  return <span className="text-[11px] font-semibold">{index + 1}</span>;
}

interface ViewProps {
  status: PayoutStatus;
  onRefresh?: () => void;
  refreshing?: boolean;
}

// The tracker itself. Takes data, fetches nothing — the wrapper below does.
export function PayoutStatusView({ status, onRefresh, refreshing }: ViewProps) {
  const [copied, setCopied] = useState(false);
  if (!status.state) return null;

  const steps = getStepStatuses(status);
  const error = status.error;
  const isProblem = error?.code === "failed" || error?.code === "unknown";
  const txid = status.txid ?? null;

  const copyTxid = async () => {
    if (!txid) return;
    try {
      await navigator.clipboard.writeText(txid);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable; the full txid is still selectable */
    }
  };

  return (
    <section
      aria-labelledby="payout-status-heading"
      className="@container space-y-3 rounded-xl border bg-card p-4"
    >
      <div className="flex items-center gap-2">
        <h2
          id="payout-status-heading"
          className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
        >
          Payout status
        </h2>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh payout status"
            className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-60"
          >
            <RefreshCw
              className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`}
              aria-hidden
            />
            Refresh
          </button>
        )}
      </div>

      <ol
        aria-label="Payout progress"
        className="grid grid-cols-1 gap-3 @md:grid-cols-4 @md:gap-2"
      >
        {PAYOUT_STEPS.map((step, i) => {
          const stepStatus = steps[i];
          const when = formatPayoutTime(status.timestamps?.[step.timestampKey]);
          return (
            <li
              key={step.state}
              data-step={step.state}
              data-status={stepStatus}
              aria-current={stepStatus === "current" ? "step" : undefined}
              className="flex items-start gap-2.5 @md:flex-col @md:gap-1.5"
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${DOT[stepStatus]}`}
              >
                <StepIcon status={stepStatus} index={i} />
              </span>
              <span className="min-w-0 space-y-0.5">
                <span
                  className={`block text-xs font-medium ${
                    stepStatus === "upcoming"
                      ? "text-muted-foreground"
                      : stepStatus === "problem"
                        ? "text-red-700 dark:text-red-400"
                        : "text-foreground"
                  }`}
                >
                  {step.label}
                  {stepStatus === "problem" && (
                    <span className="sr-only"> — problem</span>
                  )}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {when ?? (stepStatus === "upcoming" ? "Pending" : "—")}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      {error && (
        <div
          role={isProblem ? "alert" : "status"}
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
            isProblem
              ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
              : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
          }`}
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <div className="space-y-1">
            <p>{error.message}</p>
            {error.detail && (
              <p className="font-mono text-[11px] opacity-80 break-words">
                {error.detail}
              </p>
            )}
            {error.code === "backend_unreachable" &&
              formatPayoutTime(status.backend?.checkedAt) && (
                <p className="opacity-80">
                  Last checked {formatPayoutTime(status.backend?.checkedAt)}.
                </p>
              )}
          </div>
        </div>
      )}

      {txid ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Transaction</span>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono" title={txid}>
            {shortTxid(txid)}
          </code>
          <button
            type="button"
            onClick={copyTxid}
            aria-label="Copy transaction id"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            {copied ? (
              <Check className="w-3 h-3" aria-hidden />
            ) : (
              <Copy className="w-3 h-3" aria-hidden />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
          <a
            href={getExplorerUrl(txid, { chain: status.chain ?? undefined })}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-blue-600 hover:underline"
          >
            View on explorer
            <ExternalLink className="w-3 h-3" aria-hidden />
          </a>
        </div>
      ) : (
        status.memoRef && (
          <p className="text-xs text-muted-foreground">
            Reference{" "}
            <span className="font-mono text-foreground break-words">
              {status.memoRef}
            </span>
          </p>
        )
      )}
    </section>
  );
}

/* ─── data ───────────────────────────────────────────────────────────────── */

function authHeaders(): Record<string, string> {
  try {
    const token = localStorage.getItem("authToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

// Loads and keeps fresh the payout status for one bounty. Renders nothing for
// visitors who may not see it (signed out, or not involved in the bounty) and
// for bounties that aren't approved yet.
export function PayoutStatusTracker({ bountyId }: { bountyId: string }) {
  const [status, setStatus] = useState<PayoutStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hidden, setHidden] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const result = await requestPayoutStatus(
          `${backendUrl}/api/bounties/${bountyId}/payout`,
          { headers: authHeaders(), signal },
        );
        if (result.kind === "hidden") {
          setHidden(true);
          return null;
        }
        if (result.kind === "error") {
          // Our own server is unreachable: keep whatever we last showed.
          setLoadFailed(true);
          return null;
        }
        setStatus(result.status);
        setLoadFailed(false);
        return result.status;
      } catch {
        return null; // aborted: the component is going away
      } finally {
        setLoading(false);
      }
    },
    [bountyId],
  );

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const tick = async () => {
      const data = await load(controller.signal);
      if (cancelled) return;
      const delay = data ? nextPollDelay(data) : 120_000;
      if (delay !== null) timer.current = setTimeout(tick, delay);
    };
    tick();

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer.current);
    };
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (hidden) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        Loading payout status…
      </div>
    );
  }

  if (!status?.state) {
    // First load failed outright: say so rather than silently showing nothing.
    return loadFailed ? (
      <div
        role="alert"
        className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
      >
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden />
        Couldn&apos;t load the payout status right now.
        <button type="button" onClick={refresh} className="ml-auto underline">
          Try again
        </button>
      </div>
    ) : null;
  }

  return (
    <div className="space-y-2">
      <PayoutStatusView
        status={status}
        onRefresh={refresh}
        refreshing={refreshing}
      />
      {loadFailed && (
        <p role="status" className="text-[11px] text-muted-foreground">
          Showing the last known status — couldn&apos;t reach the server just now.
        </p>
      )}
    </div>
  );
}
