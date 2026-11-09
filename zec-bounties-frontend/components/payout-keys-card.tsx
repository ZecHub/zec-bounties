import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  KeyRound,
  Loader2,
  Plus,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useBounty } from "@/lib/bounty-context";
import { displayName } from "@/lib/displayName";
import {
  enrollPayoutKey,
  listPayoutKeys,
  revokePayoutKey,
  type PayoutKey,
} from "@/lib/payout-passkeys";

// Keep the spinner up at least this long on first load, so fast responses
// don't make the card flash.
const MIN_LOADING_MS = 1500;

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

// "in 5h", "in 2d", "in 12m"
function timeUntil(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `in ${m}m`;
  const h = Math.ceil(m / 60);
  if (h < 48) return `in ${h}h`;
  return `in ${Math.ceil(h / 24)}d`;
}

function KeyRow({
  title,
  subtitle,
  active,
  actionLabel,
  destructive,
  busy,
  onAction,
}: {
  title: string;
  subtitle: string;
  active?: boolean;
  actionLabel: string;
  destructive?: boolean;
  busy: boolean;
  onAction: () => void;
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
          active
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        }`}
      >
        {active ? (
          <ShieldCheck className="h-4 w-4" />
        ) : (
          <ShieldAlert className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {subtitle}
        </p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={onAction}
        className={
          destructive
            ? "h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
            : "h-8 text-muted-foreground"
        }
      >
        {actionLabel}
      </Button>
    </li>
  );
}

// Approvers manage their payout passkeys here, and can veto another approver's
// still-pending passkey during its review window.
export function PayoutKeysCard() {
  const { isLoading, currentUser } = useBounty();
  const [mine, setMine] = useState<PayoutKey[]>([]);
  const [pending, setPending] = useState<PayoutKey[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await listPayoutKeys();
      setMine(data.mine);
      setPending(data.pending);
    } catch {
      /* not an approver, or offline */
    }
  };

  useEffect(() => {
    if (isLoading || !currentUser) return;
    let cancelled = false;
    (async () => {
      const started = Date.now();
      await load(); // swallows its own errors
      const remaining = MIN_LOADING_MS - (Date.now() - started);
      if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoading, currentUser?.id]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const add = () =>
    run(async () => {
      const key = await enrollPayoutKey();
      toast.success("Passkey added", {
        description: `It can vote from ${when(key.activatesAt)}. Other approvers were notified.`,
      });
    });

  const revoke = (id: string, own: boolean) => {
    if (
      own &&
      !confirm("Revoke this passkey? You won't be able to vote with it.")
    )
      return;
    run(() => revokePayoutKey(id).then(() => undefined));
  };

  const isActive = (k: PayoutKey) => new Date(k.activatesAt) <= new Date();

  return (
    <section className="flex h-full min-h-[24rem] flex-col overflow-hidden rounded-xl border bg-card">
      <header className="flex items-start justify-between gap-3 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <KeyRound className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold leading-tight">
              Payout passkeys
            </h3>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
              Payout votes are signed with your passkey. A new passkey can only
              vote after a review delay, and other approvers are notified.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || loading}
          onClick={add}
          className="shrink-0 gap-1.5"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Add passkey
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto border-t">
        {loading ? (
          <div
            className="flex h-full min-h-[10rem] flex-col items-center justify-center gap-2 px-4 py-8 text-center"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Loading passkeys…</p>
          </div>
        ) : mine.length === 0 ? (
          <div className="flex h-full min-h-[10rem] flex-col items-center justify-center gap-1 px-4 py-8 text-center">
            <p className="text-sm font-medium">No passkey yet</p>
            <p className="text-xs text-muted-foreground">
              Add one to be able to vote on payouts.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {mine.map((k) => {
              const active = isActive(k);
              return (
                <KeyRow
                  key={k.id}
                  title={k.label || "Passkey"}
                  subtitle={
                    active
                      ? "Active · can vote"
                      : `Activates ${timeUntil(k.activatesAt)} · ${when(k.activatesAt)}`
                  }
                  active={active}
                  actionLabel="Revoke"
                  destructive
                  busy={busy}
                  onAction={() => revoke(k.id, true)}
                />
              );
            })}
          </ul>
        )}
      </div>

      {!loading && pending.length > 0 && (
        <div className="border-t bg-amber-500/5">
          <div className="flex items-center justify-between px-4 pb-1 pt-3">
            <p className="text-xs font-medium">Awaiting your review</p>
            <Badge
              variant="outline"
              className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400"
            >
              {pending.length}
            </Badge>
          </div>
          <p className="px-4 text-xs text-muted-foreground">
            Veto any passkey you don't recognise before it activates.
          </p>
          <ul className="mt-1 divide-y divide-amber-500/10 pb-1">
            {pending.map((k) => (
              <KeyRow
                key={k.id}
                title={k.user ? displayName(k.user as any) : "Approver"}
                subtitle={`Added ${when(k.createdAt)} · activates ${timeUntil(k.activatesAt)}`}
                actionLabel="Veto"
                destructive
                busy={busy}
                onAction={() => revoke(k.id, false)}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
