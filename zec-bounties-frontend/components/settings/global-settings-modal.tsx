import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Server,
  Wallet,
  CheckCircle2,
  Edit,
  Trash2,
  Download,
  AlertTriangle,
} from "lucide-react";
import { useBounty } from "@/lib/bounty-context";
import { formatAddress } from "@/lib/utils";
import { ZcashParams } from "@/lib/types";
import { ImportWalletModal } from "./import-modal";
import { useToast } from "@/hooks/use-toast";

interface GlobalSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSettingsModal({
  open,
  onOpenChange,
}: GlobalSettingsModalProps) {
  const {
    zcashParams,
    address,
    updateZcashParams,
    deleteZcashParams,
    setDefaultWallet,
  } = useBounty();
  const { toast } = useToast();

  const [isUpdating, setIsUpdating] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<ZcashParams | null>(
    null,
  );
  const [configToDelete, setConfigToDelete] = useState<ZcashParams | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSettingDefault, setIsSettingDefault] = useState<string | null>(null);

  const [editForm, setEditForm] = useState({
    accountName: "",
    chain: "mainnet",
    serverUrl: "https://zec.rocks:443",
  });

  // Load Zcash params when modal opens
  useEffect(() => {
    const loadZcashParams = async () => {
      if (open) {
        setIsLoading(true);
        try {
          if (zcashParams && zcashParams.length > 0) {
            // Select the latest config by default
            const latestParam = zcashParams[zcashParams.length - 1];
            setSelectedConfig(latestParam);
          }
        } catch (error) {
          console.error("Error loading Zcash params:", error);
        } finally {
          setIsLoading(false);
        }
      }
    };

    loadZcashParams();
  }, [open, zcashParams]);

  const handleEditClick = (config: ZcashParams) => {
    setSelectedConfig(config);
    setEditForm({
      accountName: config.accountName || "",
      chain: config.chain || "mainnet",
      serverUrl: config.serverUrl || "https://zec.rocks:443",
    });
    setIsEditDialogOpen(true);
  };

  const handleDeleteClick = (config: ZcashParams) => {
    setConfigToDelete(config);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!configToDelete) return;

    setIsUpdating(true);
    try {
      await deleteZcashParams(configToDelete.accountName);

      toast({
        title: "Success",
        description: `Zcash configuration "${configToDelete.accountName}" has been deleted.`,
      });

      // If the deleted config was the selected one, select another
      if (selectedConfig?.id === configToDelete.id) {
        const remainingParams = zcashParams.filter(
          (p) => p.id !== configToDelete.id,
        );
        setSelectedConfig(
          remainingParams.length > 0 ? remainingParams[0] : null,
        );
      }

      setIsDeleteDialogOpen(false);
      setConfigToDelete(null);
    } catch (error) {
      console.error("Error deleting Zcash config:", error);
      toast({
        title: "Error",
        description: "Failed to delete Zcash configuration. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleChainChange = (value: string) => {
    setEditForm((prev) => ({
      ...prev,
      chain: value,
      serverUrl:
        value === "mainnet"
          ? "https://zec.rocks:443"
          : "https://testnet.zec.rocks:443",
    }));
  };

  const handleEditConfig = async () => {
    if (!selectedConfig) return;

    setIsUpdating(true);
    try {
      await updateZcashParams(selectedConfig.accountName, {
        accountName: editForm.accountName,
        chain: editForm.chain,
        serverUrl: editForm.serverUrl,
      });

      toast({
        title: "Success",
        description: "Zcash configuration updated successfully.",
      });

      setIsEditDialogOpen(false);
    } catch (error) {
      console.error("Error updating Zcash config:", error);
      toast({
        title: "Error",
        description: "Failed to update Zcash configuration. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSetDefault = async (config: ZcashParams) => {
    setIsSettingDefault(config.accountName);
    try {
      await setDefaultWallet(config.accountName);
      toast({
        title: "Default wallet updated",
        description: `"${config.accountName}" is now the default paying wallet.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to set default wallet. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSettingDefault(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex flex-col sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Server className="w-6 h-6" />
              Global Settings
            </DialogTitle>
            <DialogDescription>
              Configure and manage your Zcash network settings
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center space-y-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                <p className="text-sm text-muted-foreground">
                  Loading settings...
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Import Wallet Button */}
              <div className="flex justify-end">
                <Button
                  onClick={() => setIsImportDialogOpen(true)}
                  className="gap-2"
                >
                  <Download className="w-4 h-4" />
                  Import Wallet
                </Button>
              </div>

              {/* Current Configuration Overview */}
              {selectedConfig && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-muted/50 px-6 py-4 border-b">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Server className="w-5 h-5" />
                      Active Configuration
                    </h3>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          Account Name
                        </Label>
                        <div className="text-slate-900 dark:text-slate-100 font-medium">
                          {selectedConfig.accountName || "Unnamed Account"}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          Network
                        </Label>
                        <Badge
                          variant="outline"
                          className={
                            selectedConfig.chain === "mainnet"
                              ? "text-green-600 border-green-200 dark:text-green-400 dark:border-green-800"
                              : "text-blue-600 border-blue-200 dark:text-blue-400 dark:border-blue-800"
                          }
                        >
                          {selectedConfig.chain || "mainnet"}
                        </Badge>
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          Server URL
                        </Label>
                        <div className="text-sm text-slate-900 dark:text-slate-100 font-mono p-3 bg-slate-50 dark:bg-slate-800 rounded border">
                          {selectedConfig.serverUrl || "https://zec.rocks:443"}
                        </div>
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          Wallet Address
                        </Label>
                        <div className="text-sm text-slate-900 dark:text-slate-100 font-mono p-3 bg-slate-50 dark:bg-slate-800 rounded border">
                          {formatAddress(address || "")}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <div>
                          <p className="text-sm font-medium">
                            Connection Status
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Connected to{" "}
                            {selectedConfig.chain === "mainnet"
                              ? "Mainnet"
                              : "Testnet"}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditClick(selectedConfig)}
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* All Configurations List */}
              {zcashParams && zcashParams.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-muted/50 px-6 py-4 border-b">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Wallet className="w-5 h-5" />
                      All Configurations ({zcashParams.length})
                    </h3>
                  </div>
                  <div className="p-6 space-y-3">
                    {zcashParams.map((config) => (
                      <div
                        key={config.id}
                        className={`flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors ${
                          config.isDefault
                            ? "border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20"
                            : ""
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Wallet className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm">
                                {config.accountName || "Unnamed Account"}
                              </p>
                              {config.isDefault && (
                                <Badge className="text-xs bg-green-100 text-green-700 border-green-200 dark:bg-green-900 dark:text-green-300 dark:border-green-700">
                                  Default
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  config.chain === "mainnet"
                                    ? "text-green-600 border-green-200 dark:text-green-400 dark:border-green-800"
                                    : "text-blue-600 border-blue-200 dark:text-blue-400 dark:border-blue-800"
                                }`}
                              >
                                {config.chain || "mainnet"}
                              </Badge>
                              <span className="hidden imd:flex text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                                {config.serverUrl || "https://zec.rocks:443"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {!config.isDefault && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSetDefault(config)}
                              disabled={isSettingDefault === config.accountName}
                              className="text-xs h-8"
                            >
                              {isSettingDefault === config.accountName ? (
                                "Setting..."
                              ) : (
                                <>
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                  Set Default
                                </>
                              )}
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEditClick(config)}
                            className="h-8 w-8"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteClick(config)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                            disabled={isUpdating}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Configuration Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Zcash Configuration</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-account-name">Account Name</Label>
              <Input
                id="edit-account-name"
                value={editForm.accountName}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    accountName: e.target.value,
                  }))
                }
                placeholder="e.g., My Wallet"
              />
            </div>
            <div>
              <Label htmlFor="edit-chain">Network Chain</Label>
              <Select value={editForm.chain} onValueChange={handleChainChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mainnet">Mainnet</SelectItem>
                  <SelectItem value="testnet">Testnet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-server-url">Server URL</Label>
              <Input
                id="edit-server-url"
                value={editForm.serverUrl}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    serverUrl: e.target.value,
                  }))
                }
                placeholder="https://zec.rocks:443"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
                disabled={isUpdating}
              >
                Cancel
              </Button>
              <Button onClick={handleEditConfig} disabled={isUpdating}>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {isUpdating ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Delete Zcash Configuration
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the configuration for{" "}
              <span className="font-semibold">
                "{configToDelete?.accountName}"
              </span>
              ?
              <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <p className="text-sm text-destructive font-medium">
                  ⚠️ Warning: This action cannot be undone!
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  This will permanently delete the wallet data folder and all
                  associated files from the server.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isUpdating}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isUpdating ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Wallet Dialog */}
      <ImportWalletModal
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
      />
    </>
  );
}
