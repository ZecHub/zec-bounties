"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, ExternalLink, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { PaymentRecord } from "@/lib/types";
import { useBounty } from "@/lib/bounty-context";
import { getExplorerUrl } from "@/lib/explorer";

const STATUS_STYLES: Record<PaymentRecord["status"], string> = {
  BROADCAST:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  PENDING:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  UNKNOWN:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

// The durable, bounty-linked payout ledger. The wallet-history table below it
// on the Transactions tab shows what the wallet saw; this shows what the app
// did and to whom. UNKNOWN/PENDING rows carry a Resolve action.
export function PaymentRecordsTable({ records }: { records: PaymentRecord[] }) {
  const { resolvePaymentRecord } = useBounty();
  const [resolving, setResolving] = useState<PaymentRecord | null>(null);
  const [resolveTxid, setResolveTxid] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  const submitResolve = async (outcome: "broadcast" | "failed") => {
    if (!resolving) return;
    setIsSubmitting(true);
    try {
      await resolvePaymentRecord(
        resolving.id,
        outcome,
        outcome === "broadcast" ? resolveTxid.trim() : undefined,
      );
      toast.success(
        outcome === "broadcast"
          ? "Recorded as broadcast — bounty marked paid"
          : "Recorded as failed — bounty unlocked for payment",
      );
      setResolving(null);
      setResolveTxid("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to resolve record",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (records.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No payout records yet. Records appear here when payments are sent
        through the app.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="px-3 py-2 font-medium">Bounty</th>
              <th className="px-3 py-2 font-medium">Recipient</th>
              <th className="px-3 py-2 font-medium">Amount</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Transaction</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id} className="border-b last:border-0">
                <td className="px-3 py-2 max-w-[200px]">
                  <span className="block truncate font-medium">
                    {record.bounty?.title ?? record.bountyId}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {record.bounty?.assigneeUser?.nickname ??
                    record.bounty?.assigneeUser?.name ??
                    "—"}
                </td>
                <td className="px-3 py-2 font-mono whitespace-nowrap">
                  {(record.amountZat / 1e8).toFixed(4)} ZEC
                </td>
                <td className="px-3 py-2">
                  <Badge className={STATUS_STYLES[record.status]}>
                    {record.status}
                  </Badge>
                </td>
                <td className="px-3 py-2 font-mono whitespace-nowrap">
                  {record.txid ? (
                    <span className="inline-flex items-center gap-1">
                      {record.txid.slice(0, 8)}…{record.txid.slice(-8)}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copy(record.txid!)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() =>
                          window.open(
                            getExplorerUrl(record.txid!, {
                              chain: record.chain,
                            }),
                            "_blank",
                            "noopener,noreferrer",
                          )
                        }
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                  {new Date(record.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right">
                  {(record.status === "UNKNOWN" ||
                    record.status === "PENDING") && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => setResolving(record)}
                    >
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      Resolve
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={resolving !== null}
        onOpenChange={(open) => !open && setResolving(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve unconfirmed payment</DialogTitle>
            <DialogDescription>
              The wallet never confirmed this send. Check the wallet's
              transaction history for a payment of{" "}
              <span className="font-mono">
                {resolving ? (resolving.amountZat / 1e8).toFixed(4) : ""} ZEC
              </span>{" "}
              around {resolving && new Date(resolving.createdAt).toLocaleString()},
              then record what you found.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="resolve-txid">
              Transaction ID (if the payment went through)
            </label>
            <Input
              id="resolve-txid"
              placeholder="Paste txid from wallet history"
              value={resolveTxid}
              onChange={(e) => setResolveTxid(e.target.value)}
              className="font-mono"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="destructive"
              disabled={isSubmitting}
              onClick={() => submitResolve("failed")}
            >
              It never sent — unlock bounty
            </Button>
            <Button
              disabled={isSubmitting || resolveTxid.trim() === ""}
              onClick={() => submitResolve("broadcast")}
            >
              It sent — mark paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
