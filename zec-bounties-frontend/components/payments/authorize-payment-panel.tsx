import { useState } from "react";
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

export function AuthorizePaymentPanel() {
  const { bounties, authorizeDuePayment, zcashParams } = useBounty();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const defaultWallet = zcashParams.find((p) => p.isDefault);

  const walletChainToBountyChain = (
    walletChain?: string,
  ): "TEST" | "MAIN" | null => {
    if (walletChain === "testnet") return "TEST";
    if (walletChain === "mainnet") return "MAIN";
    return null;
  };

  const activeChain = walletChainToBountyChain(defaultWallet?.chain);

  const eligibleBounties = bounties.filter(
    (b) =>
      b.status === "DONE" &&
      b.isApproved &&
      !b.isPaid &&
      b.chain === activeChain,
  );

  const blockedBounties = bounties.filter(
    (b) =>
      b.status === "DONE" &&
      b.isApproved &&
      !b.isPaid &&
      b.chain !== activeChain,
  );

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

  const handleAuthorize = async () => {
    if (selectedIds.size === 0) return;

    setIsProcessing(true);
    try {
      const result = await authorizeDuePayment(Array.from(selectedIds));

      toast.success("Payment authorized", {
        description:
          `${result.paidCount} bounty payment(s) sent` +
          (result.skipped.length > 0
            ? `. ${result.skipped.length} skipped (missing z_address).`
            : "."),
      });

      setSelectedIds(new Set());
    } catch (error: any) {
      // error.message will be "Payment failed: <CLI details>" from the context
      const [title, ...rest] = error.message?.split(": ") ?? [];
      const description =
        rest.join(": ") || error.message || "Failed to authorize payment";

      toast.error(title || "Payment failed", {
        description,
        duration: 8000, // keep it visible longer for technical errors
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmAuthorize = async () => {
    setShowConfirm(false);
    setIsProcessing(true);
    try {
      const result = await authorizeDuePayment(Array.from(selectedIds));
      toast.success("Payment authorized", {
        description:
          `${result.paidCount} bounty payment(s) sent` +
          (result.skipped.length > 0
            ? `. ${result.skipped.length} skipped (missing address).`
            : "."),
      });
      setSelectedIds(new Set());
    } catch (error: any) {
      const [title, ...rest] = error.message?.split(": ") ?? [];
      const description =
        rest.join(": ") || error.message || "Failed to authorize payment";
      toast.error(title || "Payment failed", { description, duration: 8000 });
    } finally {
      setIsProcessing(false);
    }
  };

  if (eligibleBounties.length === 0) {
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

      {defaultWallet && blockedBounties.length > 0 && (
        <div className="flex items-start gap-2.5 text-sm p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
          <span className="text-yellow-800 dark:text-yellow-200">
            <span className="font-medium">
              {blockedBounties.length} bounty
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
        </div>
      )}

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
        disabled={selectedIds.size === 0 || isProcessing || !defaultWallet}
        className="w-full"
      >
        {isProcessing
          ? "Processing..."
          : `Authorize ${selectedIds.size > 0 ? `${selectedIds.size} Payment${selectedIds.size > 1 ? "s" : ""}` : "Payment"}`}
      </Button>

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

                {/* Summary of selected bounties */}
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
