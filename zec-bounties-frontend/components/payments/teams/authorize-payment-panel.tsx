import { useEffect, useRef, useState } from "react";
import { useBounty } from "@/lib/bounty-context";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setNymSending } from "@/components/nym-sending-indicator";
import { PayoutKeysCard } from "@/components/payout-keys-card";
import { PayoutOpenCard, PayoutRoundCard } from "@/components/payout-round-row";
import type { Bounty, Team } from "@/lib/types";

export function TeamAuthorizePaymentPanel({
  team,
  teamBounties,
  onPaid,
}: {
  team: Team;
  teamBounties: Bounty[];
  onPaid?: (bountyIds: string[]) => void;
}) {
  const {
    authorizeTeamDuePayment,
    payoutRounds = {},
    fetchPayoutRounds,
    isLoading,
    currentUser,
  } = useBounty();

  // A round is a batch, so the selection is by round, not by bounty.
  const [selectedRoundIds, setSelectedRoundIds] = useState<Set<string>>(
    new Set(),
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Same stable-key-per-selection pattern as the admin panel, so a double
  // submit of the same payout is caught by the backend's replay guard.
  const attemptKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const keyForSelection = (ids: string[]) => {
    const fingerprint = [...ids].sort().join(",");
    if (attemptKey.current?.fingerprint !== fingerprint) {
      attemptKey.current = {
        fingerprint,
        key:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      };
    }
    return attemptKey.current.key;
  };

  const walletChainToBountyChain = (
    walletChain?: string,
  ): "TEST" | "MAIN" | null => {
    if (walletChain === "testnet") return "TEST";
    if (walletChain === "mainnet") return "MAIN";
    return null;
  };

  const activeChain = walletChainToBountyChain(team.wallet?.chain);

  // Exported bounties are paid outside the app (Export Completed).
  const payableBounties = teamBounties.filter(
    (b) =>
      b.status === "DONE" &&
      b.isApproved &&
      !b.isPaid &&
      !b.paymentInFlight &&
      !b.exportedAt &&
      b.chain === activeChain,
  );

  const blockedBounties = teamBounties.filter(
    (b) =>
      b.status === "DONE" &&
      b.isApproved &&
      !b.isPaid &&
      !b.paymentInFlight &&
      !b.exportedAt &&
      b.chain !== activeChain,
  );

  const inFlightBounties = teamBounties.filter(
    (b) => b.status === "DONE" && !b.isPaid && b.paymentInFlight,
  );

  // isLoading from context is the auth guard; no timeouts
  const payableKey = payableBounties
    .map((b) => b.id)
    .sort()
    .join(",");
  useEffect(() => {
    if (isLoading || !currentUser || !payableKey) return;
    fetchPayoutRounds(payableKey.split(","));
  }, [isLoading, currentUser?.id, payableKey]);

  const bountyById = new Map(teamBounties.map((b) => [b.id, b]));
  const bountiesOf = (r: { bountyIds: string[] }) =>
    r.bountyIds.map((id) => bountyById.get(id)).filter((b): b is Bounty => !!b);

  const payableIds = new Set(payableBounties.map((b) => b.id));
  const rounds = Object.values(payoutRounds).filter((r) =>
    r.bountyIds.some((id) => payableIds.has(id)),
  );
  const coveredIds = new Set(rounds.flatMap((r) => r.bountyIds));
  const uncovered = payableBounties.filter((b) => !coveredIds.has(b.id));

  // Ready: decided for ME as the executor, and past the lock delay.
  const isReady = (r: (typeof rounds)[number]) =>
    r.status === "DECIDED" &&
    r.executorId === currentUser?.id &&
    (!r.executableAt || new Date(r.executableAt).getTime() <= now);
  const readyRounds = rounds.filter(isReady);
  const waitingRounds = rounds.filter((r) => !isReady(r));

  const selectedRounds = readyRounds.filter((r) => selectedRoundIds.has(r.id));
  const selectedIds = new Set(selectedRounds.flatMap((r) => r.bountyIds));
  const totalSelected = selectedRounds.reduce(
    (sum, r) => sum + r.totalZat / 1e8,
    0,
  );

  const toggleOne = (roundId: string) => {
    setSelectedRoundIds((prev) => {
      const next = new Set(prev);
      next.has(roundId) ? next.delete(roundId) : next.add(roundId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedRoundIds.size === readyRounds.length) {
      setSelectedRoundIds(new Set());
    } else {
      setSelectedRoundIds(new Set(readyRounds.map((r) => r.id)));
    }
  };

  const handleConfirmAuthorize = async () => {
    setShowConfirm(false);
    setIsProcessing(true);
    setNymSending(true);
    const ids = Array.from(selectedIds);
    const startedAt = Date.now();
    try {
      const result = await authorizeTeamDuePayment(
        team.id,
        ids,
        keyForSelection(ids),
      );
      const txid = result.txids[0];
      toast.success("Payment sent", {
        description:
          `${result.paidCount} bounty payment(s) sent in ${Math.round((Date.now() - startedAt) / 1000)}s` +
          (txid ? ` — tx ${txid.slice(0, 12)}…` : "") +
          (result.skipped.length > 0
            ? ` ${result.skipped.length} skipped: ${result.skipped
                .map((s) => `${s.title} (${s.reason})`)
                .join("; ")}`
            : ""),
        duration: 12000,
      });
      attemptKey.current = null;
      setSelectedRoundIds(new Set());

      // Report only bounties that were actually paid. `skipped` entries are
      // matched by title, since that's what the toast shows.
      const skippedTitles = new Set(result.skipped.map((s) => s.title));
      const paidIds = ids.filter((id) => {
        const b = bountyById.get(id);
        return !!b && !skippedTitles.has(b.title);
      });
      if (paidIds.length > 0) onPaid?.(paidIds);
    } catch (error: any) {
      const [title, ...rest] = error.message?.split(": ") ?? [];
      const description =
        rest.join(": ") || error.message || "Failed to authorize payment";
      toast.error(title || "Payment failed", { description, duration: 8000 });
    } finally {
      setIsProcessing(false);
      setNymSending(false);
    }
  };

  const hasReady = readyRounds.length > 0;
  const hasAwaiting = uncovered.length > 0 || waitingRounds.length > 0;
  const hasActivity =
    hasReady ||
    hasAwaiting ||
    blockedBounties.length > 0 ||
    inFlightBounties.length > 0;

  // Nothing due, nothing blocked, nothing stuck — don't clutter the
  // Treasury tab with an empty card at all.
  if (!hasActivity) {
    return null;
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Payments due</h3>
        <p className="text-xs text-muted-foreground">
          {hasReady
            ? `${readyRounds.length} approved ${readyRounds.length !== 1 ? "batches" : "batch"} ready for you to pay`
            : hasAwaiting
              ? `${payableBounties.length} completed ${payableBounties.length !== 1 ? "bounties" : "bounty"} awaiting a payout round`
              : "Nothing ready to pay out right now"}
        </p>
      </div>

      {team.wallet && (
        <div className="flex items-center gap-2 text-sm p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          <span>
            Paying from{" "}
            <span className="font-medium">{team.wallet.accountName}</span> (
            {team.wallet.chain})
          </span>
        </div>
      )}

      {inFlightBounties.length > 0 && (
        <div className="flex items-start gap-2.5 text-sm p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span className="text-amber-800 dark:text-amber-200">
            <span className="font-medium">
              {inFlightBounties.length} payment
              {inFlightBounties.length > 1 ? "s" : ""} awaiting settlement
            </span>{" "}
            — the wallet didn't confirm the send, so{" "}
            {inFlightBounties.length > 1 ? "they are" : "it is"} locked against
            retry. Check the wallet history and resolve from the Transactions
            tab.
          </span>
        </div>
      )}

      {blockedBounties.length > 0 && (
        <div className="flex items-start gap-2.5 text-sm p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
          <span className="text-yellow-800 dark:text-yellow-200">
            <span className="font-medium">
              {blockedBounties.length} bount
              {blockedBounties.length > 1 ? "ies" : "y"} hidden
            </span>{" "}
            — the team wallet is on{" "}
            <span className="font-medium">{team.wallet?.chain}</span> but{" "}
            {blockedBounties.length > 1
              ? "those bounties are"
              : "that bounty is"}{" "}
            on{" "}
            <span className="font-medium">
              {activeChain === "TEST" ? "mainnet" : "testnet"}
            </span>
            .
          </span>
        </div>
      )}

      {hasAwaiting && (
        <div className="space-y-2">
          <PayoutKeysCard />
          <p className="text-xs font-medium text-muted-foreground">
            Awaiting approval
          </p>
          {uncovered.length > 0 && <PayoutOpenCard bounties={uncovered} />}
          {waitingRounds.map((r) => (
            <PayoutRoundCard key={r.id} round={r} bounties={bountiesOf(r)} />
          ))}
        </div>
      )}

      {hasReady && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedRoundIds.size === readyRounds.length}
                onCheckedChange={toggleAll}
                id="team-select-all"
              />
              <label
                htmlFor="team-select-all"
                className="text-sm font-medium cursor-pointer"
              >
                Select all ({readyRounds.length})
              </label>
            </div>
            {selectedIds.size > 0 && (
              <span className="text-sm text-muted-foreground">
                {selectedIds.size} bount{selectedIds.size === 1 ? "y" : "ies"} ·{" "}
                {totalSelected.toFixed(4)} ZEC
              </span>
            )}
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {readyRounds.map((round) => {
              const list = bountiesOf(round);
              return (
                <div
                  key={round.id}
                  onClick={() => toggleOne(round.id)}
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedRoundIds.has(round.id)
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <Checkbox
                    checked={selectedRoundIds.has(round.id)}
                    onCheckedChange={() => toggleOne(round.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      Batch of {round.bountyIds.length} bount
                      {round.bountyIds.length === 1 ? "y" : "ies"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {list.map((b) => b.title).join(", ")}
                    </p>
                  </div>
                  <span className="text-sm font-mono font-medium shrink-0">
                    {(round.totalZat / 1e8).toFixed(4)} ZEC
                  </span>
                </div>
              );
            })}
          </div>

          <Button
            onClick={() => setShowConfirm(true)}
            disabled={selectedIds.size === 0 || isProcessing || !team.wallet}
            className="w-full"
          >
            {isProcessing
              ? "Processing..."
              : `Authorize ${selectedIds.size > 0 ? `${selectedIds.size} Payment${selectedIds.size > 1 ? "s" : ""}` : "Payment"}`}
          </Button>
        </>
      )}

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Team Payment</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  You are about to authorize{" "}
                  <span className="font-semibold text-foreground">
                    {selectedIds.size} payment{selectedIds.size > 1 ? "s" : ""}
                  </span>{" "}
                  totalling{" "}
                  <span className="font-semibold text-foreground">
                    {totalSelected.toFixed(4)} ZEC
                  </span>{" "}
                  from {team.name}'s wallet{" "}
                  <span className="font-semibold text-foreground">
                    {team.wallet?.accountName}
                  </span>{" "}
                  on{" "}
                  <span className="font-semibold text-foreground">
                    {team.wallet?.chain}
                  </span>
                  .
                </p>

                <div className="rounded-lg border bg-muted/40 divide-y max-h-48 overflow-y-auto">
                  {teamBounties
                    .filter((b) => selectedIds.has(b.id))
                    .map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between px-3 py-2 text-sm"
                      >
                        <span className="truncate text-foreground font-medium max-w-[60%]">
                          {b.title}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {b.assigneeUser?.name ?? "Unknown"}
                          </span>
                          <span className="font-mono text-xs font-semibold">
                            {b.bountyAmount.toFixed(4)} ZEC
                          </span>
                        </div>
                      </div>
                    ))}
                </div>

                <p className="text-xs text-destructive font-medium">
                  This action cannot be undone.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAuthorize}
              disabled={isProcessing}
              className="bg-primary hover:bg-primary/90"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                "Confirm & Send"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
