"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  KeyRound,
  ShieldCheck,
  Eye,
  EyeOff,
  RefreshCw,
  Clock,
  Hash,
  Layers,
  Fingerprint,
  LifeBuoy,
  Settings2,
  ArrowLeft,
  ArrowRightLeft,
  Lock,
  Unlock,
  AlertCircle,
  Activity,
  WifiOff,
  Wifi,
  ScanLine,
  Info,
  CheckCheck,
  XCircle,
  RotateCcw,
  Shield,
  Cpu,
  Search,
  MoreHorizontal,
} from "lucide-react";
import { useBounty } from "@/lib/bounty-context";
import type { ZcashParams, Team, RecoveryData } from "@/lib/types";
import { ImportWalletModal } from "@/components/settings/import-modal";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AdminNavbar } from "@/components/layout/admin/navbar";
import { displayName } from "@/lib/displayName";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function truncate(addr: string, head = 14, tail = 10): string {
  if (!addr) return "—";
  if (addr.length <= head + tail) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

function getWalletType(c: ZcashParams): "team" | "personal" {
  return c.isTeam && c.teamId ? "team" : "personal";
}

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function partitionWallets(params: ZcashParams[], teams: Team[]) {
  const team: (ZcashParams & { teamName?: string })[] = [];
  const personal: ZcashParams[] = [];
  for (const p of params) {
    if (p.isTeam && p.teamId) {
      const t = teams.find((t) => t.id === p.teamId);
      team.push({ ...p, teamName: t?.name ?? `Team ${p.teamId}` });
    } else {
      personal.push(p);
    }
  }
  return { team, personal };
}

// ─────────────────────────────────────────────────────────────────────────────
// Micro-components
// ─────────────────────────────────────────────────────────────────────────────

function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed max-w-xl">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}

function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setOk(true);
    setTimeout(() => setOk(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
    >
      {ok ? (
        <>
          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          {label}
        </>
      )}
    </button>
  );
}

function SensitiveField({
  label,
  value,
  icon: Icon,
  warning,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
  warning?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card">
      <div className="flex items-center justify-between px-3.5 py-2 bg-muted/40 border-b border-border/60">
        <div className="flex items-center gap-1.5 min-w-0">
          {Icon && <Icon className="w-3 h-3 text-muted-foreground shrink-0" />}
          <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground truncate">
            {label}
          </span>
          {warning && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertCircle className="w-3 h-3 text-amber-500 cursor-help shrink-0" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  {warning}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <CopyBtn text={value} />
          <button
            onClick={() => setShow((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {show ? (
              <>
                <EyeOff className="w-3 h-3" /> Hide
              </>
            ) : (
              <>
                <Eye className="w-3 h-3" /> Reveal
              </>
            )}
          </button>
        </div>
      </div>
      <div className="px-3.5 py-3">
        {show ? (
          <p className="text-xs font-mono break-all leading-relaxed select-all text-foreground">
            {value}
          </p>
        ) : (
          <div className="flex items-center gap-1.5">
            <div className="flex gap-0.5 flex-wrap">
              {Array.from({ length: 28 }).map((_, i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-muted-foreground/25"
                />
              ))}
            </div>
            <Lock className="w-3 h-3 text-muted-foreground/30 ml-1" />
          </div>
        )}
      </div>
    </div>
  );
}

function StatChip({
  icon: Icon,
  label,
  value,
  color = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color?: "default" | "green" | "amber" | "sky" | "violet";
}) {
  const palette = {
    default: "bg-muted/60 text-foreground border-border",
    green:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800",
    amber:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800",
    sky: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800",
    violet:
      "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-800",
  };
  return (
    <div className={cn("rounded-lg border px-3 py-2.5", palette[color])}>
      <div className="flex items-center gap-1 mb-1">
        <Icon className="w-3 h-3 opacity-60" />
        <span className="text-[9px] uppercase tracking-widest font-bold opacity-70">
          {label}
        </span>
      </div>
      <span className="text-sm font-bold font-mono leading-none">{value}</span>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border-2 border-dashed border-border rounded-xl p-10 text-center bg-muted/10">
      <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mx-auto mb-3">
        <Icon className="w-5 h-5 text-muted-foreground/60" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && (
        <p className="text-xs text-muted-foreground mt-1 mb-4">{hint}</p>
      )}
      {action}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Nav
// ─────────────────────────────────────────────────────────────────────────────

type Section =
  | "wallets"
  | "recovery"
  | "network"
  | "sync"
  | "team-hunter"
  | "danger";

const NAV: {
  id: Section;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  group: "config" | "teams" | "advanced";
}[] = [
  { id: "wallets", label: "Wallets", icon: Wallet, group: "config" },
  { id: "recovery", label: "Recovery", icon: KeyRound, group: "config" },
  { id: "network", label: "Network", icon: Globe, group: "config" },
  {
    id: "team-hunter",
    label: "Team → Hunter",
    icon: ArrowRightLeft,
    adminOnly: true,
    group: "teams",
  },
  {
    id: "sync",
    label: "Sync & Rescan",
    icon: Activity,
    adminOnly: true,
    group: "advanced",
  },
  {
    id: "danger",
    label: "Danger Zone",
    icon: AlertTriangle,
    group: "advanced",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Recovery panel
// ─────────────────────────────────────────────────────────────────────────────

type UnlockStep = "idle" | "otp_sent" | "unlocked";

function RecoveryPanel({ config }: { config: ZcashParams }) {
  const { requestRecoveryOtp, verifyRecoveryOtp } = useBounty();
  const { toast } = useToast();

  const [step, setStep] = useState<UnlockStep>("idle");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [data, setData] = useState<RecoveryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequestOtp = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await requestRecoveryOtp();
      setMaskedEmail(res.email);
      setStep("otp_sent");
    } catch (e: any) {
      setError(e?.message ?? "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim()) {
      setError("Enter the code from your email");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await verifyRecoveryOtp(otp.trim(), config.accountName);
      setData(result);
      setStep("unlocked");
    } catch (e: any) {
      setError(e?.message ?? "Invalid code");
    } finally {
      setLoading(false);
    }
  };

  const handleLock = () => {
    setStep("idle");
    setData(null);
    setOtp("");
    setError(null);
    setMaskedEmail("");
  };

  // Step 1 — initial prompt
  if (step === "idle") {
    return (
      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 to-amber-50/30 dark:from-amber-950/30 dark:to-amber-950/10 p-5">
        <div className="flex gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              Verify your identity
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-300/70 mt-1 leading-relaxed">
              We'll send a one-time code to your email to confirm it's you
              before revealing any sensitive data.
            </p>
          </div>
        </div>
        <div className="pl-11">
          <Button
            size="sm"
            onClick={handleRequestOtp}
            disabled={loading}
            className="h-9"
          >
            {loading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <KeyRound className="w-3.5 h-3.5 mr-1.5" />
                Send verification code
              </>
            )}
          </Button>
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1 mt-2">
              <AlertCircle className="w-3 h-3" />
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Step 2 — OTP entry
  if (step === "otp_sent") {
    return (
      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 to-amber-50/30 dark:from-amber-950/30 dark:to-amber-950/10 p-5">
        <div className="flex gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              Enter verification code
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-300/70 mt-1">
              Sent to{" "}
              <span className="font-mono font-semibold">{maskedEmail}</span>.
              Valid for 5 minutes.{" "}
              <span className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                Check spam
              </span>
            </p>
          </div>
        </div>
        <div className="space-y-2 pl-11">
          <div className="flex flex-col imd:flex-row gap-2">
            <Input
              placeholder="000000"
              value={otp}
              onChange={(e) =>
                setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()}
              className="h-9 text-sm font-mono tracking-widest imd:w-32 imd:max-w-[128px]"
              // maxLength={6}
            />
            <Button
              size="sm"
              onClick={handleVerifyOtp}
              disabled={loading || otp.length < 6}
              className="h-9"
            >
              {loading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <Unlock className="w-3.5 h-3.5 mr-1.5" />
                  Verify
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRequestOtp}
              disabled={loading}
              className="h-9 text-xs text-muted-foreground"
            >
              Resend
            </Button>
          </div>
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Step 3 — unlocked, show data (same as before)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <StatChip
          icon={Clock}
          label="Birthday"
          value={data?.birthday?.toLocaleString() ?? "—"}
          color="sky"
        />
        <StatChip
          icon={Hash}
          label="Account"
          value={`#${data?.accountIndex ?? 0}`}
        />
        <StatChip
          icon={Layers}
          label="No of Accounts"
          value={`${data?.no_of_accounts ?? 1}`}
        />
      </div>

      {data?.["seed phrase"] ? (
        <SensitiveField
          label="Seed phrase"
          value={data["seed phrase"]}
          icon={KeyRound}
          warning="Full control over your funds. Never share with anyone."
        />
      ) : (
        <div className="rounded-lg border border-dashed border-border px-4 py-3 text-xs text-muted-foreground flex items-center gap-2">
          <Info className="w-3.5 h-3.5 shrink-0" />
          Seed phrase not returned by server (may be stored externally).
        </div>
      )}

      {data?.ufvk && (
        <SensitiveField
          label="Unified Full Viewing Key (UFVK)"
          value={data.ufvk}
          icon={Eye}
          warning="Grants read access to all transaction history."
        />
      )}

      {data?.uivk && (
        <SensitiveField
          label="Unified Incoming Viewing Key (UIVK)"
          value={data.uivk}
          icon={Fingerprint}
          warning="Grants access to incoming transactions only."
        />
      )}

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <LifeBuoy className="w-3 h-3" />
          Store recovery data securely offline.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={handleLock}
        >
          <Lock className="w-3 h-3 mr-1" />
          Lock
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection test
// ─────────────────────────────────────────────────────────────────────────────

function ConnectionTest({ accountName }: { accountName: string }) {
  const { testZcashConnection } = useBounty();
  const [state, setState] = useState<"idle" | "loading" | "ok" | "fail">(
    "idle",
  );
  const [msg, setMsg] = useState("");
  const [info, setInfo] = useState<any>(null);

  const test = async () => {
    setState("loading");
    const r = await testZcashConnection(accountName);
    setState(r.success ? "ok" : "fail");
    setMsg(r.message);
    setInfo(r.data ?? null);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs gap-1.5"
        onClick={test}
        disabled={state === "loading"}
      >
        {state === "loading" ? (
          <RefreshCw className="w-3 h-3 animate-spin" />
        ) : (
          <Wifi className="w-3 h-3" />
        )}
        Test connection
      </Button>

      {state === "ok" && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 cursor-default">
                <CheckCheck className="w-3 h-3" />
                {msg || "Connected"}
              </span>
            </TooltipTrigger>
            {info && (
              <TooltipContent
                side="bottom"
                className="p-3 font-mono text-[11px]"
              >
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {Object.entries(info).map(([key, value]) => (
                    <div key={key} className="contents">
                      <span className="text-muted-foreground">{key}</span>
                      <span>{String(value)}</span>
                    </div>
                  ))}
                </div>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      )}

      {state === "fail" && (
        <span className="text-[11px] text-destructive flex items-center gap-1">
          <XCircle className="w-3 h-3" />
          {msg || "Failed"}
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync panel
// ─────────────────────────────────────────────────────────────────────────────

function SyncPanel() {
  const {
    syncStatus,
    syncStatusLoading,
    syncStatusError,
    rescanStatus,
    rescanLoading,
    fetchSyncStatus,
    rescanWallet,
    currentUser,
  } = useBounty();
  const { toast } = useToast();

  useEffect(() => {
    fetchSyncStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRescan = async () => {
    await rescanWallet();
    toast({
      title: rescanStatus === "Rescan Success" ? "Rescan triggered" : "Error",
      description:
        rescanStatus === "Rescan Success"
          ? "Wallet rescan has been initiated."
          : "Failed to trigger rescan.",
      variant: rescanStatus === "Rescan Success" ? "default" : "destructive",
    });
    await fetchSyncStatus();
  };

  if (currentUser?.role !== "ADMIN") {
    return (
      <EmptyState
        icon={Shield}
        title="Admin access required"
        hint="You don't have permission to view sync status."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={fetchSyncStatus}
            disabled={syncStatusLoading}
          >
            <RefreshCw
              className={cn("w-3 h-3", syncStatusLoading && "animate-spin")}
            />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30"
            onClick={handleRescan}
            disabled={rescanLoading}
          >
            {rescanLoading ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <RotateCcw className="w-3 h-3" />
            )}
            Trigger rescan
          </Button>
        </div>
        {rescanStatus && (
          <span
            className={cn(
              "text-xs font-medium flex items-center gap-1",
              rescanStatus === "Rescan Success"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-destructive",
            )}
          >
            {rescanStatus === "Rescan Success" ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : (
              <AlertCircle className="w-3 h-3" />
            )}
            {rescanStatus}
          </span>
        )}
      </div>

      {syncStatusError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {syncStatusError}
        </div>
      )}

      {syncStatus ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Total progress */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold">Total progress</p>
                <p className="text-[11px] text-muted-foreground">
                  Lifetime sync since wallet creation
                </p>
              </div>
              <span className="text-lg font-bold font-mono text-sky-600 dark:text-sky-400">
                {syncStatus.percentage_total_blocks_scanned?.toFixed(1)}%
              </span>
            </div>
            <Progress
              value={syncStatus.percentage_total_blocks_scanned ?? 0}
              className="h-1.5"
            />
            <div className="grid grid-cols-2 gap-2 pt-1">
              <StatChip
                icon={ScanLine}
                label="Blocks"
                value={syncStatus.total_blocks_scanned?.toLocaleString() ?? "—"}
                color="sky"
              />
              <StatChip
                icon={Layers}
                label="Outputs"
                value={
                  syncStatus.total_sapling_outputs_scanned?.toLocaleString() ??
                  "—"
                }
                color="violet"
              />
            </div>
          </div>

          {/* Session progress */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold">Current session</p>
                <p className="text-[11px] text-muted-foreground">
                  Since this rescan started
                </p>
              </div>
              <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {syncStatus.percentage_session_blocks_scanned?.toFixed(1)}%
              </span>
            </div>
            <Progress
              value={syncStatus.percentage_session_blocks_scanned ?? 0}
              className="h-1.5"
            />
            <div className="grid grid-cols-2 gap-2 pt-1">
              <StatChip
                icon={Cpu}
                label="Session blocks"
                value={
                  syncStatus.session_blocks_scanned?.toLocaleString() ?? "—"
                }
                color="green"
              />
              <StatChip
                icon={Activity}
                label="Orchard outputs"
                value={
                  syncStatus.session_orchard_outputs_scanned?.toLocaleString() ??
                  "—"
                }
              />
            </div>
          </div>

          {syncStatus.sync_start_height != null && (
            <div className="lg:col-span-2 flex items-center gap-2 rounded-lg bg-muted/40 border border-border px-3.5 py-2.5">
              <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">
                Sync start height:{" "}
                <span className="font-mono font-semibold text-foreground">
                  {syncStatus.sync_start_height.toLocaleString()}
                </span>
              </span>
            </div>
          )}
        </div>
      ) : syncStatusLoading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <EmptyState
          icon={WifiOff}
          title="No sync data available"
          hint="Click Refresh to load the latest status."
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Team → Hunter panel
// ─────────────────────────────────────────────────────────────────────────────

function TeamToHunterPanel() {
  const { currentUser, users, usersLoading, convertUserToHunter } = useBounty();
  const { toast } = useToast();

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<any | null>(null);

  if (currentUser?.role !== "ADMIN") {
    return (
      <EmptyState
        icon={Shield}
        title="Admin access required"
        hint="You don't have permission to convert team users."
      />
    );
  }

  const teamUsers = (users ?? []).filter((u: any) => u.role === "TEAM");

  const handleConvert = async () => {
    if (!confirmTarget) return;
    setPendingId(confirmTarget.id);
    try {
      await convertUserToHunter(confirmTarget.id);
      toast({
        title: "Converted",
        description: `${displayName(confirmTarget)} is now a Hunter.`,
      });
      setConfirmTarget(null);
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Conversion failed.",
        variant: "destructive",
      });
    } finally {
      setPendingId(null);
    }
  };

  if (usersLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (teamUsers.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No team users"
        hint="No users currently have the Team role."
      />
    );
  }

  return (
    <>
      <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
        {teamUsers.map((user: any) => (
          <div
            key={user.id}
            className="flex items-center justify-between gap-3 px-4 py-3.5 flex-wrap"
          >
            <div className="min-w-0 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-950/50 flex items-center justify-center text-xs font-bold text-violet-700 dark:text-violet-300 shrink-0">
                {initials(displayName(user))}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold truncate">
                    {displayName(user)}
                  </p>
                  {user.isRobin && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 px-1.5 py-0.5 rounded-full">
                      <Info className="w-2.5 h-2.5" />
                      isRobin · team kept
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {user.email}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 shrink-0"
              onClick={() => setConfirmTarget(user)}
              disabled={pendingId === user.id}
            >
              {pendingId === user.id ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ArrowRightLeft className="w-3.5 h-3.5" />
              )}
              Convert to Hunter
            </Button>
          </div>
        ))}
      </div>

      <AlertDialog
        open={!!confirmTarget}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
      >
        <AlertDialogContent className="w-full max-w-sm p-5">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              Convert to Hunter
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              {confirmTarget?.isRobin ? (
                <>
                  Convert{" "}
                  <span className="font-semibold text-foreground">
                    {confirmTarget ? displayName(confirmTarget) : ""}
                  </span>{" "}
                  to Hunter? They're marked{" "}
                  <span className="font-mono">isRobin</span>, so their team will{" "}
                  <strong>not</strong> be deleted.
                </>
              ) : (
                <>
                  Convert{" "}
                  <span className="font-semibold text-foreground">
                    {confirmTarget ? displayName(confirmTarget) : ""}
                  </span>{" "}
                  to Hunter? Any team they created will be{" "}
                  <strong>permanently deleted</strong>, including its wallet.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-2">
            <AlertDialogCancel
              disabled={pendingId === confirmTarget?.id}
              className="h-8 text-xs"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConvert}
              disabled={pendingId === confirmTarget?.id}
              className="h-8 text-xs"
            >
              {pendingId === confirmTarget?.id ? "Converting…" : "Convert"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Wallet card
// ─────────────────────────────────────────────────────────────────────────────

function WalletCard({
  config,
  isActive,
  teamName,
  liveAddress,
  onEdit,
  onDelete,
  onSetActive,
  isSettingDefault,
}: {
  config: ZcashParams & { teamName?: string };
  isActive: boolean;
  teamName?: string;
  liveAddress?: string;
  onEdit: (c: ZcashParams) => void;
  onDelete: (c: ZcashParams) => void;
  onSetActive: (c: ZcashParams) => void;
  isSettingDefault: string | null;
}) {
  const type = getWalletType(config);
  const isTeam = type === "team";
  const name = config.accountName || "Unnamed";
  const inits = initials(name);
  const isSetting = isSettingDefault === config.accountName;

  const accent = isTeam ? "violet" : "sky";

  return (
    <div
      className={cn(
        "group relative rounded-xl border bg-card overflow-hidden transition-all duration-200",
        isActive
          ? accent === "violet"
            ? "border-violet-300 dark:border-violet-700 shadow-sm shadow-violet-500/5"
            : "border-sky-300 dark:border-sky-700 shadow-sm shadow-sky-500/5"
          : "border-border hover:border-muted-foreground/30 hover:shadow-sm",
      )}
    >
      {/* Accent rail */}
      {isActive && (
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-1",
            accent === "violet"
              ? "bg-gradient-to-b from-violet-500 to-violet-600"
              : "bg-gradient-to-b from-sky-500 to-sky-600",
          )}
        />
      )}

      <div className="p-4 flex items-start gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold shrink-0",
            isTeam
              ? "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
              : "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
          )}
        >
          {inits}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold truncate">{name}</p>
                {isActive && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Active
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded",
                    isTeam
                      ? "text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/30"
                      : "text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/30",
                  )}
                >
                  {isTeam ? (
                    <Building2 className="w-2.5 h-2.5" />
                  ) : (
                    <User className="w-2.5 h-2.5" />
                  )}
                  {isTeam ? `${teamName ?? "Team"}` : "Personal"}
                </span>
                <span
                  className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                    config.chain === "mainnet"
                      ? "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30"
                      : "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30",
                  )}
                >
                  {config.chain === "mainnet" ? "Mainnet" : "Testnet"}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  #{config.id}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {!isActive && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onSetActive(config)}
                  disabled={isSetting}
                  className="h-7 text-[11px] px-2.5"
                >
                  {isSetting ? "Setting…" : "Set active"}
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onEdit(config)}
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
              >
                <Edit className="w-3.5 h-3.5" />
              </Button>
              {!isTeam && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onDelete(config)}
                  className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* Server + address */}
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Link2 className="w-3 h-3 shrink-0" />
              <span className="font-mono truncate">
                {config.serverUrl || "https://zec.rocks:443"}
              </span>
            </div>

            {isActive && liveAddress && (
              <div className="flex items-center gap-2 text-[11px] pt-1.5 border-t border-border/60">
                <Wallet className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="font-mono text-muted-foreground truncate">
                  {truncate(liveAddress)}
                </span>
                <div className="ml-auto">
                  <CopyBtn text={liveAddress} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main settings page
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const {
    currentUser,
    zcashParams,
    address,
    teams,
    updateZcashParams,
    deleteZcashParams,
    setDefaultWallet,
  } = useBounty();
  const { toast } = useToast();

  const [section, setSection] = useState<Section>("wallets");
  const [importOpen, setImportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<ZcashParams | null>(
    null,
  );
  const [configToDelete, setConfigToDelete] = useState<ZcashParams | null>(
    null,
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSettingDefault, setIsSettingDefault] = useState<string | null>(null);
  const [recoveryTarget, setRecoveryTarget] = useState<ZcashParams | null>(
    null,
  );
  const [walletQuery, setWalletQuery] = useState("");
  const [walletFilter, setWalletFilter] = useState<"all" | "personal" | "team">(
    "all",
  );

  const [editForm, setEditForm] = useState({
    accountName: "",
    chain: "mainnet",
    serverUrl: "https://zec.rocks:443",
  });

  const activeConfig =
    zcashParams.find((p) => p.isDefault) ??
    (zcashParams.length > 0 ? zcashParams[zcashParams.length - 1] : null);

  useEffect(() => {
    if (activeConfig) setSelectedConfig(activeConfig);
  }, [activeConfig?.accountName]);

  const { team: teamWallets, personal: personalWallets } = partitionWallets(
    zcashParams ?? [],
    teams ?? [],
  );

  const allWallets = useMemo(
    () => [...personalWallets, ...teamWallets],
    [personalWallets, teamWallets],
  );

  useEffect(() => {
    if (activeConfig && !recoveryTarget) setRecoveryTarget(activeConfig);
  }, [activeConfig?.accountName]);

  // Filtered/searched lists for wallets panel
  const filteredPersonal = useMemo(() => {
    if (walletFilter === "team") return [];
    const q = walletQuery.trim().toLowerCase();
    return personalWallets.filter(
      (w) => !q || w.accountName.toLowerCase().includes(q),
    );
  }, [personalWallets, walletQuery, walletFilter]);

  const filteredTeam = useMemo(() => {
    if (walletFilter === "personal") return [];
    const q = walletQuery.trim().toLowerCase();
    return teamWallets.filter(
      (w) =>
        !q ||
        w.accountName.toLowerCase().includes(q) ||
        (w.teamName ?? "").toLowerCase().includes(q),
    );
  }, [teamWallets, walletQuery, walletFilter]);

  // Edit handlers
  const openEdit = (c: ZcashParams) => {
    setSelectedConfig(c);
    setEditForm({
      accountName: c.accountName,
      chain: c.chain || "mainnet",
      serverUrl: c.serverUrl || "https://zec.rocks:443",
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!selectedConfig) return;
    setIsUpdating(true);
    try {
      await updateZcashParams(selectedConfig.accountName, {
        accountName: editForm.accountName,
        chain: editForm.chain,
        serverUrl: editForm.serverUrl,
      });
      toast({ title: "Saved", description: "Configuration updated." });
      setEditOpen(false);
    } catch {
      toast({
        title: "Error",
        description: "Failed to update.",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleChainChange = (v: string) => {
    setEditForm((p) => ({
      ...p,
      chain: v,
      serverUrl:
        v === "mainnet"
          ? "https://zec.rocks:443"
          : "https://testnet.zec.rocks:443",
    }));
  };

  const openDelete = (c: ZcashParams) => {
    setConfigToDelete(c);
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!configToDelete) return;
    setIsUpdating(true);
    try {
      await deleteZcashParams(configToDelete.accountName);
      toast({
        title: "Deleted",
        description: `"${configToDelete.accountName}" removed.`,
      });
      setDeleteOpen(false);
      setConfigToDelete(null);
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete.",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSetActive = async (c: ZcashParams) => {
    setIsSettingDefault(c.accountName);
    try {
      await setDefaultWallet(c.accountName, c.teamId ?? undefined);
      toast({
        title: "Active wallet updated",
        description: `"${c.accountName}" is now active.`,
      });
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

  // ── Section renderers ────────────────────────────────────────────────────

  function renderWallets() {
    const empty = allWallets.length === 0;
    const totalShown = filteredPersonal.length + filteredTeam.length;

    return (
      <div>
        <PageHeader
          icon={Wallet}
          title="Wallet configurations"
          description="Manage your Zcash wallets. The active wallet is used for all payment operations."
          actions={
            !empty && (
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => setImportOpen(true)}
              >
                <Download className="w-3.5 h-3.5" />
                Import wallet
              </Button>
            )
          }
        />

        {empty ? (
          <EmptyState
            icon={Wallet}
            title="No wallets configured"
            hint="Import a wallet to get started."
            action={
              <Button size="sm" onClick={() => setImportOpen(true)}>
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Import wallet
              </Button>
            }
          />
        ) : (
          <div className="space-y-5">
            {/* Active wallet hero */}
            {activeConfig && (
              <div className="relative overflow-hidden rounded-xl border border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 via-emerald-50/50 to-transparent dark:from-emerald-950/30 dark:via-emerald-950/10 dark:to-transparent p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">
                        Active wallet
                      </span>
                      <span className="w-1 h-1 rounded-full bg-emerald-500" />
                      <span className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70">
                        receiving payments
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100 mt-0.5">
                      {activeConfig.accountName}
                    </p>
                    {address && (
                      <p className="text-[11px] font-mono text-emerald-800/70 dark:text-emerald-300/70 truncate">
                        {truncate(address, 18, 14)}
                      </p>
                    )}
                  </div>
                  {address && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5 bg-white/60 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800"
                      onClick={() => {
                        navigator.clipboard.writeText(address);
                        toast({ title: "Address copied" });
                      }}
                    >
                      <Copy className="w-3 h-3" />
                      Copy address
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Search + filter toolbar */}
            {allWallets.length > 2 && (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <Input
                    placeholder="Search wallets…"
                    value={walletQuery}
                    onChange={(e) => setWalletQuery(e.target.value)}
                    className="h-8 text-xs pl-8"
                  />
                </div>
                <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-border bg-muted/40">
                  {(["all", "personal", "team"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setWalletFilter(f)}
                      className={cn(
                        "px-2.5 py-1 rounded-md text-[11px] font-semibold capitalize transition-colors",
                        walletFilter === f
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {totalShown === 0 ? (
              <EmptyState
                icon={Search}
                title="No wallets match"
                hint="Try a different search or filter."
              />
            ) : (
              <>
                {/* Personal */}
                {filteredPersonal.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2.5">
                      <User className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                      <span className="text-[10px] font-bold text-sky-700 dark:text-sky-300 uppercase tracking-widest">
                        Personal
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        · {filteredPersonal.length}
                      </span>
                      <div className="flex-1 h-px bg-border ml-1" />
                    </div>
                    <div className="space-y-2.5">
                      {filteredPersonal.map((c) => (
                        <WalletCard
                          key={c.id}
                          config={c}
                          isActive={c.id === activeConfig?.id}
                          liveAddress={
                            c.id === activeConfig?.id ? address : undefined
                          }
                          onEdit={openEdit}
                          onDelete={openDelete}
                          onSetActive={handleSetActive}
                          isSettingDefault={isSettingDefault}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Team */}
                {filteredTeam.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2.5">
                      <Users className="w-3 h-3 text-violet-600 dark:text-violet-400" />
                      <span className="text-[10px] font-bold text-violet-700 dark:text-violet-300 uppercase tracking-widest">
                        Teams
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        · {filteredTeam.length}
                      </span>
                      <div className="flex-1 h-px bg-border ml-1" />
                    </div>
                    <div className="space-y-2.5">
                      {filteredTeam.map((c) => (
                        <WalletCard
                          key={c.id}
                          config={c}
                          isActive={c.id === activeConfig?.id}
                          teamName={c.teamName}
                          liveAddress={
                            c.id === activeConfig?.id ? address : undefined
                          }
                          onEdit={openEdit}
                          onDelete={openDelete}
                          onSetActive={handleSetActive}
                          isSettingDefault={isSettingDefault}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderRecovery() {
    return (
      <div>
        <PageHeader
          icon={KeyRound}
          title="Recovery information"
          description="Access seed phrases, viewing keys, and birthday heights. Store these securely offline — never share them."
        />

        {allWallets.length === 0 ? (
          <EmptyState icon={KeyRound} title="No wallets to recover" />
        ) : activeConfig ? (
          <div className="space-y-4">
            {/* Active wallet indicator */}
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-muted/50 border border-border">
              <div className="w-6 h-6 rounded-md bg-sky-100 dark:bg-sky-950/50 flex items-center justify-center shrink-0">
                {activeConfig.isTeam ? (
                  <Building2 className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                ) : (
                  <User className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate">
                  {activeConfig.accountName}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Active wallet
                </p>
              </div>
              <span
                className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded",
                  activeConfig.chain === "mainnet"
                    ? "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30"
                    : "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30",
                )}
              >
                {activeConfig.chain === "mainnet" ? "Mainnet" : "Testnet"}
              </span>
            </div>

            <RecoveryPanel
              key={activeConfig.accountName}
              config={activeConfig}
            />
          </div>
        ) : (
          <EmptyState
            icon={KeyRound}
            title="No active wallet"
            hint="Set a wallet as active first."
          />
        )}
      </div>
    );
  }

  function renderNetwork() {
    return (
      <div>
        <PageHeader
          icon={Globe}
          title="Network & servers"
          description="Review and test the Lightwalletd server connection for each configured wallet."
        />

        {allWallets.length === 0 ? (
          <EmptyState icon={Server} title="No wallets configured" />
        ) : (
          <div className="space-y-3">
            {allWallets.map((c) => {
              const tw = teamWallets.find((t) => t.id === c.id);
              const isActive = c.id === activeConfig?.id;
              return (
                <div
                  key={c.id}
                  className={cn(
                    "rounded-xl border bg-card p-4 space-y-3 transition-colors",
                    isActive
                      ? "border-sky-300 dark:border-sky-700 bg-sky-50/30 dark:bg-sky-950/10"
                      : "border-border hover:border-muted-foreground/30",
                  )}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold truncate">
                        {c.accountName}
                      </span>
                      {isActive && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Active
                        </span>
                      )}
                      {tw?.teamName && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-violet-600 dark:text-violet-400">
                          <Building2 className="w-2.5 h-2.5" />
                          {tw.teamName}
                        </span>
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full",
                        c.chain === "mainnet"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
                      )}
                    >
                      {c.chain === "mainnet" ? "Mainnet" : "Testnet"}
                    </span>
                  </div>

                  <div className="flex items-start gap-2 rounded-lg bg-muted/50 border border-border px-3 py-2.5">
                    <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold mb-0.5">
                        Lightwalletd server
                      </p>
                      <p className="text-xs font-mono break-all">
                        {c.serverUrl || "https://zec.rocks:443"}
                      </p>
                    </div>
                    <CopyBtn
                      text={c.serverUrl || "https://zec.rocks:443"}
                      label=""
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    {isActive && <ConnectionTest accountName={c.accountName} />}
                    {isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => openEdit(c)}
                      >
                        <Edit className="w-3 h-3" />
                        Edit server
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function renderSync() {
    return (
      <div>
        <PageHeader
          icon={Activity}
          title="Sync status & rescan"
          description="Monitor wallet sync progress and trigger a full rescan if transactions are missing."
        />
        <SyncPanel />
      </div>
    );
  }

  function renderTeamHunter() {
    return (
      <div>
        <PageHeader
          icon={ArrowRightLeft}
          title="Convert team users to hunter"
          description="Change a user's role from Team to Hunter. Converting deletes any team they created and its wallet, unless they're marked isRobin."
        />
        <TeamToHunterPanel />
      </div>
    );
  }

  function renderDanger() {
    const deletable = allWallets.filter((w) => !w.isTeam);
    return (
      <div>
        <PageHeader
          icon={AlertTriangle}
          title="Danger zone"
          description="Irreversible operations. Proceed with caution."
        />

        <div className="rounded-xl border border-destructive/30 bg-destructive/[0.02] dark:bg-destructive/5 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-destructive/20 bg-destructive/5 dark:bg-destructive/10">
            <p className="text-[10px] font-bold uppercase tracking-widest text-destructive/90 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" />
              Destructive actions
            </p>
          </div>

          {deletable.length === 0 ? (
            <div className="p-8 text-center">
              <Shield className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                No personal wallets to delete
              </p>
            </div>
          ) : (
            <div className="divide-y divide-destructive/15">
              {deletable.map((w) => (
                <div
                  key={w.id}
                  className="p-4 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      Delete "{w.accountName}"
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Permanently remove this wallet configuration from the
                      server. This cannot be undone.
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8 text-xs shrink-0"
                    onClick={() => openDelete(w)}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const sectionContent: Record<Section, () => React.ReactNode> = {
    wallets: renderWallets,
    recovery: renderRecovery,
    network: renderNetwork,
    sync: renderSync,
    "team-hunter": renderTeamHunter,
    danger: renderDanger,
  };

  const visibleNav =
    currentUser?.role === "ADMIN" ? NAV : NAV.filter((n) => !n.adminOnly);

  const configNav = visibleNav.filter((n) => n.group === "config");
  const teamsNav = visibleNav.filter((n) => n.group === "teams");
  const advancedNav = visibleNav.filter((n) => n.group === "advanced");

  // ── Layout ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <AdminNavbar isAdmin={true} />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-col imd:flex-row gap-8">
          {/* Sidebar nav — imd+ only */}
          <aside className="w-52 shrink-0 hidden imd:block">
            <nav className="sticky top-[5.5rem] space-y-5">
              <div>
                <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                  Configuration
                </p>
                <div className="space-y-0.5">
                  {configNav.map((item) => (
                    <NavButton
                      key={item.id}
                      item={item}
                      active={section === item.id}
                      onClick={() => setSection(item.id)}
                    />
                  ))}
                </div>
              </div>
              {teamsNav.length > 0 && (
                <div>
                  <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                    Teams
                  </p>
                  <div className="space-y-0.5">
                    {teamsNav.map((item) => (
                      <NavButton
                        key={item.id}
                        item={item}
                        active={section === item.id}
                        onClick={() => setSection(item.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {advancedNav.length > 0 && (
                <div>
                  <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                    Advanced
                  </p>
                  <div className="space-y-0.5">
                    {advancedNav.map((item) => (
                      <NavButton
                        key={item.id}
                        item={item}
                        active={section === item.id}
                        onClick={() => setSection(item.id)}
                        danger={item.id === "danger"}
                      />
                    ))}
                  </div>
                </div>
              )}
            </nav>
          </aside>

          {/* Mobile nav — dropdown, hidden at imd+ */}
          <div className="imd:hidden w-full mb-2">
            <Select
              value={section}
              onValueChange={(v) => setSection(v as Section)}
            >
              <SelectTrigger className="w-full h-10 text-sm font-medium bg-background border-border">
                <div className="flex items-center gap-2">
                  {(() => {
                    const active = visibleNav.find((n) => n.id === section);
                    if (!active) return null;
                    return (
                      <>
                        <active.icon
                          className={cn(
                            "w-3.5 h-3.5 shrink-0",
                            section === "danger"
                              ? "text-destructive"
                              : "text-primary",
                          )}
                        />
                        <SelectValue />
                      </>
                    );
                  })()}
                </div>
              </SelectTrigger>
              <SelectContent className="w-full">
                {configNav.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Configuration
                    </div>
                    {configNav.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        <span className="flex items-center gap-2">
                          <item.icon className="w-3.5 h-3.5 text-muted-foreground" />
                          {item.label}
                        </span>
                      </SelectItem>
                    ))}
                  </>
                )}
                {teamsNav.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">
                      Teams
                    </div>
                    {teamsNav.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        <span className="flex items-center gap-2">
                          <item.icon className="w-3.5 h-3.5 text-muted-foreground" />
                          {item.label}
                        </span>
                      </SelectItem>
                    ))}
                  </>
                )}
                {advancedNav.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">
                      Advanced
                    </div>
                    {advancedNav.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        <span
                          className={cn(
                            "flex items-center gap-2",
                            item.id === "danger" && "text-destructive",
                          )}
                        >
                          <item.icon
                            className={cn(
                              "w-3.5 h-3.5",
                              item.id === "danger"
                                ? "text-destructive"
                                : "text-muted-foreground",
                            )}
                          />
                          {item.label}
                        </span>
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          <main className="flex-1 min-w-0">{sectionContent[section]()}</main>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="w-full max-w-sm p-5">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Edit className="w-3.5 h-3.5 text-primary" />
              Edit configuration
            </DialogTitle>
            <DialogDescription className="text-xs">
              Update account name, network, or server URL.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 mt-2">
            <div>
              <Label htmlFor="edit-name" className="text-xs">
                Account name
              </Label>
              <Input
                id="edit-name"
                value={editForm.accountName}
                onChange={(e) =>
                  setEditForm((p) => ({ ...p, accountName: e.target.value }))
                }
                className="mt-1.5 h-9 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="edit-chain" className="text-xs">
                Network
              </Label>
              <Select value={editForm.chain} onValueChange={handleChainChange}>
                <SelectTrigger className="mt-1.5 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mainnet">Mainnet</SelectItem>
                  <SelectItem value="testnet">Testnet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-server" className="text-xs">
                Server URL
              </Label>
              <Input
                id="edit-server"
                value={editForm.serverUrl}
                onChange={(e) =>
                  setEditForm((p) => ({ ...p, serverUrl: e.target.value }))
                }
                className="mt-1.5 h-9 text-sm font-mono"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditOpen(false)}
                disabled={isUpdating}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={saveEdit} disabled={isUpdating}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                {isUpdating ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
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
              ? This removes all associated wallet data and{" "}
              <strong>cannot be undone</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 mt-2">
            <AlertDialogCancel disabled={isUpdating} className="h-8 text-xs">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isUpdating}
              className="bg-destructive hover:bg-destructive/90 h-8 text-xs"
            >
              {isUpdating ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportWalletModal open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar nav button
// ─────────────────────────────────────────────────────────────────────────────

function NavButton({
  item,
  active,
  onClick,
  danger,
}: {
  item: {
    id: Section;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  };
  active: boolean;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all text-left group",
        active
          ? danger
            ? "bg-destructive/10 text-destructive font-semibold"
            : "bg-primary/10 text-primary font-semibold"
          : danger
            ? "text-muted-foreground hover:text-destructive hover:bg-destructive/5"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
      )}
    >
      <item.icon className="w-3.5 h-3.5 shrink-0" />
      <span className="flex-1">{item.label}</span>
      {active && (
        <span
          className={cn(
            "w-1 h-1 rounded-full",
            danger ? "bg-destructive" : "bg-primary",
          )}
        />
      )}
    </button>
  );
}
