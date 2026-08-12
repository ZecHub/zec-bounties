"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Coins,
  Loader2,
  Tag,
  User,
  Copy,
  Check,
} from "lucide-react";
import { useBounty } from "@/lib/bounty-context";
import type { Bounty } from "@/lib/types";

/* ─── status config ─────────────────────────────────────────────────────── */

const STATUS_CONFIG: Record<
  string,
  { label: string; dot: string; text: string; bg: string }
> = {
  TO_DO: {
    label: "To Do",
    dot: "bg-slate-400",
    text: "text-slate-600",
    bg: "bg-slate-100",
  },
  IN_PROGRESS: {
    label: "In Progress",
    dot: "bg-blue-500",
    text: "text-blue-700",
    bg: "bg-blue-50",
  },
  IN_REVIEW: {
    label: "In Review",
    dot: "bg-amber-400",
    text: "text-amber-700",
    bg: "bg-amber-50",
  },
  DONE: {
    label: "Done",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    bg: "bg-emerald-50",
  },
  CANCELLED: {
    label: "Cancelled",
    dot: "bg-red-400",
    text: "text-red-700",
    bg: "bg-red-50",
  },
};

/* ─── helpers ────────────────────────────────────────────────────────────── */

function fmtDate(d: Date, long = false) {
  return d.toLocaleDateString("en-US", {
    month: long ? "long" : "short",
    day: "numeric",
    year: "numeric",
  });
}

function AddressField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      {value ? (
        <div className="flex items-start gap-2 group">
          <p className="font-mono text-[11px] leading-relaxed break-all text-foreground/80 flex-1">
            {value}
          </p>
          <button
            onClick={copy}
            className="mt-0.5 shrink-0 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Copy address"
          >
            {copied ? (
              <Check className="w-3 h-3 text-emerald-500" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground/50 italic">Not provided</p>
      )}
    </div>
  );
}

/* ─── sidebar meta row ───────────────────────────────────────────────────── */

function MetaRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
      <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
          {label}
        </p>
        <div className="text-xs text-foreground font-medium">{value}</div>
      </div>
    </div>
  );
}

/* ─── page ───────────────────────────────────────────────────────────────── */

export default function BountyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { fetchBountyById } = useBounty();

  const [bounty, setBounty] = useState<Bounty | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchBountyById(id)
      .then((data) => {
        if (!data) setNotFound(true);
        else setBounty(data);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  /* loading */
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  /* not found */
  if (notFound || !bounty) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">Bounty not found.</p>
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
          Go back
        </Button>
      </div>
    );
  }

  const status = STATUS_CONFIG[bounty.status] ?? {
    label: bounty.status,
    dot: "bg-slate-400",
    text: "text-slate-600",
    bg: "bg-slate-100",
  };

  const primaryAssignee =
    bounty.assigneeUser ?? bounty.assignees?.[0]?.user ?? null;

  const deadlineDate = bounty.timeToComplete
    ? new Date(bounty.timeToComplete)
    : null;
  const createdDate = bounty.dateCreated ? new Date(bounty.dateCreated) : null;

  const uaAddress = primaryAssignee?.UA_address;
  const zAddress = primaryAssignee?.z_address;
  const hasAnyAddress = uaAddress || zAddress;

  return (
    <main className="min-h-screen bg-background text-foreground text-sm">
      {/* ── top bar ── */}
      <div className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-11 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="h-7 px-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </Button>
          <span className="text-xs text-muted-foreground/50">·</span>
          <span className="text-xs text-muted-foreground font-mono">
            #{bounty.id.slice(0, 8)}
          </span>

          {/* status pill — top-bar on mobile */}
          <div className="ml-auto sm:hidden">
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${status.bg} ${status.text}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
              {status.label}
            </span>
          </div>
        </div>
      </div>

      {/* ── body ── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_224px] gap-8 items-start">
          {/* ── left: main content ── */}
          <div className="space-y-7 min-w-0">
            {/* title + status */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <h1 className="text-xl font-semibold leading-snug flex-1">
                  {bounty.title}
                </h1>
                {/* status pill — desktop only */}
                <span
                  className={`hidden sm:inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full ${status.bg} ${status.text}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                  {status.label}
                </span>
              </div>

              {/* inline meta chips */}
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 font-semibold text-foreground">
                  <Coins className="w-3.5 h-3.5 text-amber-500" />
                  {bounty.bountyAmount} ZEC
                </span>
                {bounty.category?.name && (
                  <span className="flex items-center gap-1 bg-muted px-2 py-0.5 rounded-md">
                    <Tag className="w-3 h-3" />
                    {bounty.category.name}
                  </span>
                )}
                {bounty.isPaid && (
                  <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md font-medium">
                    <Check className="w-3 h-3" />
                    Paid
                    {bounty.paidAt &&
                      ` · ${fmtDate(new Date(bounty.paidAt), true)}`}
                  </span>
                )}
              </div>
            </div>

            {/* description */}
            {bounty.description && (
              <section className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Description
                </p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/85">
                  {bounty.description}
                </p>
              </section>
            )}

            {/* ── payment addresses — always visible ── */}
            {hasAnyAddress && (
              <section className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Payment Addresses
                </p>
                <div className="rounded-lg border bg-muted/30 divide-y divide-border/60">
                  {uaAddress && (
                    <div className="px-4 py-3">
                      <AddressField
                        label="Unified Address (UA)"
                        value={uaAddress}
                      />
                    </div>
                  )}
                  {zAddress && (
                    <div className="px-4 py-3">
                      <AddressField
                        label="Shielded Address (Z)"
                        value={zAddress}
                      />
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* assignees */}
            {bounty.assignees && bounty.assignees.length > 0 && (
              <section className="space-y-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {bounty.assignees.length === 1 ? "Assignee" : "Assignees"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {bounty.assignees.map((a) => {
                    const user = a.user;
                    return (
                      <div
                        key={a.userId ?? user?.id}
                        className="flex items-center gap-2 border rounded-md px-2.5 py-1.5 bg-muted/40"
                      >
                        <Avatar className="w-5 h-5">
                          {user?.avatar && (
                            <AvatarImage
                              src={user.avatar}
                              alt={user.name ?? ""}
                            />
                          )}
                          <AvatarFallback className="text-[9px]">
                            {user?.name?.[0]?.toUpperCase() ?? (
                              <User className="w-2.5 h-2.5" />
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-xs font-medium leading-none">
                            {user?.name ?? "—"}
                          </p>
                          {user?.email && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {user.email}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          {/* ── right: sidebar ── */}
          <aside className="space-y-0 rounded-lg border bg-muted/20 px-4 py-1">
            {deadlineDate && (
              <MetaRow
                icon={Clock}
                label="Deadline"
                value={fmtDate(deadlineDate)}
              />
            )}
            {createdDate && (
              <MetaRow
                icon={Calendar}
                label="Created"
                value={fmtDate(createdDate)}
              />
            )}
            {bounty.createdByUser && (
              <MetaRow
                icon={User}
                label="Posted by"
                value={
                  <span className="flex items-center gap-1.5">
                    <Avatar className="w-4 h-4">
                      {bounty.createdByUser.avatar && (
                        <AvatarImage
                          src={bounty.createdByUser.avatar}
                          alt={bounty.createdByUser.name ?? ""}
                        />
                      )}
                      <AvatarFallback className="text-[9px]">
                        {bounty.createdByUser.name?.[0]?.toUpperCase() ?? "?"}
                      </AvatarFallback>
                    </Avatar>
                    {bounty.createdByUser.name}
                  </span>
                }
              />
            )}
            {bounty.chain && (
              <MetaRow
                icon={Tag}
                label="Network"
                value={bounty.chain === "MAIN" ? "Mainnet" : "Testnet"}
              />
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
