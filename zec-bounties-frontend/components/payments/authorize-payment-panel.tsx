import { useRef, useState } from "react";
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
import { AlertTriangle, CheckCircle2, Coins, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setNymSending } from "@/components/nym-sending-indicator";

export function AuthorizePaymentPanel() {
  const {
    bounties,
    teams = [],
    authorizeDuePayment,
    zcashParams,
    unpaidDoneCount,
    hasMoreBounties,
    loadMoreBounties,
    bountiesLoading,
  } = useBounty();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // One idempotency key per selection, held stable across retries so a double
  // submit of the same payout is caught by the backend. A different selection
  // (or a successful send) gets a fresh key.
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

  const defaultWallet = zcashParams.find((p) => p.isDefault);

  const walletChainToBountyChain = (
    walletChain?: string,
  ): "TEST" | "MAIN" | null => {
    if (walletChain === "testnet") return "TEST";
    if (walletChain === "mainnet") return "MAIN";
    return null;
  };

  const activeChain = walletChainToBountyChain(defaultWallet?.chain);

  // Exported bounties are paid outside the app (Export Completed).
  const eligibleBounties = bounties.filter(
    (b) =>
      !b.teamId &&
      b.status === "DONE" &&
      b.isApproved &&
      !b.isPaid &&
      !b.paymentInFlight &&
      !b.exportedAt &&
      b.chain === activeChain,
  );

  // Explicitly require a valid chain ("MAIN" | "TEST") so a malformed/missing
  // chain is never misreported as a chain-mismatch blocked bounty.
  const blockedBounties = bounties.filter(
    (b) =>
      !b.teamId &&
      b.status === "DONE" &&
      b.isApproved &&
      !b.isPaid &&
      !b.paymentInFlight &&
      !b.exportedAt &&
      (b.chain === "MAIN" || b.chain === "TEST") &&
      b.chain !== activeChain,
  );

  // Sends whose outcome the backend couldn't confirm — locked server-side
  // until someone resolves them from the Transactions tab. Match any unpaid
  // platform bounty with `paymentInFlight` regardless of status so a row whose
  // status was changed while stuck still surfaces in the warning banner.
  const inFlightBounties = bounties.filter(
    (b) => !b.teamId && !b.isPaid && Boolean(b.paymentInFlight),
  );

  // Server-side `unpaidDoneCount` (`GET /api/bounties/stats/totals`) counts:
  //   chain: "MAIN", status: "DONE", isPaid: false, exportedAt: null,
  //   OR: [{ teamId: null }, { team: { payoutBy: "ADMIN" } }] (ADMIN_PAYOUT_SCOPE).
  // Specifically:
  // - It is MAIN-only, so `hasUnloadedEligible` is only evaluated when
  //   `activeChain === "MAIN"` (on TEST or without a default wallet, 0).
  // - It already excludes exported rows (`exportedAt: null`) and team-wallet
  //   bounties (`team.payoutBy === "TEAM"`), but includes ADMIN_PAYOUT_SCOPE
  //   rows that are not eligible for in-app wallet payout: admin-payout team
  //   bounties, `paymentInFlight` bounties, and any unapproved `DONE` rows.
  // Subtracting all loaded rows matching that exact server predicate prevents
  // loaded team/in-flight/unapproved rows from inflating `unloadedMainCount`.
  const resolveTeamPayoutBy = (b: (typeof bounties)[number]) =>
    b.team?.payoutBy ?? teams?.find((t) => t.id === b.teamId)?.payoutBy;
  const loadedUnpaidDoneOnMain = bounties.filter(
    (b) =>
      b.chain === "MAIN" &&
      b.status === "DONE" &&
      !b.isPaid &&
      !b.exportedAt &&
      (!b.teamId || resolveTeamPayoutBy(b) !== "TEAM"),
  ).length;
  const unloadedMainCount =
    activeChain === "MAIN"
      ? Math.max(0, unpaidDoneCount - loadedUnpaidDoneOnMain)
      : 0;
  const totalUnpaidOnChain =
    activeChain === "MAIN" ? eligibleBounties.length + unloadedMainCount : null;
  const hasUnloadedEligible = unloadedMainCount > 0 && hasMoreBounties;

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === eligibleBounties.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligibleBounties.map((b) => b.id)));
    }
  };

  const totalSelected = bounties
    .filter((b) => selectedIds.has(b.id))
    .reduce((sum, b) => sum + b.bountyAmount, 0);

  const handleConfirmAuthorize = async () => {
    setShowConfirm(false);
    setIsProcessing(true);
    setNymSending(true);
    const ids = Array.from(selectedIds);
    try {
      const result = await authorizeDuePayment(ids, keyForSelection(ids));
      const txid = result.txids[0];
      toast.success("Payment sent", {
        description:
          `${result.paidCount} bounty payment(s) sent` +
          (txid ? ` — tx ${txid.slice(0, 12)}…` : "") +
          (result.skipped.length > 0
            ? ` ${result.skipped.length} skipped: ${result.skipped
                .map((s) => `${s.title} (${s.reason})`)
                .join("; ")}`
            : ""),
        duration: 12000,
      });
      attemptKey.current = null;
      setSelectedIds(new Set());
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

  const hasEligible = eligibleBounties.length > 0;
  const hasActivity =
    hasEligible ||
    inFlightBounties.length > 0 ||
    blockedBounties.length > 0;

  if (!hasActivity) {
    if (hasUnloadedEligible) {
      return (
        <div className="text-center py-8 text-muted-foreground space-y-3">
          <Coins className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">
            {totalUnpaidOnChain} bount
            {totalUnpaidOnChain === 1 ? "y is" : "ies are"} ready for payment,
            but not loaded into this view yet.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={loadMoreBounties}
            disabled={bountiesLoading}
            className="gap-2"
          >
            {bountiesLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : null}
            {bountiesLoading ? "Loading…" : "Load more bounties"}
          </Button>
        </div>
      );
    }
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Coins className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No bounties ready for payment</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Default wallet indicator */}
      {defaultWallet ? (
        <div className="flex items-center gap-2 text-sm p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          <span>
            Paying from{" "}
            <span className="font-medium">{defaultWallet.accountName}</span> (
            {defaultWallet.chain})
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0" />
          <span>No default wallet set. Go to Settings to configure one.</span>
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
          {defaultWallet ? (
            <span className="text-yellow-800 dark:text-yellow-200">
              <span className="font-medium">
                {blockedBounties.length} bount
                {blockedBounties.length > 1 ? "ies" : "y"} hidden
              </span>{" "}
              — your default wallet is on{" "}
              <span className="font-medium">{defaultWallet.chain}</span> but{" "}
              {blockedBounties.length > 1
                ? "those bounties are"
                : "that bounty is"}{" "}
              on{" "}
              <span className="font-medium">
                {activeChain === "TEST" ? "mainnet" : "testnet"}
              </span>
              . Switch your default wallet to pay them.
            </span>
          ) : (
            <span className="text-yellow-800 dark:text-yellow-200">
              <span className="font-medium">
                {blockedBounties.length} bount
                {blockedBounties.length > 1 ? "ies" : "y"} hidden
              </span>{" "}
              — configure a default wallet in Settings to pay{" "}
              {blockedBounties.length > 1 ? "them" : "it"}.
            </span>
          )}
        </div>
      )}

      {/* Pagination warning — some eligible bounties loaded, but more exist */}
      {hasUnloadedEligible && (
        <div className="flex items-start gap-2.5 text-sm p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <span className="text-blue-800 dark:text-blue-200 flex-1">
            Showing {eligibleBounties.length} of {totalUnpaidOnChain} unpaid
            bounties. "Select all" only selects what's currently loaded.
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={loadMoreBounties}
            disabled={bountiesLoading}
            className="shrink-0 gap-1.5"
          >
            {bountiesLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : null}
            Load more
          </Button>
        </div>
      )}

      {hasEligible && (
        <>
          {/* Select all + summary */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedIds.size === eligibleBounties.length}
                onCheckedChange={toggleAll}
                id="select-all"
              />
              <label
                htmlFor="select-all"
                className="text-sm font-medium cursor-pointer"
              >
                Select all ({eligibleBounties.length})
              </label>
            </div>
            {selectedIds.size > 0 && (
              <span className="text-sm text-muted-foreground">
                {selectedIds.size} selected · {totalSelected.toFixed(4)} ZEC
              </span>
            )}
          </div>

          {/* Bounty rows */}
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {eligibleBounties.map((bounty) => (
              <div
                key={bounty.id}
                onClick={() => toggleOne(bounty.id)}
                className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedIds.has(bounty.id)
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/50"
                }`}
              >
                <Checkbox
                  checked={selectedIds.has(bounty.id)}
                  onCheckedChange={() => toggleOne(bounty.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{bounty.title}</p>
                  <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                    {bounty.assigneeUser?.name ?? "Unknown assignee"}
                    {bounty.chain === "MAIN" ? (
                      bounty.assigneeUser?.UA_address ? (
                        <span className="text-green-600 flex items-center gap-0.5">
                          <CheckCircle2 className="w-3 h-3" /> UA set
                        </span>
                      ) : (
                        <span className="text-red-600 flex items-center gap-0.5">
                          <AlertTriangle className="w-3 h-3" /> No UA
                        </span>
                      )
                    ) : bounty.assigneeUser?.z_address ? (
                      <span className="text-blue-600 flex items-center gap-0.5">
                        <CheckCircle2 className="w-3 h-3" /> TA set
                      </span>
                    ) : (
                      <span className="text-yellow-600 flex items-center gap-0.5">
                        <AlertTriangle className="w-3 h-3" /> No TA
                      </span>
                    )}
                  </p>
                </div>
                <span className="text-sm font-mono font-medium shrink-0">
                  {bounty.bountyAmount.toFixed(4)} ZEC
                </span>
              </div>
            ))}
          </div>

          {/* Authorize button */}
          <Button
            onClick={() => setShowConfirm(true)}
            disabled={
              selectedIds.size === 0 || isProcessing || !defaultWallet
            }
            className="w-full"
            aria-busy={isProcessing}
          >
            {isProcessing
              ? "Sending…"
              : `Authorize ${selectedIds.size > 0 ? `${selectedIds.size} Payment${selectedIds.size > 1 ? "s" : ""}` : "Payment"}`}
          </Button>
        </>
      )}

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Payment</AlertDialogTitle>
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
                  from wallet{" "}
                  <span className="font-semibold text-foreground">
                    {defaultWallet?.accountName}
                  </span>{" "}
                  on{" "}
                  <span className="font-semibold text-foreground">
                    {defaultWallet?.chain}
                  </span>
                  .
                </p>

                <div className="rounded-lg border bg-muted/40 divide-y max-h-48 overflow-y-auto">
                  {bounties
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
