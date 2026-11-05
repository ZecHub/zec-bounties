import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useBounty } from "@/lib/bounty-context";
import { displayName } from "@/lib/displayName";
import {
  enrollPayoutKey,
  listPayoutKeys,
  revokePayoutKey,
  type PayoutKey,
} from "@/lib/payout-passkeys";

const when = (iso: string) => new Date(iso).toLocaleString();

// Approvers manage their payout passkeys here, and can veto another approver's
// still-pending passkey during its review window.
export function PayoutKeysCard() {
  const { isLoading, currentUser } = useBounty();
  const [mine, setMine] = useState<PayoutKey[]>([]);
  const [pending, setPending] = useState<PayoutKey[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const data = await listPayoutKeys();
      setMine(data.mine);
      setPending(data.pending);
    } catch {
      /* not an approver, or offline: render nothing useful */
    }
  };

  useEffect(() => {
    if (isLoading || !currentUser) return; // isLoading from context is the auth guard
    load();
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

  const revoke = (id: string) =>
    run(() => revokePayoutKey(id).then(() => undefined));

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4" />
          <p className="text-sm font-medium">Payout passkeys</p>
        </div>
        <Button size="sm" variant="outline" disabled={busy} onClick={add}>
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add passkey"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Votes on payouts are signed with your passkey. A new passkey can only
        vote after a review delay, and the other approvers are notified.
      </p>

      {mine.length === 0 && (
        <p className="text-xs text-destructive">
          You have no passkey yet, so you can't vote.
        </p>
      )}
      {mine.map((k) => {
        const active = new Date(k.activatesAt) <= new Date();
        return (
          <div
            key={k.id}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span className="min-w-0 truncate">
              {k.label || "Passkey"}{" "}
              <span className="text-xs text-muted-foreground">
                {active ? "active" : `activates ${when(k.activatesAt)}`}
              </span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => revoke(k.id)}
            >
              Revoke
            </Button>
          </div>
        );
      })}

      {pending.length > 0 && (
        <div className="space-y-1.5 border-t pt-2">
          <p className="text-xs font-medium">
            Pending passkeys from other approvers
          </p>
          {pending.map((k) => (
            <div
              key={k.id}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="min-w-0 truncate">
                {k.user ? displayName(k.user as any) : "Approver"}{" "}
                <span className="text-xs text-muted-foreground">
                  added {when(k.createdAt)}, activates {when(k.activatesAt)}
                </span>
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => revoke(k.id)}
              >
                Revoke
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
