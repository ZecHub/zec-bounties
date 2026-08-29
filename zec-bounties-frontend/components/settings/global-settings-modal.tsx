"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Edit,
  Trash2,
  Download,
  AlertTriangle,
  Users,
  User,
  CheckCircle2,
  Building2,
  Globe,
  Link2,
  Copy,
} from "lucide-react";
import { useBounty } from "@/lib/bounty-context";
import { ZcashParams } from "@/lib/types";
import { ImportWalletModal } from "./import-modal";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/** Show first 10 chars … last 8 chars of any address */
function truncateAddress(addr: string): string {
  if (!addr) return "—";
  if (addr.length <= 20) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-8)}`;
}

interface GlobalSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type WalletType = "team" | "personal";

function getWalletType(config: ZcashParams): WalletType {
  return config.isTeam && config.teamId ? "team" : "personal";
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function partitionWallets(params: ZcashParams[], teams: any[]) {
  const teamWallets: (ZcashParams & { teamName?: string })[] = [];
  const personalWallets: ZcashParams[] = [];
  for (const p of params) {
    if (p.isTeam && p.teamId) {
      const team = teams.find((t) => t.id === p.teamId);
      teamWallets.push({ ...p, teamName: team?.name ?? `Team ${p.teamId}` });
    } else {
      personalWallets.push(p);
    }
  }
  return { teamWallets, personalWallets };
}

// ── Type chip — the core of the "in your face" UX ──────────────────────────
function WalletTypeChip({
  type,
  size = "sm",
}: {
  type: WalletType;
  size?: "sm" | "lg";
}) {
  const isTeam = type === "team";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-semibold tracking-wide border select-none",
        size === "lg"
          ? "text-xs px-2.5 py-1 gap-1.5"
          : "text-[10px] px-2 py-0.5",
        isTeam
          ? "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-800"
          : "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800",
      )}
    >
      {isTeam ? (
        <Users className={cn(size === "lg" ? "w-3.5 h-3.5" : "w-2.5 h-2.5")} />
      ) : (
        <User className={cn(size === "lg" ? "w-3.5 h-3.5" : "w-2.5 h-2.5")} />
      )}
      {isTeam ? "Team wallet" : "Personal wallet"}
    </span>
  );
}

// ── Animated copy button ────────────────────────────────────────────────────
function CopyButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      title="Copy full address"
      className="relative flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
    >
      <span
        className={cn(
          "absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap transition-all duration-300",
          copied ? "opacity-100 -translate-y-0" : "opacity-0 translate-y-1",
        )}
      >
        Copied!
      </span>
      <span
        className={cn(
          "transition-all duration-200",
          copied ? "scale-0 opacity-0" : "scale-100 opacity-100",
        )}
        style={{ position: copied ? "absolute" : "relative" }}
      >
        <Copy className="w-3 h-3" />
      </span>
      <span
        className={cn(
          "transition-all duration-200",
          copied ? "scale-100 opacity-100" : "scale-0 opacity-0",
        )}
        style={{ position: copied ? "relative" : "absolute" }}
      >
        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
      </span>
    </button>
  );
}

// ── Active wallet hero banner ───────────────────────────────────────────────
function ActiveWalletBanner({
  config,
  teamName,
  address,
  onEdit,
}: {
  config: ZcashParams;
  teamName?: string;
  address?: string;
  onEdit: () => void;
}) {
  const type = getWalletType(config);
  const isTeam = type === "team";
  const initials = getInitials(config.accountName || "UA");

  return (
    <div
      className={cn(
        "rounded-xl overflow-hidden border",
        isTeam
          ? "border-violet-300 dark:border-violet-700"
          : "border-sky-300 dark:border-sky-700",
      )}
    >
      {/* Coloured header strip */}
      <div
        className={cn(
          "px-4 py-3.5 flex items-center justify-between gap-3",
          isTeam
            ? "bg-gradient-to-r from-violet-600 to-violet-500 dark:from-violet-800 dark:to-violet-700"
            : "bg-gradient-to-r from-sky-600 to-sky-500 dark:from-sky-800 dark:to-sky-700",
        )}
      >
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-semibold text-sm">
              {initials}
            </div>
            {/* Pulse dot */}
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 border-2 border-white dark:border-gray-900 rounded-full" />
          </div>

          <div className="min-w-0">
            <div className="text-white font-semibold text-sm leading-tight">
              {config.accountName || "Unnamed Account"}
            </div>
            {/* Type chip — large, right under the name */}
            <div className="mt-1">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/90 bg-white/15 rounded-full px-2.5 py-0.5 border border-white/25">
                {isTeam ? (
                  <Building2 className="w-3 h-3" />
                ) : (
                  <User className="w-3 h-3" />
                )}
                {isTeam ? `Team · ${teamName ?? "Unknown"}` : "Personal"}
              </span>
            </div>
          </div>
        </div>

        <Button
          size="sm"
          variant="ghost"
          onClick={onEdit}
          className="text-white border border-white/30 hover:bg-white/20 hover:text-white text-xs h-7 px-2.5 shrink-0"
        >
          <Edit className="w-3 h-3 mr-1" />
          Edit
        </Button>
      </div>

      {/* Detail grid */}
      <div className="grid grid-cols-2 divide-x divide-y divide-border">
        <div className="px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-medium">
            Network
          </p>
          <div className="flex items-center gap-1.5">
            <Globe className="w-3 h-3 text-muted-foreground" />
            <span
              className={cn(
                "text-sm font-semibold",
                config.chain === "mainnet"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-600 dark:text-amber-400",
              )}
            >
              {config.chain === "mainnet" ? "Mainnet" : "Testnet"}
            </span>
          </div>
        </div>

        <div className="px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-medium">
            Wallet type
          </p>
          <WalletTypeChip type={type} size="sm" />
        </div>

        <div className="px-4 py-3 col-span-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-medium">
            Server
          </p>
          <div className="flex items-center gap-1.5">
            <Link2 className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="text-xs font-mono text-muted-foreground truncate">
              {config.serverUrl || "https://zec.rocks:443"}
            </span>
          </div>
        </div>

        <div className="px-4 py-3 col-span-2 border-t border-border">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-medium">
            Address
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">
              {truncateAddress(address || "")}
            </span>

            {address && <CopyButton address={address} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Individual wallet row ───────────────────────────────────────────────────
function WalletRow({
  config,
  isActive,
  isSettingDefault,
  isUpdating,
  onEdit,
  onDelete,
  onSetActive,
  teamName,
}: {
  config: ZcashParams;
  isActive: boolean;
  isSettingDefault: string | null;
  isUpdating: boolean;
  onEdit: (c: ZcashParams) => void;
  onDelete: (c: ZcashParams) => void;
  onSetActive: (c: ZcashParams) => void;
  teamName?: string;
}) {
  const type = getWalletType(config);
  const isTeam = type === "team";
  const name = config.accountName || "Unnamed Account";
  const initials = getInitials(name);
  const isSetting = isSettingDefault === config.accountName;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all",
        isActive
          ? isTeam
            ? "border-violet-300 bg-violet-50/60 dark:border-violet-700 dark:bg-violet-950/20"
            : "border-sky-300 bg-sky-50/60 dark:border-sky-700 dark:bg-sky-950/20"
          : "border-border hover:bg-muted/40",
      )}
    >
      {/* Avatar with type-coloured ring */}
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ring-2",
          isTeam
            ? "bg-violet-100 text-violet-700 ring-violet-200 dark:bg-violet-900/50 dark:text-violet-300 dark:ring-violet-800"
            : "bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-900/50 dark:text-sky-300 dark:ring-sky-800",
        )}
      >
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate">{name}</span>

          {/* Type chip — always visible, no hover required */}
          <WalletTypeChip type={type} />

          {isActive && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
          {teamName && (
            <>
              <Building2 className="w-2.5 h-2.5 text-violet-400 shrink-0" />
              <span className="text-violet-600 dark:text-violet-400 truncate max-w-[100px]">
                {teamName}
              </span>
              <span className="opacity-30">·</span>
            </>
          )}
          <span
            className={cn(
              "font-medium",
              config.chain === "mainnet"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-amber-600 dark:text-amber-400",
            )}
          >
            {config.chain || "mainnet"}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {!isActive && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSetActive(config)}
            disabled={isSetting}
            className="text-[11px] h-7 px-2 hidden sm:flex"
          >
            {isSetting ? "Setting…" : "Set active"}
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onEdit(config)}
          className="h-7 w-7"
        >
          <Edit className="w-3.5 h-3.5" />
        </Button>
        {!teamName && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onDelete(config)}
            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
            disabled={isUpdating}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Main modal ──────────────────────────────────────────────────────────────
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
    teams,
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

  useEffect(() => {
    if (open) {
      setIsLoading(true);
      try {
        if (zcashParams && zcashParams.length > 0) {
          const defaultParam =
            zcashParams.find((p) => p.isDefault) ??
            zcashParams[zcashParams.length - 1];
          setSelectedConfig(defaultParam);
        }
      } finally {
        setIsLoading(false);
      }
    }
  }, [open, zcashParams]);

  const { teamWallets, personalWallets } = partitionWallets(
    zcashParams ?? [],
    teams ?? [],
  );

  const activeTeamName =
    selectedConfig?.isTeam && selectedConfig?.teamId
      ? ((teams ?? []).find((t) => t.id === selectedConfig.teamId)?.name ??
        `Team ${selectedConfig.teamId}`)
      : undefined;

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
        title: "Deleted",
        description: `"${configToDelete.accountName}" removed.`,
      });
      if (selectedConfig?.id === configToDelete.id) {
        const remaining = zcashParams.filter((p) => p.id !== configToDelete.id);
        setSelectedConfig(remaining.length > 0 ? remaining[0] : null);
      }
      setIsDeleteDialogOpen(false);
      setConfigToDelete(null);
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete configuration.",
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
      toast({ title: "Saved", description: "Configuration updated." });
      setIsEditDialogOpen(false);
    } catch {
      toast({
        title: "Error",
        description: "Failed to update configuration.",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSetActive = async (config: ZcashParams) => {
    setIsSettingDefault(config.accountName);
    try {
      await setDefaultWallet(config.accountName, config.teamId ?? undefined);
      toast({
        title: "Active wallet updated",
        description: `"${config.accountName}" is now active.`,
      });
      window.location.reload();
    } catch {
      toast({
        title: "Error",
        description: "Failed to set active wallet.",
        variant: "destructive",
      });
    } finally {
      setIsSettingDefault(null);
    }
  };

  const isEmpty = personalWallets.length === 0 && teamWallets.length === 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="flex flex-col w-full sm:max-w-lg imd:max-h-[92vh] overflow-y-auto p-0 max-h-[70vh]"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-border">
            <div>
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                <Server className="w-4 h-4 text-muted-foreground" />
                Global settings
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs">
                Manage your Zcash wallet configurations
              </DialogDescription>
            </div>
            <Button
              onClick={() => setIsImportDialogOpen(true)}
              size="sm"
              className="gap-1.5 shrink-0 h-8 text-xs"
            >
              <Download className="w-3.5 h-3.5" />
              Import wallet
            </Button>
          </div>

          <div className="flex flex-col gap-5 px-5 py-5">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : isEmpty ? (
              <div className="border-2 border-dashed border-border rounded-xl p-10 text-center">
                <Wallet className="w-8 h-8 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">
                  No wallets yet
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Import a wallet to get started.
                </p>
              </div>
            ) : (
              <>
                {/* Active wallet banner */}
                {selectedConfig && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Active wallet
                      </span>
                    </div>
                    <ActiveWalletBanner
                      config={selectedConfig}
                      teamName={activeTeamName}
                      address={address || ""}
                      onEdit={() => handleEditClick(selectedConfig)}
                    />
                  </div>
                )}

                {/* Personal wallets */}
                {personalWallets.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border">
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800">
                        <User className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                        <span className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                          Personal
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {personalWallets.length} wallet
                        {personalWallets.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {personalWallets.map((config) => (
                        <WalletRow
                          key={config.id}
                          config={config}
                          isActive={config.id === selectedConfig?.id}
                          isSettingDefault={isSettingDefault}
                          isUpdating={isUpdating}
                          onEdit={handleEditClick}
                          onDelete={handleDeleteClick}
                          onSetActive={handleSetActive}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Team wallets */}
                {teamWallets.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border">
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-950/50 border border-violet-200 dark:border-violet-800">
                        <Users className="w-3 h-3 text-violet-600 dark:text-violet-400" />
                        <span className="text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                          Teams
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {teamWallets.length} wallet
                        {teamWallets.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {teamWallets.map((config) => (
                        <WalletRow
                          key={config.id}
                          config={config}
                          isActive={config.id === selectedConfig?.id}
                          isSettingDefault={isSettingDefault}
                          isUpdating={isUpdating}
                          onEdit={handleEditClick}
                          onDelete={handleDeleteClick}
                          onSetActive={handleSetActive}
                          teamName={config.teamName}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end pt-1 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="w-full max-w-sm p-5">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              Edit configuration
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 mt-1">
            <div>
              <Label htmlFor="edit-account-name" className="text-xs">
                Account name
              </Label>
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
                className="mt-1.5 h-8 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="edit-chain" className="text-xs">
                Network
              </Label>
              <Select value={editForm.chain} onValueChange={handleChainChange}>
                <SelectTrigger className="mt-1.5 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mainnet">Mainnet</SelectItem>
                  <SelectItem value="testnet">Testnet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-server-url" className="text-xs">
                Server URL
              </Label>
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
                className="mt-1.5 h-8 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditDialogOpen(false)}
                disabled={isUpdating}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleEditConfig}
                disabled={isUpdating}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                {isUpdating ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent className="w-full max-w-sm p-5">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
              Delete configuration
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Permanently delete{" "}
              <span className="font-semibold text-foreground">
                "{configToDelete?.accountName}"
              </span>
              ? This removes all associated wallet data from the server and
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-2">
            <AlertDialogCancel disabled={isUpdating} className="h-8 text-xs">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isUpdating}
              className="bg-destructive hover:bg-destructive/90 h-8 text-xs"
            >
              {isUpdating ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import wallet */}
      <ImportWalletModal
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
      />
    </>
  );
}
