import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Wallet,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
} from "lucide-react";
import { useBounty } from "@/lib/bounty-context";

interface ImportWalletModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isRequired?: boolean; // New prop to indicate if modal is required
}

export function ImportWalletModal({
  open,
  onOpenChange,
  isRequired = false,
}: ImportWalletModalProps) {
  const { importWallet, fetchSyncStatus } = useBounty();

  const [isImporting, setIsImporting] = useState(false);
  const [showSeed, setShowSeed] = useState(false);
  const [importStatus, setImportStatus] = useState<{
    type: "success" | "error" | null;
    message: string;
  }>({ type: null, message: "" });

  const [formData, setFormData] = useState({
    accountName: "",
    seedPhrase: "",
    chain: "mainnet",
    serverUrl: "https://zec.rocks:443",
    birthdayHeight: "",
  });

  const handleChainChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      chain: value,
      serverUrl:
        value === "mainnet"
          ? "https://zec.rocks:443"
          : "https://testnet.zec.rocks:443",
    }));
  };

  const validateSeedPhrase = (phrase: string): boolean => {
    const words = phrase.trim().split(/\s+/);
    return words.length === 24; // Zcash uses 24-word seed phrases
  };

  const handleImport = async () => {
    if (isImporting) {
      return;
    }

    // Reset status
    setImportStatus({ type: null, message: "" });

    // Validation
    if (!formData.accountName.trim()) {
      setImportStatus({
        type: "error",
        message: "Account name is required",
      });
      return;
    }

    if (!formData.seedPhrase.trim()) {
      setImportStatus({
        type: "error",
        message: "Seed phrase is required",
      });
      return;
    }

    if (!validateSeedPhrase(formData.seedPhrase)) {
      setImportStatus({
        type: "error",
        message: "Invalid seed phrase. Please enter a 24-word seed phrase.",
      });
      return;
    }

    const trimmedServerUrl = formData.serverUrl.trim();
    if (!trimmedServerUrl) {
      setImportStatus({
        type: "error",
        message: "Server URL is required",
      });
      return;
    }

    const trimmedBirthday = formData.birthdayHeight.trim();
    let parsedBirthdayHeight: number | undefined;
    if (trimmedBirthday) {
      if (!/^\d+$/.test(trimmedBirthday)) {
        setImportStatus({
          type: "error",
          message: "Birthday height must be a non-negative whole number.",
        });
        return;
      }
      parsedBirthdayHeight = Number.parseInt(trimmedBirthday, 10);
    }

    setIsImporting(true);

    try {
      const result = await importWallet({
        accountName: formData.accountName.trim(),
        seedPhrase: formData.seedPhrase.trim(),
        chain: formData.chain,
        serverUrl: trimmedServerUrl,
        birthdayHeight: parsedBirthdayHeight,
      });

      if (result.success) {
        setImportStatus({
          type: "success",
          message:
            result.message ||
            "Wallet imported successfully! Syncing in progress...",
        });

        // Reset form
        setFormData({
          accountName: "",
          seedPhrase: "",
          chain: "mainnet",
          serverUrl: "https://zec.rocks:443",
          birthdayHeight: "",
        });

        try {
          localStorage.setItem("walletImportedAt", Date.now().toString());
        } catch {
          // Ignore storage errors in restricted browser contexts
        }

        // Auto-trigger sync status fetch before reloading so the request is not aborted
        try {
          await fetchSyncStatus();
        } catch {
          // Non-fatal — can be retried manually via the sync button
        }

        window.location.reload();
      } else {
        setImportStatus({
          type: "error",
          message: result.message || "Failed to import wallet",
        });
      }
    } catch (error) {
      setImportStatus({
        type: "error",
        message:
          error instanceof Error ? error.message : "Failed to import wallet",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    // Prevent closing if wallet is required and not yet imported
    if (isRequired || isImporting) {
      return;
    }

    setFormData({
      accountName: "",
      seedPhrase: "",
      chain: "mainnet",
      serverUrl: "https://zec.rocks:443",
      birthdayHeight: "",
    });
    setImportStatus({ type: null, message: "" });
    setShowSeed(false);
    onOpenChange(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      handleClose();
      return;
    }
    onOpenChange(true);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={(e) => {
          if (isRequired || isImporting) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          if (isRequired || isImporting) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isRequired && <Lock className="w-5 h-5 text-amber-500" />}
            <Wallet className="w-5 h-5" />
            {isRequired ? "Wallet Setup Required" : "Import Zcash Wallet"}
          </DialogTitle>
          <DialogDescription>
            {isRequired ? (
              <span className="text-amber-600 font-medium">
                You must import a wallet to continue. This is required to
                initialize your Zcash parameters.
              </span>
            ) : (
              "Import an existing wallet using your 24-word seed phrase"
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Required Warning */}
          {isRequired && (
            <Alert className="border-amber-500 bg-amber-50">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                No Zcash parameters found. Please import your wallet to set up
                your account.
              </AlertDescription>
            </Alert>
          )}

          {/* Status Alert */}
          {importStatus.type && (
            <Alert
              variant={
                importStatus.type === "error" ? "destructive" : "default"
              }
            >
              {importStatus.type === "success" ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>{importStatus.message}</AlertDescription>
            </Alert>
          )}

          {/* Account Name */}
          <div className="space-y-2">
            <Label htmlFor="account-name">Account Name *</Label>
            <Input
              id="account-name"
              placeholder="e.g., My Main Wallet"
              value={formData.accountName}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  accountName: e.target.value,
                }))
              }
              disabled={isImporting}
            />
          </div>

          {/* Seed Phrase */}
          <div className="space-y-2">
            <Label htmlFor="seed-phrase">24-Word Seed Phrase *</Label>
            <div className="relative">
              {showSeed ? (
                <Textarea
                  id="seed-phrase"
                  placeholder="Enter your 24-word seed phrase separated by spaces"
                  value={formData.seedPhrase}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      seedPhrase: e.target.value,
                    }))
                  }
                  disabled={isImporting}
                  className="min-h-[100px] pr-10"
                />
              ) : (
                <Input
                  id="seed-phrase"
                  type="password"
                  placeholder="Enter your 24-word seed phrase separated by spaces"
                  value={formData.seedPhrase}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      seedPhrase: e.target.value,
                    }))
                  }
                  disabled={isImporting}
                  className="pr-10"
                />
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2 h-7 w-7"
                onClick={() => setShowSeed(!showSeed)}
                disabled={isImporting}
                aria-label={showSeed ? "Hide seed phrase" : "Show seed phrase"}
              >
                {showSeed ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Your seed phrase is never stored and only used during import
            </p>
          </div>

          {/* Network Chain */}
          <div className="space-y-2">
            <Label htmlFor="chain">Network</Label>
            <Select
              value={formData.chain}
              onValueChange={handleChainChange}
              disabled={isImporting}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mainnet">Mainnet</SelectItem>
                <SelectItem value="testnet">Testnet</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Server URL */}
          <div className="space-y-2">
            <Label htmlFor="server-url">Server URL</Label>
            <Input
              id="server-url"
              value={formData.serverUrl}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  serverUrl: e.target.value,
                }))
              }
              disabled={isImporting}
              placeholder="https://zec.rocks:443"
            />
          </div>

          {/* Birthday Height (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="birthday-height">Birthday Height (Optional)</Label>
            <Input
              id="birthday-height"
              type="number"
              placeholder="e.g., 1234567"
              value={formData.birthdayHeight}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  birthdayHeight: e.target.value,
                }))
              }
              disabled={isImporting}
            />
            <p className="text-xs text-muted-foreground">
              Block height when wallet was created (speeds up initial sync)
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4">
            {!isRequired && (
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isImporting}
              >
                Cancel
              </Button>
            )}
            <Button onClick={handleImport} disabled={isImporting}>
              {isImporting ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Importing...
                </>
              ) : (
                <>
                  <Wallet className="w-4 h-4 mr-2" />
                  Import Wallet
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
