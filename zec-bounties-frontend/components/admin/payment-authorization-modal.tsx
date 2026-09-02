// payment-authorization-modal.tsx
"use client";

import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Bounty } from "@/lib/types";
import { useBounty } from "@/lib/bounty-context";
import { CreditCard, AlertTriangle, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface PaymentAuthorizationModalProps {
  bounty: Bounty;
  children: React.ReactNode;
}

// Pays a single bounty through the same endpoint as the bulk payout panel.
// This used to offer an "instant vs Sunday batch" choice, but neither path
// ever moved funds — instant POSTed to a route that doesn't exist and batch
// scheduled work no job ever picked up. One real button beats two fake ones.
export function PaymentAuthorizationModal({
  bounty,
  children,
}: PaymentAuthorizationModalProps) {
  const { authorizeDuePayment } = useBounty();
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Mainnet bounties pay to the unified address, testnet to the z-address —
  // mirrors the backend's selection in authorize-payment.
  const payoutAddress =
    bounty.chain === "MAIN"
      ? bounty.assigneeUser?.UA_address
      : bounty.assigneeUser?.z_address;
  const addressLabel = bounty.chain === "MAIN" ? "UA Address" : "Z Address";

  const handleAuthorizePayment = async () => {
    setIsProcessing(true);
    try {
      const result = await authorizeDuePayment([bounty.id]);

      if (result.skipped.length > 0) {
        toast.error(`Payment skipped: ${result.skipped[0].reason}`);
        return;
      }

      const txid = result.txids[0];
      toast.success(
        txid
          ? `Payment sent — tx ${txid.slice(0, 12)}…`
          : `Payment sent (${result.paidCount} bounty)`,
        { duration: 10000 },
      );
      setIsOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Payment failed",
        { duration: 10000 },
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Authorize Payment
          </DialogTitle>
          <DialogDescription>
            Send the ZEC payment for this completed bounty
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{bounty.title}</CardTitle>
              <div className="flex items-center gap-2">
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  {bounty.status}
                </Badge>
                <Badge
                  variant="outline"
                  className="text-green-600 border-green-200 dark:text-green-400 dark:border-green-800"
                >
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Approved
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Payment Amount:
                </span>
                <div className="flex items-center font-bold text-lg">
                  {bounty.bountyAmount} ZEC
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Assignee:
                </span>
                <span className="text-sm font-medium">
                  {bounty.assigneeUser?.name || "Unassigned"}
                </span>
              </div>

              {payoutAddress && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {addressLabel}:
                  </span>
                  <span className="text-sm font-mono text-slate-500 truncate max-w-[150px]">
                    {payoutAddress}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Completed:
                </span>
                <span className="text-sm font-medium">
                  {format(new Date(), "MMM dd, yyyy")}
                </span>
              </div>
            </CardContent>
          </Card>

          {!payoutAddress && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Assignee does not have a {addressLabel} configured for this
                bounty's network. They can add one on their profile page.
              </AlertDescription>
            </Alert>
          )}

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This sends {bounty.bountyAmount} ZEC from your default wallet
              immediately. It cannot be undone.
            </AlertDescription>
          </Alert>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              className="flex-1"
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAuthorizePayment}
              disabled={isProcessing || !payoutAddress}
              className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              {isProcessing ? "Sending..." : "Send Payment"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
