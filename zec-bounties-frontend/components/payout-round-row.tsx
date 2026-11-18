import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useBounty, type PayoutRound } from "@/lib/bounty-context";
import { displayName } from "@/lib/displayName";
import type { Bounty } from "@/lib/types";

const zec = (n: number) => n.toFixed(4);

function BountyList({ bounties }: { bounties: Bounty[] }) {
  const shown = bounties.slice(0, 3);
  return (
    <ul className="text-xs text-muted-foreground space-y-0.5">
      {shown.map((b) => (
        <li key={b.id} className="flex justify-between gap-2">
          <span className="truncate">{b.title}</span>
          <span className="font-mono shrink-0">{zec(b.bountyAmount)} ZEC</span>
        </li>
      ))}
      {bounties.length > shown.length && (
        <li>+{bounties.length - shown.length} more</li>
      )}
    </ul>
  );
}

// Bounties that are due but not yet in any round: one click opens ONE round for all of them.
export function PayoutOpenCard({ bounties }: { bounties: Bounty[] }) {
  const { openPayoutRound } = useBounty();
  const [busy, setBusy] = useState(false);
  const total = bounties.reduce((s, b) => s + b.bountyAmount, 0);

  const open = async () => {
    setBusy(true);
    try {
      const { skipped } = await openPayoutRound(bounties.map((b) => b.id));
      if (skipped.length > 0)
        toast.message(`${skipped.length} left out of the round`, {
          description: skipped
            .map((s) => `${s.title ?? s.id} (${s.reason})`)
            .join("; "),
          duration: 10000,
        });
    } catch (e: any) {
      const skipped = e?.skipped as
        | { id: string; title?: string; reason: string }[]
        | undefined;
      toast.error(e?.message || "Failed to open payout round", {
        description: skipped
          ?.map((s) => `${s.title ?? s.id} (${s.reason})`)
          .join("; "),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {bounties.length} bount{bounties.length === 1 ? "y" : "ies"} ready for
          a payout round
        </p>
        <span className="text-sm font-mono shrink-0">{zec(total)} ZEC</span>
      </div>
      <BountyList bounties={bounties} />
      <Button size="sm" className="w-full" disabled={busy} onClick={open}>
        {busy ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          "Open one payout round for all"
        )}
      </Button>
    </div>
  );
}

// One round = one batch. Approvers pick WHICH approver processes it, signing with a passkey.
export function PayoutRoundCard({
  round,
  bounties,
}: {
  round: PayoutRound;
  bounties: Bounty[];
}) {
  const { currentUser, votePayoutRound, cancelPayoutRound } = useBounty();
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      if (e?.message !== "Vote cancelled")
        toast.error(e?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (id: string) => {
    const c = round.candidates.find((x) => x.id === id);
    if (!c) return "Unknown";
    return id === currentUser?.id ? `${displayName(c)} (you)` : displayName(c);
  };
  const voteCount = (id: string) =>
    round.tally.find((t) => t.candidateId === id)?.votes ?? 0;
  const rateMoved =
    round.quote != null &&
    bounties.some((b) => {
      if (!b.rewardUsdRate || b.rewardUsdRate <= 0) return false;
      return (
        Math.abs(round.quote!.rate - b.rewardUsdRate) / b.rewardUsdRate >= 0.2
      );
    });

  const cancelBtn = round.canVote &&
    (round.status === "OPEN" || round.status === "DECIDED") && (
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => run(() => cancelPayoutRound(round.id))}
      >
        Cancel round
      </Button>
    );

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Batch of {round.bountyIds.length} bount
          {round.bountyIds.length === 1 ? "y" : "ies"}
        </p>
        <span className="text-sm font-mono shrink-0">
          {zec(round.totalZat / 1e8)} ZEC
        </span>
      </div>
      <BountyList bounties={bounties} />

      {round.quote && (
        <div className="rounded-md border border-border/60 bg-muted/30 px-2 py-1.5 text-xs">
          <p className="text-muted-foreground">
            Priced at ${round.quote.rate.toLocaleString()} / ZEC via{" "}
            {round.quote.source} ·{" "}
            {new Date(round.quote.quotedAt).toLocaleString()}
          </p>
          {round.quote.stale && (
            <p className="mt-1 flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              Using the last known price; live sources were unavailable.
            </p>
          )}
          {rateMoved && (
            <p className="mt-1 flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              ZEC moved 20% or more since these rewards were set. Amounts were
              repriced from their USD value.
            </p>
          )}
        </div>
      )}

      {round.status === "OPEN" ? (
        <>
          <p className="text-xs text-muted-foreground">
            Choose who processes this batch. {round.threshold} matching signed
            votes are needed.
          </p>
          {!round.canVote && (
            <p className="text-xs text-destructive">
              You had no active passkey when this round opened, so you can't
              vote on it.
            </p>
          )}
          <div className="space-y-1.5">
            {round.candidates.map((c) => {
              const mine = round.myVote === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={busy || mine || !round.canVote}
                  onClick={() => run(() => votePayoutRound(round.id, c.id))}
                  className={`w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    mine ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  } disabled:opacity-60`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {mine && (
                      <Check className="w-4 h-4 text-primary shrink-0" />
                    )}
                    <span className="truncate">{nameOf(c.id)}</span>
                  </span>
                  <span className="font-mono text-xs shrink-0">
                    {voteCount(c.id)} / {round.threshold}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex justify-end">{cancelBtn}</div>
        </>
      ) : round.status === "DECIDED" && round.executorId ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {nameOf(round.executorId)} was chosen to process this batch.
            {round.executableAt && new Date(round.executableAt) > new Date()
              ? ` Unlocks ${new Date(round.executableAt).toLocaleString()}.`
              : ""}
          </p>
          {cancelBtn}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Payment in progress</p>
      )}
    </div>
  );
}
