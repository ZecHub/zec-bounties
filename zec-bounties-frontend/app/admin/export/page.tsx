"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Download,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  FileSpreadsheet,
  ExternalLink,
} from "lucide-react";
import { useBounty } from "@/lib/bounty-context";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { AdminNavbar } from "@/components/layout/admin/navbar";
import { WalletGuard } from "@/components/settings/wallet-guard";

const BOUNTY_BASE_URL =
  typeof window !== "undefined"
    ? window.location.origin + "/bounties"
    : "/bounties";

interface ExportRow {
  id: string;
  title: string;
  bountyAmount: number;
  paidAt: string;
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

interface BountyDetail {
  id: string;
  title: string;
  description?: string;
  bountyAmount: number;
  status: string;
  paidAt?: string;
  createdAt?: string;
}

export default function ExportPage() {
  const { fetchExportPayments, updateUserOfac, fetchBountyById } = useBounty();

  const [rows, setRows] = useState<ExportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [baseUrl, setBaseUrl] = useState(BOUNTY_BASE_URL);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Bounty detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailBounty, setDetailBounty] = useState<BountyDetail | null>(null);

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

  const handleViewBounty = async (id: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailBounty(null);
    try {
      const bounty = await fetchBountyById(id);
      if (!bounty) return;
      setDetailBounty({
        id: bounty.id,
        title: bounty.title,
        description: bounty.description,
        bountyAmount: bounty.bountyAmount,
        status: bounty.status,
        paidAt: bounty.paidAt
          ? new Date(bounty.paidAt).toISOString()
          : undefined,
        createdAt: bounty.dateCreated
          ? new Date(bounty.dateCreated).toISOString()
          : undefined,
      });
    } finally {
      setDetailLoading(false);
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
          if (r.assigneeUser) {
            return {
              ...r,
              assigneeUser: { ...r.assigneeUser, ofacVerified: value },
            };
          }
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
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
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
    ];

    const csvRows = rows.map((row) => {
      const recipient = getPrimaryRecipient(row);
      const approvalDate = row.paidAt
        ? new Date(row.paidAt).toLocaleDateString("en-US")
        : "";
      return [
        approvalDate,
        recipient?.ofacVerified ? "Completed" : "Pending",
        recipient?.name ?? "",
        recipient?.email ?? "",
        row.title,
        `${baseUrl}/${row.id}`,
        row.bountyAmount.toString(),
        recipient?.z_address ?? "",
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
                        {/* Title button opens detail modal; external link icon navigates to full page */}
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleViewBounty(row.id)}
                            className="hover:underline text-blue-600 text-left truncate"
                          >
                            {row.title}
                          </button>
                          <a
                            href={`${baseUrl}/${row.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-blue-600 shrink-0"
                            title="Open in new tab"
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

        {/* Bounty Detail Modal */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {detailLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </span>
                ) : (
                  (detailBounty?.title ?? "Bounty Details")
                )}
              </DialogTitle>
              {detailBounty && (
                <DialogDescription>ID: {detailBounty.id}</DialogDescription>
              )}
            </DialogHeader>

            {detailLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {!detailLoading && detailBounty && (
              <div className="space-y-4 text-sm">
                {detailBounty.description && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Description
                    </p>
                    <p className="text-sm leading-relaxed">
                      {detailBounty.description}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Amount
                    </p>
                    <p className="font-mono font-semibold">
                      {detailBounty.bountyAmount} ZEC
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Status
                    </p>
                    <Badge variant="outline">{detailBounty.status}</Badge>
                  </div>
                  {detailBounty.paidAt && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Paid At
                      </p>
                      <p>
                        {new Date(detailBounty.paidAt).toLocaleDateString(
                          "en-US",
                        )}
                      </p>
                    </div>
                  )}
                  {detailBounty.createdAt && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Created
                      </p>
                      <p>
                        {new Date(detailBounty.createdAt).toLocaleDateString(
                          "en-US",
                        )}
                      </p>
                    </div>
                  )}
                </div>
                <div className="pt-2 flex justify-end">
                  <a
                    href={`${baseUrl}/${detailBounty.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-blue-600 hover:underline text-sm"
                  >
                    Open full page
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            )}

            {!detailLoading && !detailBounty && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Could not load bounty details.
              </p>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
