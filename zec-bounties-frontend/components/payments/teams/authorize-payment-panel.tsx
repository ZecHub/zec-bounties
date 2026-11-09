import { useEffect, useRef, useState } from "react";
import { useBounty } from "@/lib/bounty-context";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  EyeOff,
  Hourglass,
  Loader2,
  Send,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { setNymSending } from "@/components/nym-sending-indicator";
import { PayoutKeysCard } from "@/components/payout-keys-card";
import { PayoutOpenCard, PayoutRoundCard } from "@/components/payout-round-row";
import type { Bounty, Team } from "@/lib/types";

const zec = (n: number) => `${n.toFixed(4)} ZEC`;

type Tone = "green" | "amber" | "yellow" | "red" | "muted";

const TONES: Record<Tone, { card: string; icon: string }> = {
  green: {
    card: "border-emerald-500/30 bg-emerald-500/5",
    icon: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  amber: {
    card: "border-amber-500/40 bg-amber-500/5",
    icon: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  yellow: {
    card: "border-yellow-500/40 bg-yellow-500/5",
    icon: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  },
  red: {
    card: "border-destructive/30 bg-destructive/5",
    icon: "bg-destructive/10 text-destructive",
  },
  muted: {
    card: "bg-card",
    icon: "bg-muted text-muted-foreground",
  },
};

// One of the three header cards (wallet / settlement / hidden).
function ActivityCard({
  tone,
  icon: Icon,
  title,
  children,
  live,
}: {
  tone: Tone;
  icon: React.ElementType;
  title: React.ReactNode;
  children: React.ReactNode;
  live?: boolean;
}) {
  const t = TONES[tone];
  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors duration-200 hover:border-foreground/20 ${t.card}`}
    >
      <span
        className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${t.icon}`}
      >
        <Icon className="h-3.5 w-3.5" />
        {live && (
          <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full border border-background bg-emerald-500" />
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold leading-tight">
          {title}
        </p>
        <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
          {children}
        </div>
      </div>
    </div>
  );
}

// --- Awaiting -> Ready "explosion" -----------------------------------------
const PAY_ANIM_CSS = `
@keyframes pay-explode {
  0%   { transform: translateX(0) scale(1); opacity: 1; filter: blur(0); }
  8%   { transform: translateX(-5px) scale(1); }
  16%  { transform: translateX(5px) scale(1); }
  24%  { transform: translateX(-4px) scale(1.01); }
  32%  { transform: translateX(3px) scale(1.02); opacity: 1; filter: blur(0); }
  100% { transform: translateX(0) scale(1.28); opacity: 0; filter: blur(10px); }
}
@keyframes pay-pop {
  0%   { transform: scale(0.6); opacity: 0; filter: blur(8px); }
  60%  { transform: scale(1.04); opacity: 1; filter: blur(0); }
  100% { transform: scale(1); opacity: 1; filter: blur(0); }
}
@keyframes pay-particle {
  0%   { transform: translate(-50%, -50%) rotate(var(--a)) translateX(0) scale(1); opacity: 1; }
  100% { transform: translate(-50%, -50%) rotate(var(--a)) translateX(var(--d)) scale(0); opacity: 0; }
}
@keyframes pay-ring {
  0%   { transform: translate(-50%, -50%) scale(0.15); opacity: 0.9; }
  100% { transform: translate(-50%, -50%) scale(3.2); opacity: 0; }
}
.pay-explode { animation: pay-explode 520ms cubic-bezier(.4,0,.2,1) forwards; }
.pay-pop { animation: pay-pop 520ms cubic-bezier(.2,.9,.3,1.2) both; }
.pay-particle { position: absolute; left: 50%; top: 50%; border-radius: 9999px; animation: pay-particle 750ms cubic-bezier(.1,.8,.3,1) forwards; }
.pay-ring { position: absolute; left: 50%; top: 50%; width: 140px; height: 140px; border-radius: 9999px; border: 2px solid rgb(16 185 129 / .7); animation: pay-ring 700ms ease-out forwards; }
@media (prefers-reduced-motion: reduce) {
  .pay-explode, .pay-pop, .pay-particle, .pay-ring { animation: none !important; }
  .pay-explode { opacity: 0; }
}
`;

const PARTICLE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#34d399", "#60a5fa"];
const PARTICLES = Array.from({ length: 28 }, (_, i) => ({
  angle: (360 / 28) * i + (i % 2 ? 6 : 0),
  dist: 90 + ((i * 37) % 90),
  size: 4 + ((i * 5) % 6),
  color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
  delay: 150 + ((i * 13) % 80),
}));

function Burst() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20"
    >
      <span className="pay-ring" style={{ animationDelay: "180ms" }} />
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="pay-particle"
          style={
            {
              "--a": `${p.angle}deg`,
              "--d": `${p.dist}px`,
              width: p.size,
              height: p.size,
              background: p.color,
              animationDelay: `${p.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

export function TeamAuthorizePaymentPanel({
  team,
  teamBounties,
  onPaid,
  bountiesLoading = false,
}: {
  team: Team;
  teamBounties: Bounty[];
  onPaid?: (bountyIds: string[]) => void;
  /** True while the team's bounty list itself is still being fetched. */
  bountiesLoading?: boolean;
}) {
  const {
    authorizeTeamDuePayment,
    payoutRounds = {},
    fetchPayoutRounds,
    isLoading,
    currentUser,
  } = useBounty();

  // A round is a batch, so the selection is by round, not by bounty.
  const [selectedRoundIds, setSelectedRoundIds] = useState<Set<string>>(
    new Set(),
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [roundsLoading, setRoundsLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Same stable-key-per-selection pattern as the admin panel, so a double
  // submit of the same payout is caught by the backend's replay guard.
  const attemptKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const keyForSelection = (ids: string[]) => {
    const fingerprint = [...ids].sort().join(",");
    if (attemptKey.current?.fingerprint !== fingerprint) {
      attemptKey.current = {
        fingerprint,
        key:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      };
    }
    return attemptKey.current.key;
  };

  const walletChainToBountyChain = (
    walletChain?: string,
  ): "TEST" | "MAIN" | null => {
    if (walletChain === "testnet") return "TEST";
    if (walletChain === "mainnet") return "MAIN";
    return null;
  };

  const activeChain = walletChainToBountyChain(team.wallet?.chain);

  // Exported bounties are paid outside the app (Export Completed).
  const payableBounties = teamBounties.filter(
    (b) =>
      b.status === "DONE" &&
      b.isApproved &&
      !b.isPaid &&
      !b.paymentInFlight &&
      !b.exportedAt &&
      b.chain === activeChain,
  );

  const blockedBounties = teamBounties.filter(
    (b) =>
      b.status === "DONE" &&
      b.isApproved &&
      !b.isPaid &&
      !b.paymentInFlight &&
      !b.exportedAt &&
      b.chain !== activeChain,
  );

  const inFlightBounties = teamBounties.filter(
    (b) => b.status === "DONE" && !b.isPaid && b.paymentInFlight,
  );

  // isLoading from context is the auth guard; no timeouts
  const payableKey = payableBounties
    .map((b) => b.id)
    .sort()
    .join(",");
  useEffect(() => {
    if (isLoading || !currentUser) return;
    if (!payableKey) {
      setRoundsLoading(false);
      return;
    }
    const keys = new Set(payableKey.split(","));
    // Rounds already in context for these bounties? Show them straight away
    // and just refresh in the background; only show the skeleton on a cold load.
    const cached = Object.values(payoutRounds).some((r) =>
      r.bountyIds.some((id) => keys.has(id)),
    );
    setRoundsLoading(!cached);
    let cancelled = false;
    (async () => {
      try {
        await fetchPayoutRounds(payableKey.split(","));
      } catch {
        /* fall back to whatever we have */
      }
      if (!cancelled) setRoundsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoading, currentUser?.id, payableKey]);

  const bountyById = new Map(teamBounties.map((b) => [b.id, b]));
  const bountiesOf = (r: { bountyIds: string[] }) =>
    r.bountyIds.map((id) => bountyById.get(id)).filter((b): b is Bounty => !!b);

  const payableIds = new Set(payableBounties.map((b) => b.id));
  const rounds = Object.values(payoutRounds).filter((r) =>
    r.bountyIds.some((id) => payableIds.has(id)),
  );
  const coveredIds = new Set(rounds.flatMap((r) => r.bountyIds));
  // Until the rounds have loaded we can't tell which bounties are already in a
  // round, so every payable bounty would look "uncovered" and briefly flash the
  // "Open one payout round for all" card. Treat them as unknown while loading.
  const uncovered = roundsLoading
    ? []
    : payableBounties.filter((b) => !coveredIds.has(b.id));

  // Ready: decided for ME as the executor, and past the lock delay.
  const isReady = (r: (typeof rounds)[number]) =>
    r.status === "DECIDED" &&
    r.executorId === currentUser?.id &&
    (!r.executableAt || new Date(r.executableAt).getTime() <= now);
  const readyRounds = rounds.filter(isReady);
  const waitingRounds = rounds.filter((r) => !isReady(r));

  const selectedRounds = readyRounds.filter((r) => selectedRoundIds.has(r.id));
  const selectedIds = new Set(selectedRounds.flatMap((r) => r.bountyIds));
  const totalSelected = selectedRounds.reduce(
    (sum, r) => sum + r.totalZat / 1e8,
    0,
  );

  const toggleOne = (roundId: string) => {
    setSelectedRoundIds((prev) => {
      const next = new Set(prev);
      next.has(roundId) ? next.delete(roundId) : next.add(roundId);
      return next;
    });
  };

  const toggleExpanded = (roundId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(roundId) ? next.delete(roundId) : next.add(roundId);
      return next;
    });
  };

  const allSelected =
    readyRounds.length > 0 && selectedRoundIds.size === readyRounds.length;
  const toggleAll = () => {
    setSelectedRoundIds(
      allSelected ? new Set() : new Set(readyRounds.map((r) => r.id)),
    );
  };

  const handleConfirmAuthorize = async () => {
    setShowConfirm(false);
    setIsProcessing(true);
    setNymSending(true);
    const ids = Array.from(selectedIds);
    const startedAt = Date.now();
    try {
      const result = await authorizeTeamDuePayment(
        team.id,
        ids,
        keyForSelection(ids),
      );
      const txid = result.txids[0];
      toast.success("Payment sent", {
        description:
          `${result.paidCount} bounty payment(s) sent in ${Math.round((Date.now() - startedAt) / 1000)}s` +
          (txid ? ` — tx ${txid.slice(0, 12)}…` : "") +
          (result.skipped.length > 0
            ? ` ${result.skipped.length} skipped: ${result.skipped
                .map((s) => `${s.title} (${s.reason})`)
                .join("; ")}`
            : ""),
        duration: 12000,
      });
      attemptKey.current = null;
      setSelectedRoundIds(new Set());

      // Report only bounties that were actually paid. `skipped` entries are
      // matched by title, since that's what the toast shows.
      const skippedTitles = new Set(result.skipped.map((s) => s.title));
      const paidIds = ids.filter((id) => {
        const b = bountyById.get(id);
        return !!b && !skippedTitles.has(b.title);
      });
      if (paidIds.length > 0) onPaid?.(paidIds);
    } catch (error: any) {
      const [title, ...rest] = error.message?.split(": ") ?? [];
      const description =
        rest.join(": ") || error.message || "Failed to authorize payment";
      toast.error(title || "Payment failed", { description, duration: 8000 });
    } finally {
      setIsProcessing(false);
      setNymSending(false);
    }
  };

  const awaitingCount = uncovered.length + waitingRounds.length;
  const hasReady = readyRounds.length > 0;
  const nInFlight = inFlightBounties.length;
  const nBlocked = blockedBounties.length;

  // --- Awaiting / Ready slot -------------------------------------------------
  // hasReady === "I am the selected executor and the lock delay has passed".
  // Awaiting shows immediately from local data (no waiting on the network), with
  // a small "Syncing" hint. Not selected -> nothing else happens. Selected ->
  // Awaiting explodes into Ready to pay once the rounds arrive. If the data was
  // already cached on mount, Ready simply appears with no animation.
  const [showReady, setShowReady] = useState(false);
  const [bursting, setBursting] = useState(false);
  const exploded = useRef(false);
  const everLoaded = useRef(false);
  const initialReady = useRef<boolean | null>(null);
  if (initialReady.current === null) initialReady.current = hasReady;

  useEffect(() => {
    if (roundsLoading) return;
    if (!hasReady) {
      exploded.current = false;
      everLoaded.current = true;
      initialReady.current = false;
      setShowReady(false);
      setBursting(false);
      return;
    }
    if (exploded.current) return; // already played for this "ready" run
    exploded.current = true;
    if (initialReady.current && !everLoaded.current) {
      everLoaded.current = true;
      setShowReady(true); // cached: no animation
      return;
    }
    everLoaded.current = true;
    setBursting(true);
    // Not cleared on re-run on purpose, so React StrictMode's double effect
    // can't cancel the animation in dev.
    setTimeout(() => setShowReady(true), 520);
    setTimeout(() => setBursting(false), 1300);
  }, [roundsLoading, hasReady]);

  const readyNow = showReady || (initialReady.current === true && hasReady);

  const awaitingCard = (exploding: boolean, checking: boolean) => (
    <section
      className={`flex h-full min-h-[24rem] flex-col overflow-hidden rounded-xl border bg-card ${
        exploding ? "pay-explode" : ""
      }`}
    >
      <header className="flex items-start justify-between gap-3 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Hourglass className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold leading-tight">
              Awaiting proposal
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Completed bounties waiting for approvers to sign off on a payout.
            </p>
          </div>
        </div>
        {checking ? (
          <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Syncing
          </span>
        ) : (
          awaitingCount > 0 && (
            <span className="shrink-0 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-blue-700 dark:text-blue-400">
              {awaitingCount}
            </span>
          )
        )}
      </header>

      <div className="flex-1 overflow-y-auto border-t">
        {awaitingCount === 0 && checking ? (
          // Still syncing: don't flash the "Nothing in review" message.
          <div className="h-full min-h-[10rem]" />
        ) : awaitingCount === 0 ? (
          <div className="flex h-full min-h-[10rem] flex-col items-center justify-center gap-1 px-4 py-8 text-center">
            <p className="text-sm font-medium">Nothing in review</p>
            <p className="text-xs text-muted-foreground">
              New completed bounties will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-2 p-3">
            {uncovered.length > 0 && <PayoutOpenCard bounties={uncovered} />}
            {waitingRounds.map((r) => (
              <PayoutRoundCard key={r.id} round={r} bounties={bountiesOf(r)} />
            ))}
          </div>
        )}
      </div>
    </section>
  );

  const readyCard = (
    <section className="pay-pop flex h-full min-h-[24rem] flex-col overflow-hidden rounded-xl border bg-card">
      <header className="flex items-start justify-between gap-3 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Send className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold leading-tight">
              Ready to pay
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              You were selected to send these payouts
              {awaitingCount > 0
                ? ` · ${awaitingCount} more awaiting proposal`
                : ""}
              .
            </p>
          </div>
        </div>
        <label
          htmlFor="team-select-all"
          className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground"
        >
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleAll}
            id="team-select-all"
          />
          All
        </label>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto border-t p-3">
        {readyRounds.map((round) => {
          const list = bountiesOf(round);
          const selected = selectedRoundIds.has(round.id);
          const expanded = expandedIds.has(round.id);
          return (
            <div
              key={round.id}
              className={`overflow-hidden rounded-lg border transition-all duration-200 ${
                selected
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "bg-card hover:border-foreground/20"
              }`}
            >
              <div
                onClick={() => toggleOne(round.id)}
                className="flex cursor-pointer items-center gap-3 p-3"
              >
                <Checkbox
                  checked={selected}
                  onCheckedChange={() => toggleOne(round.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {round.bountyIds.length} bount
                    {round.bountyIds.length === 1 ? "y" : "ies"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {list.map((b) => b.title).join(", ")}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                  {zec(round.totalZat / 1e8)}
                </span>
                <button
                  type="button"
                  aria-label={expanded ? "Hide details" : "Show details"}
                  aria-expanded={expanded}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpanded(round.id);
                  }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${
                      expanded ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </div>

              {expanded && (
                <ul className="divide-y border-t bg-background/60 animate-in fade-in slide-in-from-top-1 duration-200">
                  {list.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 pl-12 text-sm"
                    >
                      <span className="min-w-0 truncate">{b.title}</span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="text-xs text-muted-foreground">
                          {b.assigneeUser?.name ?? "Unknown"}
                        </span>
                        <span className="font-mono text-xs font-medium tabular-nums">
                          {zec(b.bountyAmount)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <footer className="flex items-center justify-between gap-3 border-t bg-muted/30 p-3">
        <div className="min-w-0 pl-1">
          {selectedIds.size > 0 ? (
            <>
              <p className="text-sm font-semibold tabular-nums">
                {zec(totalSelected)}
              </p>
              <p className="text-xs text-muted-foreground">
                {selectedIds.size} bount
                {selectedIds.size === 1 ? "y" : "ies"} selected
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select batches to pay out
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedRoundIds(new Set())}
              disabled={isProcessing}
              className="gap-1 text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
          <Button
            onClick={() => setShowConfirm(true)}
            disabled={selectedIds.size === 0 || isProcessing || !team.wallet}
            className="gap-2"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Authorize
                {selectedIds.size > 0 ? ` ${selectedIds.size}` : ""}
              </>
            )}
          </Button>
        </div>
      </footer>
    </section>
  );

  return (
    <div className="space-y-5">
      {/* 1. Header row: wallet / settlement / hidden */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {/* Wallet */}
        {team.wallet ? (
          <ActivityCard
            tone="green"
            icon={Wallet}
            live
            title={
              <>
                Paying from{" "}
                <span className="font-bold">{team.wallet.accountName}</span>
              </>
            }
          >
            <span className="capitalize">{team.wallet.chain}</span> wallet ·
            payouts are sent from here.
          </ActivityCard>
        ) : (
          <ActivityCard tone="red" icon={Wallet} title="No wallet connected">
            Add a wallet in the Wallet tab to pay out bounties.
          </ActivityCard>
        )}

        {/* Awaiting settlement */}
        {nInFlight > 0 ? (
          <ActivityCard
            tone="amber"
            icon={AlertTriangle}
            title={`${nInFlight} payment${nInFlight > 1 ? "s" : ""} awaiting settlement`}
          >
            The wallet didn't confirm the send, so{" "}
            {nInFlight > 1 ? "they are" : "it is"} locked against retry. Check
            the wallet history and resolve from the Transactions tab.
          </ActivityCard>
        ) : (
          <ActivityCard
            tone="muted"
            icon={CheckCircle2}
            title="No pending settlements"
          >
            Every payment sent has been confirmed by the wallet.
          </ActivityCard>
        )}

        {/* Hidden (wrong chain) */}
        {nBlocked > 0 ? (
          <ActivityCard
            tone="yellow"
            icon={EyeOff}
            title={`${nBlocked} bount${nBlocked > 1 ? "ies" : "y"} hidden`}
          >
            The team wallet is on{" "}
            <span className="font-medium text-foreground">
              {team.wallet?.chain ?? "an unknown chain"}
            </span>{" "}
            but {nBlocked > 1 ? "those bounties are" : "that bounty is"} on{" "}
            <span className="font-medium text-foreground">
              {activeChain === "TEST" ? "mainnet" : "testnet"}
            </span>
            .
          </ActivityCard>
        ) : (
          <ActivityCard
            tone="muted"
            icon={CheckCircle2}
            title="No hidden bounties"
          >
            All completed bounties match the wallet's chain.
          </ActivityCard>
        )}
      </div>

      {/* 2. Passkeys + (skeleton -> Awaiting | BOOM -> Ready), same slot */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
        <PayoutKeysCard />

        <div className="relative h-full">
          <style>{PAY_ANIM_CSS}</style>

          {readyNow
            ? readyCard
            : awaitingCard(
                hasReady && bursting,
                (roundsLoading || bountiesLoading) && !hasReady,
              )}

          {bursting && <Burst />}
        </div>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Team Payment</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  You are about to authorize{" "}
                  <span className="font-semibold text-foreground">
                    {selectedIds.size} payment{selectedIds.size > 1 ? "s" : ""}
                  </span>{" "}
                  totalling{" "}
                  <span className="font-semibold text-foreground">
                    {totalSelected.toFixed(4)} ZEC
                  </span>{" "}
                  from {team.name}'s wallet{" "}
                  <span className="font-semibold text-foreground">
                    {team.wallet?.accountName}
                  </span>{" "}
                  on{" "}
                  <span className="font-semibold text-foreground">
                    {team.wallet?.chain}
                  </span>
                  .
                </p>

                <div className="max-h-48 divide-y overflow-y-auto rounded-lg border bg-muted/40">
                  {teamBounties
                    .filter((b) => selectedIds.has(b.id))
                    .map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between px-3 py-2 text-sm"
                      >
                        <span className="max-w-[60%] truncate font-medium text-foreground">
                          {b.title}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {b.assigneeUser?.name ?? "Unknown"}
                          </span>
                          <span className="font-mono text-xs font-semibold">
                            {b.bountyAmount.toFixed(4)} ZEC
                          </span>
                        </div>
                      </div>
                    ))}
                </div>

                <p className="text-xs font-medium text-destructive">
                  This action cannot be undone.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAuthorize}
              disabled={isProcessing}
              className="bg-primary hover:bg-primary/90"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Confirm & Send"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
