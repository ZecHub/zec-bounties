"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Download,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  FileSpreadsheet,
  ExternalLink,
  X,
  Coins,
  Clock,
  Calendar,
  Tag,
  User,
  ArrowLeft,
} from "lucide-react";
import { useBounty } from "@/lib/bounty-context";
import { AdminNavbar } from "@/components/layout/admin/navbar";
import { ProtectedRoute } from "@/components/auth/protected-route";
import type { Bounty } from "@/lib/types";

const BOUNTY_BASE_URL =
  typeof window !== "undefined"
    ? window.location.origin + "/bounties"
    : "/bounties";

const STATUS_STYLES: Record<string, string> = {
  TO_DO: "bg-slate-100 text-slate-700 border-slate-300",
  IN_PROGRESS: "bg-blue-100 text-blue-700 border-blue-300",
  IN_REVIEW: "bg-yellow-100 text-yellow-700 border-yellow-300",
  DONE: "bg-green-100 text-green-700 border-green-300",
  CANCELLED: "bg-red-100 text-red-700 border-red-300",
};

const STATUS_LABELS: Record<string, string> = {
  TO_DO: "To Do",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

interface ExportRow {
  id: string;
  title: string;
  bountyAmount: number;
  paidAt: string;
  paymentTxId?: string | null;
  assigneeUser?: {
    id: string;
    name?: string;
    email?: string;
    z_address?: string;
    ofacVerified: boolean;
  };
  assignees?: Array<{
    user: {
      id: string;
      name?: string;
      email?: string;
      z_address?: string;
      ofacVerified: boolean;
    };
  }>;
}

// ─── Bounty detail panel (shown inside the modal) ─────────────────────────────
function BountyDetailPanel({ bounty }: { bounty: Bounty }) {
  const primaryAssignee =
    bounty.assigneeUser ?? bounty.assignees?.[0]?.user ?? null;
  const deadlineDate = bounty.timeToComplete
    ? new Date(bounty.timeToComplete)
    : null;
  const createdDate = bounty.dateCreated ? new Date(bounty.dateCreated) : null;

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-background">
        <div className="space-y-8">
          {/* Title + status */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-xl font-semibold leading-snug max-w-lg">
                {bounty.title}
              </h2>
              <Badge
                variant="outline"
                className={`text-xs px-2.5 py-1 font-medium shrink-0 ${STATUS_STYLES[bounty.status] ?? ""}`}
              >
                {STATUS_LABELS[bounty.status] ?? bounty.status}
              </Badge>
            </div>

            {/* Meta */}
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-amber-500" />
                <span className="font-semibold text-foreground">
                  {bounty.bountyAmount} ZEC
                </span>
              </span>
              {deadlineDate && (
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  Deadline:{" "}
                  {deadlineDate.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              )}
              {createdDate && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  Created:{" "}
                  {createdDate.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              )}
              {bounty.category?.name && (
                <span className="flex items-center gap-1.5">
                  <Tag className="w-4 h-4" />
                  {bounty.category.name}
                </span>
              )}
            </div>
          </div>

          <Separator />

          {/* Description */}
          {bounty.description && (
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Description
              </p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {bounty.description}
              </p>
            </section>
          )}

          {/* Assignees */}
          {bounty.assignees && bounty.assignees.length > 0 && (
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {bounty.assignees.length === 1 ? "Assignee" : "Assignees"}
              </p>
              <div className="flex flex-wrap gap-3">
                {bounty.assignees.map((a) => {
                  const user = a.user;
                  return (
                    <div
                      key={a.userId ?? user?.id}
                      className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-muted/40"
                    >
                      <Avatar className="w-6 h-6">
                        {user?.avatar && (
                          <AvatarImage
                            src={user.avatar}
                            alt={user.name ?? ""}
                          />
                        )}
                        <AvatarFallback className="text-xs">
                          {user?.name?.[0]?.toUpperCase() ?? (
                            <User className="w-3 h-3" />
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div className="text-sm">
                        <p className="font-medium leading-none">
                          {user?.name ?? "—"}
                        </p>
                        {user?.email && (
                          <p className="text-xs text-muted-foreground mt-0.5">
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

          {/* Creator */}
          {bounty.createdByUser && (
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Posted by
              </p>
              <div className="flex items-center gap-2">
                <Avatar className="w-6 h-6">
                  {bounty.createdByUser.avatar && (
                    <AvatarImage
                      src={bounty.createdByUser.avatar}
                      alt={bounty.createdByUser.name ?? ""}
                    />
                  )}
                  <AvatarFallback className="text-xs">
                    {bounty.createdByUser.name?.[0]?.toUpperCase() ?? (
                      <User className="w-3 h-3" />
                    )}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">
                  {bounty.createdByUser.name}
                </span>
              </div>
            </section>
          )}

          {/* Payment */}
          {bounty.isPaid && bounty.paidAt && (
            <>
              <Separator />
              <section className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Payment
                </p>
                <div className="flex flex-wrap gap-6 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">
                      Paid at
                    </p>
                    <p className="font-medium">
                      {new Date(bounty.paidAt).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  {primaryAssignee?.z_address && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">
                        Shielded address
                      </p>
                      <p className="font-mono text-xs break-all">
                        {primaryAssignee.z_address}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}

// ─── Main export page ──────────────────────────────────────────────────────────
export default function ExportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { fetchExportPayments, updateUserOfac, fetchBountyById } = useBounty();

  // ── Table state ──────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<ExportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [baseUrl, setBaseUrl] = useState(BOUNTY_BASE_URL);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // ── Modal state — driven entirely by ?bounty= in the URL ────────────────────
  const activeBountyId = searchParams.get("bounty");
  const [modalBounty, setModalBounty] = useState<Bounty | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  // When the URL gains a ?bounty= param, fetch and show the modal
  useEffect(() => {
    if (!activeBountyId) {
      setModalBounty(null);
      return;
    }
    setModalLoading(true);
    setModalBounty(null);
    fetchBountyById(activeBountyId)
      .then((data) => setModalBounty(data))
      .catch(() => setModalBounty(null))
      .finally(() => setModalLoading(false));
  }, [activeBountyId]);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (activeBountyId) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [activeBountyId]);

  // Close modal: remove ?bounty= from URL (browser back button also does this)
  const closeModal = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("bounty");
    const next = params.size ? `?${params}` : window.location.pathname;
    router.replace(next, { scroll: false });
  }, [router, searchParams]);

  // Close on Escape
  useEffect(() => {
    if (!activeBountyId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeBountyId, closeModal]);

  // Open modal: push ?bounty=<id> into URL
  const openModal = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("bounty", id);
      router.push(`?${params}`, { scroll: false });
    },
    [router, searchParams],
  );

  // ── Table helpers ────────────────────────────────────────────────────────────
  const getPrimaryRecipient = (row: ExportRow) =>
    row.assigneeUser ?? row.assignees?.[0]?.user;

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchExportPayments(
        fromDate || undefined,
        toDate || undefined,
      );
      setRows(data);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  const handleOfacToggle = async (row: ExportRow, value: boolean) => {
    const recipient = getPrimaryRecipient(row);
    if (!recipient?.id) return;
    setTogglingId(recipient.id);
    try {
      await updateUserOfac(recipient.id, value);
      setRows((prev) =>
        prev.map((r) => {
          const isMatch =
            r.assigneeUser?.id === recipient.id ||
            r.assignees?.[0]?.user?.id === recipient.id;
          if (!isMatch) return r;
          if (r.assigneeUser)
            return {
              ...r,
              assigneeUser: { ...r.assigneeUser, ofacVerified: value },
            };
          return {
            ...r,
            assignees: r.assignees?.map((a) =>
              a.user.id === recipient.id
                ? { ...a, user: { ...a.user, ofacVerified: value } }
                : a,
            ),
          };
        }),
      );
    } finally {
      setTogglingId(null);
    }
  };

  const escapeCsv = (val: string) => {
    if (!val) return "";
    if (val.includes(",") || val.includes('"') || val.includes("\n"))
      return `"${val.replace(/"/g, '""')}"`;
    return val;
  };

  const handleExport = () => {
    const headers = [
      "Approval Date",
      "OFAC Check Status",
      "Recipient",
      "Recipient Contact Info",
      "Reason for Payment",
      "Bounty URL",
      "ZEC Amount",
      "Shielded Address",
      "Transaction ID",
    ];
    const csvRows = rows.map((row) => {
      const recipient = getPrimaryRecipient(row);
      return [
        row.paidAt ? new Date(row.paidAt).toLocaleDateString("en-US") : "",
        recipient?.ofacVerified ? "Completed" : "Pending",
        recipient?.name ?? "",
        recipient?.email ?? "",
        row.title,
        `${baseUrl}/${row.id}`,
        row.bountyAmount.toString(),
        recipient?.z_address ?? "",
        row.paymentTxId ?? "",
      ]
        .map(escapeCsv)
        .join(",");
    });
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments-export-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const ofacCount = rows.filter(
    (r) => getPrimaryRecipient(r)?.ofacVerified,
  ).length;

  const isModalOpen = !!activeBountyId;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-background text-foreground">
      <AdminNavbar isAdmin={true} />

      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="grid grid-cols-1 imd:flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <FileSpreadsheet className="w-6 h-6" />
              Payment Export
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Export paid bounties as CSV. Toggle OFAC status per recipient
              before exporting.
            </p>
          </div>
          {loaded && (
            <Button onClick={handleExport} className="gap-2">
              <Download className="w-4 h-4" />
              Export CSV ({rows.length})
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-4 p-4 border rounded-lg bg-muted/30">
          <div className="space-y-1">
            <Label htmlFor="from-date" className="text-xs">
              From date
            </Label>
            <Input
              id="from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to-date" className="text-xs">
              To date
            </Label>
            <Input
              id="to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1 flex-1 min-w-[220px]">
            <Label htmlFor="base-url" className="text-xs">
              Bounty base URL
            </Label>
            <Input
              id="base-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://yourapp.com/bounties"
            />
          </div>
          <Button
            onClick={load}
            disabled={loading}
            variant="secondary"
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {loaded ? "Refresh" : "Load Records"}
          </Button>
        </div>

        {/* Stats bar */}
        {loaded && (
          <div className="grid grid-cols-2 imd:flex items-center gap-6 text-sm text-muted-foreground">
            <span>{rows.length} paid bounties</span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-green-500" />
              {ofacCount} OFAC verified
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldX className="w-4 h-4 text-amber-500" />
              {rows.length - ofacCount} pending
            </span>
          </div>
        )}

        {/* Table */}
        {loaded && (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Approval Date</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Reason for Payment</TableHead>
                  <TableHead>ZEC Amount</TableHead>
                  <TableHead>Shielded Address</TableHead>
                  <TableHead>OFAC Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-muted-foreground py-10"
                    >
                      No paid bounties found for the selected range.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((row) => {
                  const recipient = getPrimaryRecipient(row);
                  const isToggling = togglingId === recipient?.id;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {row.paidAt
                          ? new Date(row.paidAt).toLocaleDateString("en-US")
                          : "—"}
                      </TableCell>
                      <TableCell className="font-medium text-sm">
                        {recipient?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {recipient?.email ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm max-w-[220px]">
                        <div className="flex items-center gap-1.5">
                          {/*
                            Clicking the title updates the URL to ?bounty=<id>
                            and opens the modal — same page, no navigation.
                          */}
                          <button
                            onClick={() => openModal(row.id)}
                            className="hover:underline text-blue-600 text-left truncate"
                          >
                            {row.title}
                          </button>
                          {/* External icon opens the standalone bounty page in a new tab */}
                          <a
                            href={`${baseUrl}/${row.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-blue-600 shrink-0"
                            title="Open standalone page in new tab"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {row.bountyAmount} ZEC
                      </TableCell>
                      <TableCell className="text-sm font-mono text-muted-foreground">
                        {recipient?.z_address
                          ? `${recipient.z_address.slice(0, 14)}…`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={recipient?.ofacVerified ?? false}
                            onCheckedChange={(v) => handleOfacToggle(row, v)}
                            disabled={isToggling || !recipient?.id}
                          />
                          <Badge
                            variant={
                              recipient?.ofacVerified ? "default" : "outline"
                            }
                            className="text-xs"
                          >
                            {isToggling ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : recipient?.ofacVerified ? (
                              "Completed"
                            ) : (
                              "Pending"
                            )}
                          </Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* ── Dework-style modal overlay ─────────────────────────────────────────
          Rendered in the same page. URL is ?bounty=<id> while open.
          Closing removes the param (browser back also closes it).
      ──────────────────────────────────────────────────────────────────────── */}
      {isModalOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={closeModal}
            aria-hidden="true"
          />

          {/* Slide-in panel (right side, like Dework/Linear) */}
          <div
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-background shadow-2xl"
            role="dialog"
            aria-modal="true"
          >
            {/* Panel header */}
            <div className="flex items-center justify-between border-b px-6 py-4 shrink-0">
              <div className="flex items-center gap-3">
                <button
                  onClick={closeModal}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
                {modalBounty && (
                  <a
                    href={`${baseUrl}/${modalBounty.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    title="Open standalone page"
                  >
                    Open full page
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              {/* Keyboard hint */}
              <span className="text-xs text-muted-foreground hidden sm:block">
                Press{" "}
                <kbd className="font-mono bg-muted px-1 py-0.5 rounded text-xs">
                  Esc
                </kbd>{" "}
                to close
              </span>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {modalLoading && (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {!modalLoading && !modalBounty && (
                <p className="text-sm text-muted-foreground text-center mt-20">
                  Could not load bounty details.
                </p>
              )}
              {!modalLoading && modalBounty && (
                <BountyDetailPanel bounty={modalBounty} />
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
