"use client";

import { useState, useEffect, ReactNode } from "react";
import { ImportWalletModal } from "./import-modal";
import { useBounty } from "@/lib/bounty-context";

interface WalletGuardProps {
  children: ReactNode;
}

export function WalletGuard({ children }: WalletGuardProps) {
  const { zcashParams, zcashParamsLoading } = useBounty();
  const [showImportModal, setShowImportModal] = useState(false);

  const hasParams = zcashParams && zcashParams.length > 0;

  // Show import modal whenever params are empty (covers deletion case)
  useEffect(() => {
    if (!zcashParamsLoading && !hasParams) {
      setShowImportModal(true);
    } else if (hasParams) {
      setShowImportModal(false);
    }
  }, [hasParams, zcashParamsLoading]);

  if (zcashParamsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="mb-4 h-12 w-12 mx-auto animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Checking wallet status...</p>
        </div>
      </div>
    );
  }

  if (!hasParams) {
    return (
      <>
        <div className="flex items-center justify-center min-h-screen bg-muted/20">
          <div className="text-center max-w-md p-8">
            <h2 className="text-2xl font-bold mb-2">Wallet Setup Required</h2>
            <p className="text-muted-foreground mb-4">
              Please import your Zcash wallet to continue using the application.
            </p>
          </div>
        </div>
        <ImportWalletModal
          open={showImportModal}
          onOpenChange={(open) => {
            // Only allow closing the modal if a wallet was successfully imported
            if (!open && hasParams) {
              setShowImportModal(false);
            }
          }}
          isRequired={true}
        />
      </>
    );
  }

  return <>{children}</>;
}
