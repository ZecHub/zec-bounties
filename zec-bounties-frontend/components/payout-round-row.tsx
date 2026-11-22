import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Check, Loader2 } from "lucide-react";
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

// true / false when we can tell whether the assignee can be paid on the bounty's chain,
// undefined when the address isn't visible to this viewer (the server then decides).
export function addressKnown(b: Bounty): boolean | undefined {
  const u: any = b.assigneeUser;
  if (!u) return false; // no assignee, nobody to pay
  const field = b.chain === "MAIN" ? "UA_address" : "z_address";
  if (field in u) return Boolean(u[field]);
  return undefined;
}

// Bounties that are due but not yet in any round. Choose which ones to include (all are
// ticked by default), then one click opens ONE round for exactly those.
export function PayoutOpenCard({ bounties }: { bounties: Bounty[] }) {
  const { openPayoutRound } = useBounty();
  const [busy, setBusy] = useState(false);
  // Track what's UNticked, so bounties that become due later default to included.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const eligible = bounties.filter((b) => addressKnown(b) !== false);
  const unpayable = bounties.filter((b) => addressKnown(b) === false);
  const selected = eligible.filter((b) => !excluded.has(b.id));
  const total = selected.reduce((s, b) => s + b.bountyAmount, 0);

  const toggle = (id: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAll = () =>
    setExcluded(
      selected.length === eligible.length
        ? new Set(eligible.map((b) => b.id))
        : new Set(),
    );

  const open = async () => {
    setBusy(true);
    try {
      const { skipped } = await openPayoutRound(selected.map((b) => b.id));
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
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Choose bounties for a payout round
        </p>
        <div className="flex items-center gap-2">
          <Checkbox
            id="open-select-all"
            checked={eligible.length > 0 && selected.length === eligible.length}
            onCheckedChange={toggleAll}
            disabled={eligible.length === 0}
          />
          <label htmlFor="open-select-all" className="text-xs cursor-pointer">
            Select all ({eligible.length})
          </label>
        </div>
      </div>

      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
        {eligible.map((b) => {
          const on = !excluded.has(b.id);
          return (
            <div
              key={b.id}
              onClick={() => toggle(b.id)}
              className={`flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                on ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              }`}
            >
              <Checkbox
                checked={on}
                onCheckedChange={() => toggle(b.id)}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{b.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {b.assigneeUser?.name ?? "Unknown assignee"}
                </p>
              </div>
              <span className="font-mono text-xs shrink-0">
                {zec(b.bountyAmount)} ZEC
              </span>
            </div>
          );
        })}
        {unpayable.map((b) => (
          <div
            key={b.id}
            className="flex items-center gap-3 rounded-md border border-dashed px-3 py-2 opacity-70"
          >
            <Checkbox checked={false} disabled />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{b.title}</p>
              <p className="text-xs text-destructive">
                {b.assigneeUser
                  ? "Assignee has no payout address"
                  : "No assignee"}
              </p>
            </div>
            <span className="font-mono text-xs shrink-0">
              {zec(b.bountyAmount)} ZEC
            </span>
          </div>
        ))}
      </div>

      <Button
        size="sm"
        className="w-full"
        disabled={busy || selected.length === 0}
        onClick={open}
      >
        {busy ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : selected.length === 0 ? (
          "Select bounties to include"
        ) : (
          `Open payout round for ${selected.length} (${zec(total)} ZEC)`
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
