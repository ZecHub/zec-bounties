"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ShieldCheck,
  KeyRound,
  Unlock,
  Lock,
  RefreshCw,
  AlertCircle,
  Info,
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
  Clock,
  Hash,
  Layers,
  Fingerprint,
  LifeBuoy,
} from "lucide-react";
import type { RecoveryData } from "@/lib/types";
import { cn } from "@/lib/utils";

type Step = "idle" | "otp_sent" | "unlocked";

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 2000);
      }}
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
          Copy
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
          <p className="text-xs font-mono break-all leading-relaxed select-all">
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

function Stat({
  icon: Icon,
  label,
  value,
  sky,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sky?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5",
        sky
          ? "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800"
          : "bg-muted/60 text-foreground border-border",
      )}
    >
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

const shell =
  "rounded-xl border border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 to-amber-50/30 dark:from-amber-950/30 dark:to-amber-950/10 p-5";

export function RecoveryPanel({
  requestOtp,
  verifyOtp,
}: {
  requestOtp: () => Promise<{ message: string; email: string }>;
  verifyOtp: (otp: string) => Promise<RecoveryData>;
}) {
  const [step, setStep] = useState<Step>("idle");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [data, setData] = useState<RecoveryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequest = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await requestOtp();
      setMaskedEmail(res.email);
      setStep("otp_sent");
    } catch (e: any) {
      setError(e?.message ?? "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!otp.trim()) return setError("Enter the code from your email");
    setLoading(true);
    setError(null);
    try {
      setData(await verifyOtp(otp.trim()));
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

  const ErrorLine = () =>
    error ? (
      <p className="text-xs text-destructive flex items-center gap-1 mt-2">
        <AlertCircle className="w-3 h-3" />
        {error}
      </p>
    ) : null;

  if (step === "idle") {
    return (
      <div className={shell}>
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
            onClick={handleRequest}
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
          <ErrorLine />
        </div>
      </div>
    );
  }

  if (step === "otp_sent") {
    return (
      <div className={shell}>
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
              <span className="font-semibold text-amber-900 dark:text-amber-100">
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
              onKeyDown={(e) => e.key === "Enter" && handleVerify()}
              className="h-9 text-sm font-mono tracking-widest imd:w-32 imd:max-w-[128px]"
            />
            <Button
              size="sm"
              onClick={handleVerify}
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
              onClick={handleRequest}
              disabled={loading}
              className="h-9 text-xs text-muted-foreground"
            >
              Resend
            </Button>
          </div>
          <ErrorLine />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat
          icon={Clock}
          label="Birthday"
          value={data?.birthday?.toLocaleString() ?? "—"}
          sky
        />
        <Stat
          icon={Hash}
          label="Account"
          value={`#${data?.accountIndex ?? 0}`}
        />
        <Stat
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
          warning="Full control over the wallet's funds. Never share with anyone."
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
