"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  ExternalLink,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useBounty } from "@/lib/bounty-context";

interface ExportRow {
  id: string;
  title: string;
  bountyAmount: number;
  dateCreated: string;
  completedAt?: string | null;
  paymentTxId?: string | null;
  chain: "MAIN" | "TEST";
  assigneeUser?: {
    id: string;
    name?: string;
    email?: string;
    z_address?: string;
    UA_address?: string;
    ofacVerified: boolean;
  };
  assignees?: Array<{
    user: {
      id: string;
      name?: string;
      email?: string;
      z_address?: string;
      UA_address?: string;
      ofacVerified: boolean;
    };
  }>;
}

interface ExportCompletedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SortKey =
  | "date"
  | "completedAt"
  | "recipient"
  | "contact"
  | "title"
  | "amount"
  | "network"
  | "address"
  | "ofac";

type SortDirection = "asc" | "desc";

export function ExportCompletedModal({
  open,
  onOpenChange,
}: ExportCompletedModalProps) {
  const { fetchExportCompleted, updateUserOfac } = useBounty();

  const [rows, setRows] = useState<ExportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const toggleOne = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin + "/bounties"
      : "/bounties";

  const getPrimaryRecipient = (row: ExportRow) =>
    row.assigneeUser ?? row.assignees?.[0]?.user;

  const getPayoutAddress = (row: ExportRow) => {
    const r = getPrimaryRecipient(row);
    return row.chain === "MAIN" ? r?.UA_address : r?.z_address;
  };

  // Pulls a comparable primitive (string | number) out of a row for a given column
  const getSortValue = (row: ExportRow, key: SortKey): string | number => {
    const recipient = getPrimaryRecipient(row);
    switch (key) {
      case "date":
        return row.dateCreated ? new Date(row.dateCreated).getTime() : 0;
      case "completedAt":
        return row.completedAt ? new Date(row.completedAt).getTime() : 0;
      case "recipient":
        return (recipient?.name ?? "").toLowerCase();
      case "contact":
        return (recipient?.email ?? "").toLowerCase();
      case "title":
        return row.title?.toLowerCase() ?? "";
      case "amount":
        return row.bountyAmount ?? 0;
      case "network":
        return row.chain ?? "";
      case "address":
        return (getPayoutAddress(row) ?? "").toLowerCase();
      case "ofac":
        return recipient?.ofacVerified ? 1 : 0;
      default:
        return "";
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const sorted = [...rows].sort((a, b) => {
      const aVal = getSortValue(a, sortKey);
      const bVal = getSortValue(b, sortKey);
      if (aVal < bVal) return -1;
      if (aVal > bVal) return 1;
      return 0;
    });
    return sortDirection === "asc" ? sorted : sorted.reverse();
  }, [rows, sortKey, sortDirection]);

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column)
      return <ChevronsUpDown className="w-3 h-3 opacity-40" />;
    return sortDirection === "asc" ? (
      <ChevronUp className="w-3 h-3" />
    ) : (
      <ChevronDown className="w-3 h-3" />
    );
  };

  const SortableHead = ({
    column,
    children,
    className,
  }: {
    column: SortKey;
    children: React.ReactNode;
    className?: string;
  }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => handleSort(column)}
        className="flex items-center gap-1 text-xs font-medium hover:text-foreground text-muted-foreground select-none"
      >
        {children}
        <SortIcon column={column} />
      </button>
    </TableHead>
  );

  const load = async () => {
    setLoading(true);
    setSelectedIds(new Set());
    try {
      const data = await fetchExportCompleted();
      setRows(data.filter((r: ExportRow) => r.chain === "MAIN"));
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setRows([]);
      setLoaded(false);
      setSortKey(null);
      load();
    }
  }, [open]);

  // Auto-load when modal opens
  const handleOpenChange = (val: boolean) => {
    if (!val) {
      setRows([]);
      setLoaded(false);
      setSelectedIds(new Set());
      setSortKey(null);
    }
    onOpenChange(val);
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
    const exportRows =
      selectedIds.size > 0
        ? sortedRows.filter((r) => selectedIds.has(r.id))
        : sortedRows;

    const headers = [
      "Date Created",
      "Date Completed",
      "OFAC Status",
      "Recipient",
      "Contact",
      "Reason for Payment",
      "Bounty URL",
      "ZEC Amount",
      "Network",
      "Payout Address",
      "Transaction ID",
    ];
    const csvRows = exportRows.map((row) => {
      const recipient = getPrimaryRecipient(row);
      return [
        row.dateCreated
          ? new Date(row.dateCreated).toLocaleDateString("en-US")
          : "",
        row.completedAt
          ? new Date(row.completedAt).toLocaleDateString("en-US")
          : "",
        recipient?.ofacVerified ? "Completed" : "Pending",
        recipient?.name ?? "",
        recipient?.email ?? "",
        row.title,
        `${baseUrl}/${row.id}`,
        row.bountyAmount.toString(),
        row.chain === "MAIN" ? "Mainnet" : "Testnet",
        getPayoutAddress(row) ?? "",
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
    a.download = `completed-bounties-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const ofacCount = rows.filter(
    (r) => getPrimaryRecipient(r)?.ofacVerified,
  ).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="imd:max-w-5xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold">
              Export Completed Bounties
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={load}
                disabled={loading}
                className="gap-1.5 h-8 text-xs"
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                Refresh
              </Button>
              {loaded && rows.length > 0 && (
                <Button
                  size="sm"
                  onClick={handleExport}
                  className="gap-1.5 h-8 text-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV ({rows.length})
                </Button>
              )}
            </div>
          </div>

          {/* Stats */}
          {loaded && (
            <div className="flex items-center gap-5 mt-2 text-xs text-muted-foreground">
              <span>{rows.length} completed bounties</span>
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
                {ofacCount} OFAC verified
              </span>
              <span className="flex items-center gap-1">
                <ShieldX className="w-3.5 h-3.5 text-amber-500" />
                {rows.length - ofacCount} pending
              </span>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {loading && !loaded && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {loaded && rows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Download className="w-10 h-10 opacity-30 mb-3" />
              <p className="text-sm">No completed bounties found.</p>
            </div>
          )}

          {loaded && rows.length > 0 && (
            <Table>
              <TableHeader className="bg-muted/50 sticky top-0">
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        rows.length > 0 && selectedIds.size === rows.length
                      }
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <SortableHead column="date">Created</SortableHead>
                  <SortableHead column="completedAt">Completed</SortableHead>
                  <SortableHead column="recipient">Recipient</SortableHead>
                  <SortableHead column="contact">Contact</SortableHead>
                  <SortableHead column="title">Bounty</SortableHead>
                  <SortableHead column="amount">Amount</SortableHead>
                  <SortableHead column="network">Network</SortableHead>
                  <SortableHead column="address">Payout Address</SortableHead>
                  <SortableHead column="ofac">OFAC</SortableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map((row) => {
                  const recipient = getPrimaryRecipient(row);
                  const payoutAddress = getPayoutAddress(row);
                  const isToggling = togglingId === recipient?.id;
                  return (
                    <TableRow
                      key={row.id}
                      className={selectedIds.has(row.id) ? "bg-primary/5" : ""}
                      onClick={() => toggleOne(row.id)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(row.id)}
                          onCheckedChange={() => toggleOne(row.id)}
                        />
                      </TableCell>

                      <TableCell className="text-xs whitespace-nowrap">
                        {row.dateCreated
                          ? new Date(row.dateCreated).toLocaleDateString(
                              "en-US",
                            )
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {row.completedAt
                          ? new Date(row.completedAt).toLocaleDateString(
                              "en-US",
                            )
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {recipient?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {recipient?.email ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm max-w-[180px]">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{row.title}</span>

                          <a
                            href={`${baseUrl}/${row.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-blue-600 shrink-0"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono whitespace-nowrap">
                        {row.bountyAmount} ZEC
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="text-[10px] border-emerald-300 text-emerald-700 dark:text-emerald-400"
                        >
                          Mainnet
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground max-w-[120px]">
                        {payoutAddress ? (
                          `${payoutAddress.slice(0, 10)}…${payoutAddress.slice(-6)}`
                        ) : (
                          <span className="text-yellow-600">Not set</span>
                        )}
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
                            className="text-[10px]"
                          >
                            {isToggling ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : recipient?.ofacVerified ? (
                              "Verified"
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
