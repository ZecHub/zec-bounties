"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmt } from "@/lib/utils";

export type StaffRelation = "created" | "assigned" | "applied";

export type StaffBountyRow = {
  id: string;
  title: string;
  status: string;
  chain: "MAIN" | "TEST";
  bountyAmount: number;
  isPrivate: boolean;
  isPaid: boolean;
  isApproved: boolean;
  exportedAt?: string | null;
  dateCreated: string;
  completedAt: string | null;
  paidAt: string | null;
  teamName: string | null;
  relations: StaffRelation[];
  applicationStatus: string | null;
};

export type StaffBountyView = {
  userId: string;
  displayName: string;
  chain: "MAIN" | "TEST";
  limit: number;
  bountyCount: number;
  zecEarned: number;
  joinedAt?: string | null;
  zecCompleted?: number;
  statusCounts: Record<string, number>;
  open: StaffBountyRow[];
  openTotal: number;
  openNextOffset: number | null;
  history: StaffBountyRow[];
  historyTotal: number;
  historyNextOffset: number | null;
};

const STATUS_META: Record<string, { label: string; dot: string; text: string }> = {
  TO_DO: { label: "Todo", dot: "bg-slate-400", text: "text-slate-300" },
  IN_PROGRESS: { label: "In Progress", dot: "bg-blue-500", text: "text-blue-400" },
  IN_REVIEW: { label: "In Review", dot: "bg-yellow-500", text: "text-yellow-400" },
  DONE: { label: "Done", dot: "bg-green-500", text: "text-green-400" },
  CANCELLED: { label: "Cancelled", dot: "bg-red-500", text: "text-red-400" },
};

const STATUS_ORDER = ["TO_DO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"];

const RELATION_LABEL: Record<StaffRelation, string> = {
  created: "Created",
  assigned: "Assigned",
  applied: "Applied",
};

function amount(row: StaffBountyRow) {
  return Number(row.bountyAmount) || 0;
}

function isAssigned(row: StaffBountyRow) {
  return row.relations.includes("assigned");
}

function isEarned(row: StaffBountyRow) {
  return row.status === "DONE" && isAssigned(row) && (!!row.isPaid || !!row.exportedAt);
}

function isCompleted(row: StaffBountyRow) {
  return row.status === "DONE" && isAssigned(row);
}

function Row({ row }: { row: StaffBountyRow }) {
  const meta = STATUS_META[row.status];
  const earned = isEarned(row);
  const completed = isCompleted(row);
  return (
    <li className="flex flex-col gap-1 border-b border-border/60 py-2 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/bounty/${row.id}`}
          className="text-sm font-medium hover:underline truncate"
        >
          {row.title}
        </Link>
        <span className="text-right shrink-0">
          <span className="block text-xs tabular-nums text-muted-foreground">
            {fmt(amount(row))} ZEC
          </span>
          {earned ? (
            <span className="block text-[10px] text-green-400">Earned</span>
          ) : completed ? (
            <span className="block text-[10px] text-yellow-400">Completed</span>
          ) : null}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex items-center gap-1.5 text-[10px] ${meta?.text || "text-muted-foreground"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${meta?.dot || "bg-slate-400"}`} />
          {meta?.label || row.status}
        </span>
        {row.relations.map((relation) => (
          <Badge key={relation} variant="outline" className="text-[10px] px-1.5 py-0">
            {RELATION_LABEL[relation]}
          </Badge>
        ))}
        {row.applicationStatus && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            App {row.applicationStatus}
          </Badge>
        )}
        {row.isPrivate && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            Private
          </Badge>
        )}
        {row.isPaid && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            Paid
          </Badge>
        )}
        {row.exportedAt && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            Exported
          </Badge>
        )}
        {row.teamName && (
          <span className="text-[10px] text-muted-foreground">{row.teamName}</span>
        )}
      </div>
    </li>
  );
}

function List({
  title,
  total,
  rows,
  onLoadMore,
}: {
  title: string;
  total: number;
  rows: StaffBountyRow[];
  onLoadMore?: () => void;
}) {
  if (rows.length === 0 && !onLoadMore) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1">
        {title} ({rows.length}{total > rows.length ? ` of ${total}` : ""})
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">None</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <Row key={row.id} row={row} />
          ))}
        </ul>
      )}
      {onLoadMore && (
        <button
          type="button"
          onClick={onLoadMore}
          className="mt-2 text-xs text-primary hover:underline"
        >
          Load more
        </button>
      )}
    </div>
  );
}

export function StaffViewCard({
  chain,
  loading,
  error,
  data,
  onLoadMoreOpen,
  onLoadMoreHistory,
}: {
  chain: "MAIN" | "TEST";
  loading: boolean;
  error: string | null;
  data: StaffBountyView | null;
  onLoadMoreOpen?: () => void;
  onLoadMoreHistory?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string>("ALL");
  const loaded = [...(data?.open || []), ...(data?.history || [])];
  const bountyCount = data?.bountyCount ?? (data ? data.openTotal + data.historyTotal : 0);
  const counted = loaded.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  const counts = { ...counted, ...(data?.statusCounts || {}) };
  const apiCounts = data?.statusCounts || {};
  if (STATUS_ORDER.every((key) => !apiCounts[key])) {
    Object.assign(counts, counted);
  }
  const zecEarned = loaded.reduce(
    (sum, row) => sum + (isEarned(row) ? amount(row) : 0),
    0,
  );
  const zecCompleted = loaded.reduce(
    (sum, row) => sum + (isCompleted(row) ? amount(row) : 0),
    0,
  );
  const visible = (rows: StaffBountyRow[]) =>
    status === "ALL" ? rows : rows.filter((row) => row.status === status);

  return (
    <Card className="border-amber-500/40">
      <CardHeader className="pb-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-expanded={open}
        >
          <CardTitle className="text-base flex items-center gap-2">
            Staff view
            <Badge variant="outline" className="text-[10px] font-normal">
              Admin
            </Badge>
            {data?.joinedAt && (
              <span className="text-[10px] font-normal text-muted-foreground">
                Joined {new Date(data.joinedAt).toLocaleString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            )}
          </CardTitle>
          <span className="flex items-center gap-3 text-xs text-muted-foreground">
            {data && (
              <span className="tabular-nums">
                {bountyCount} · {fmt(zecEarned)} earned
              </span>
            )}
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </span>
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Open bounties and history for this user on{" "}
            {chain === "MAIN" ? "mainnet" : "testnet"}. Ignores their privacy
            flags. Not shown to non-admins.
          </p>
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading staff view
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {data && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border border-border/70 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Bounties</p>
                  <p className="text-lg font-semibold tabular-nums">{bountyCount}</p>
                </div>
                <div className="rounded-md border border-border/70 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">ZEC earned</p>
                  <p className="text-lg font-semibold tabular-nums">{fmt(zecEarned)}</p>
                  <p className="text-[10px] text-muted-foreground">Done, assigned, and paid or exported</p>
                </div>
                <div className="rounded-md border border-border/70 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">ZEC completed</p>
                  <p className="text-lg font-semibold tabular-nums">{fmt(zecCompleted)}</p>
                  <p className="text-[10px] text-muted-foreground">Done and assigned, paid or not</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStatus("ALL")}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    status === "ALL"
                      ? "border-amber-500 text-amber-200"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  All {bountyCount}
                </button>
                {STATUS_ORDER.map((key) => {
                  const meta = STATUS_META[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStatus(key)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
                        status === key ? "border-amber-500 text-foreground" : "border-border text-muted-foreground"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                      {meta.label} {counts[key] || 0}
                    </button>
                  );
                })}
              </div>
              <List
                title="Open"
                total={data.openTotal}
                rows={visible(data.open)}
                onLoadMore={data.openNextOffset == null ? undefined : onLoadMoreOpen}
              />
              <List
                title="History"
                total={data.historyTotal}
                rows={visible(data.history)}
                onLoadMore={data.historyNextOffset == null ? undefined : onLoadMoreHistory}
              />
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
