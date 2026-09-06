"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useBounty } from "@/lib/bounty-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowUpDown,
  Zap,
  Users,
  Pencil,
} from "lucide-react";
import { BadgeIcons, BadgeSvg, SpecialtyFilterChips, StarFilterChips, AssignableBadgeList } from "@/components/badges/badge-icons";
import { UaReceiverIcons, UaFilterChips, matchesReceiverFilter, type UaReceiverKey } from "@/components/address/ua-receiver-icons";
import { getBadgeTooltip, matchesBadgeFilter } from "@/lib/badges";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
  Legend,
  LineChart,
  Line,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SlidersHorizontal, Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import { getAddressReceivers, initAddressDecoder } from "@/lib/decodeAddress";
import { ProtectedRoute } from "@/components/auth/protected-route";
import {
  TopContributor,
  ContributorsOverTime,
  BountyTypesOverTime,
} from "@/lib/types";
import { confirmedTotal, fmt } from "@/lib/utils";
import { backendUrl } from "@/lib/configENV";
import { AdminNavbar } from "@/components/layout/admin/navbar";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { profileHref } from "@/lib/profileHref";
import { toast } from "sonner";

type SortKey = "completed" | "submitted" | "completionRate" | "totalEarned";
type ChainFilter = "all" | "MAIN" | "TEST";
type ChartType =
  | "contributors"
  | "earned"
  | "topEarners"
  | "bountyTypes"
  | "addressTypes"
  | "avgEarnings";

const CHART_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--primary)",
];

function UserAvatar({
  user,
  getDefaultAvatarClasses,
}: {
  user: any;
  getDefaultAvatarClasses: (completed: number, badges?: string[]) => string;
}) {
  const tooltip = getBadgeTooltip(user.badges);

  if (user.avatar) {
    return (
      <img
        src={user.avatar}
        className="w-8 h-8 rounded-full border border-border cursor-help"
        title={tooltip}
      />
    );
  }

  return (
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs cursor-help ${getDefaultAvatarClasses(
        user.completed,
        user.badges,
      )}`}
      title={tooltip}
    >
      {user.name?.[0]}
    </div>
  );
}

// Reusable KPI Card with colored top border
function KpiCard({
  children,
  timeRange,
  className,
}: {
  children: React.ReactNode;
  timeRange: "30d" | "90d" | "all";
  className?: string;
}) {
  const borderColors = {
    "30d": "border-t-blue-500",
    "90d": "border-t-teal-500",
    all: "border-t-muted-foreground",
  };
  return (
    <Card
      className={cn(
        "bg-card",
        borderColors[timeRange],
        "border-t-4",
        className,
      )}
    >
      {children}
    </Card>
  );
}

export default function KpisDashboard() {
  const {
    currentUser,
    balance,
    syncStatus,
    fetchBalance,
    rescanWallet,
    zcashParams,
    teams,
    setDefaultWallet,
  } = useBounty();


  const isAdmin = currentUser?.role === "ADMIN";

  const [viewMode, setViewMode] = useState<"public" | "admin">(
    isAdmin ? "admin" : "public",
  );
  const [sortKey, setSortKey] = useState<SortKey>("completed");
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");
  const [showAllUsers, setShowAllUsers] = useState(false);
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false);
  const [isRescanning, setIsRescanning] = useState(false);
  const [rescanMessage, setRescanMessage] = useState("");
  const [rescanError, setRescanError] = useState("");
  const [topContributors, setTopContributors] = useState<TopContributor[]>([]);
  const [loadingContributors, setLoadingContributors] = useState(true);
  const [selectedChart, setSelectedChart] = useState<ChartType>("contributors");
  const [contributorsOverTimeData, setContributorsOverTimeData] = useState<
    ContributorsOverTime[]
  >([]);
  const [bountyTypesOverTime, setBountyTypesOverTime] = useState<
    BountyTypesOverTime[]
  >([]);
  const [averageEarningsOverTime, setAverageEarningsOverTime] = useState<any[]>(
    [],
  );

  const [isBadgeModalOpen, setIsBadgeModalOpen] = useState(false);
  const [selectedUserForBadges, setSelectedUserForBadges] = useState<any>(null);
  const [selectedBadges, setSelectedBadges] = useState<string[]>([]);
  const [isSavingBadges, setIsSavingBadges] = useState(false);
  const [chainFilter, setChainFilter] = useState<ChainFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLDivElement>(null);
  const [userFilter, setUserFilter] = useState("");
  // Dynamic default avatar color based on completed bounties
  const getDefaultAvatarClasses = (
  completed: number,
  badges: string[] = [],
) => {
  return "bg-muted text-muted-foreground";
};

  // === Time Range Filter ===
  const [timeRange, setTimeRange] = useState<"30d" | "90d" | "all">("all");


  const [badgeFilter, setBadgeFilter] = useState<string[]>([]);
  const [receiverFilter, setReceiverFilter] = useState<UaReceiverKey[]>([]);
  const [receiverMode, setReceiverMode] = useState<"all" | "any" | "exact">("all");


  const timeRangeConfig = {
    "30d": {
      label: "Last 30 Days",
      color: "text-blue-500 dark:text-blue-400",
      border: "border-blue-500",
    },
    "90d": {
      label: "Last 90 Days",
      color: "text-teal-500 dark:text-teal-400",
      border: "border-teal-500",
    },
    all: {
      label: "All Time",
      color: "text-muted-foreground",
      border: "border-border",
    },
  };

  const currentTimeConfig = timeRangeConfig[timeRange];

  // === Wallet Selector ===
  const [selectedWalletId, setSelectedWalletId] = useState<string>("");
  const availableWallets = useMemo(() => {
    if (!zcashParams) return [];
    return zcashParams.map((p: any) => {
      const team = teams?.find((t: any) => t.id === p.teamId);
      return { ...p, teamName: team?.name };
    });
  }, [zcashParams, teams]);

  const currentWallet = useMemo(() => {
    return (
      availableWallets.find((w: any) => w.id === selectedWalletId) ||
      availableWallets.find((w: any) => w.isDefault) ||
      availableWallets[0]
    );
  }, [availableWallets, selectedWalletId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        filtersRef.current &&
        !filtersRef.current.contains(e.target as Node)
      ) {
        setFiltersOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const chainLabel =
    chainFilter === "all"
      ? "Both chains"
      : chainFilter === "MAIN"
        ? "Mainnet"
        : "Testnet";

  useEffect(() => {
    if (availableWallets.length > 0 && !selectedWalletId) {
      const defaultWallet =
        availableWallets.find((w: any) => w.isDefault) || availableWallets[0];
      if (defaultWallet) setSelectedWalletId(defaultWallet.id);
    }
  }, [availableWallets]);

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleWalletChange = async (walletId: string) => {
    const wallet = availableWallets.find((w: any) => w.id === walletId);
    if (!wallet) return;
    setSelectedWalletId(walletId);
    try {
      await setDefaultWallet(wallet.accountName, wallet.teamId);
    } catch (error) {
      console.error("Failed to switch wallet:", error);
    }
  };

  // Reset showAllUsers
  useEffect(() => {
    if (viewMode === "public" && showAllUsers) {
      setShowAllUsers(false);
    }
  }, [viewMode]);

  // Fetch top contributors
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoadingContributors(true);
        if (isAdmin) await initAddressDecoder();

        const params = new URLSearchParams();
        if (showAllUsers) params.set("all", "true");
        params.set("timeRange", timeRange);
        params.set("chain", chainFilter === "all" ? "ALL" : chainFilter);

        const res = await fetch(
          `${backendUrl}/api/kpis/top-contributors?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            },
          },
        );
        if (!res.ok) throw new Error("Failed to fetch");

        let data = await res.json();

        if (isAdmin) {
	  data = data.map((user: any) => {
	    if (user.UA_address) {
	      try {
		const decoded = getAddressReceivers(user.UA_address);
		return {
		  ...user,
		  addressType: decoded.type,
		  receivers: {
		    ironwood: !!decoded.ironwood,
		    sapling: !!decoded.sapling,
		    transparent: !!decoded.transparent,
		  },
		};
	      } catch {
		return user;
	      }
	    }
	    // Lone z-address is treated as Sapling-only (app disallows UA + z together)
	    if (user.z_address) {
	      return {
		...user,
		addressType: "Sapling",
		receivers: {
		  ironwood: false,
		  sapling: true,
		  transparent: false,
		},
	      };
	    }
	    return {
	      ...user,
	      addressType: user.addressType || "None",
	      receivers: user.receivers || {
		ironwood: false,
		sapling: false,
		transparent: false,
	      },
	    };
	  });
	}
        setTopContributors(data);
      } catch (error) {
        console.error(error);
        setTopContributors([]);
      } finally {
        setLoadingContributors(false);
      }
    };
    loadData();
  }, [isAdmin, showAllUsers, timeRange, chainFilter]);

  // Fetch time series data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const params = new URLSearchParams();
        const chain = chainFilter === "all" ? "ALL" : chainFilter;
        params.set("chain", chain);

        const res = await fetch(
          `${backendUrl}/api/kpis/contributors-over-time?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            },
          },
        );
        if (res.ok) setContributorsOverTimeData(await res.json());
      } catch {}
    };
    fetchData();
  }, [chainFilter]);

  // Fetch Average + Median Earnings Over Time
  useEffect(() => {
    const fetchData = async () => {
      try {
        const params = new URLSearchParams();
        params.set("timeRange", timeRange);
        const chain = chainFilter === "all" ? "ALL" : chainFilter;
        params.set("chain", chain);

        const res = await fetch(
          `${backendUrl}/api/kpis/average-earnings-over-time?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            },
          },
        );
        if (res.ok) {
          setAverageEarningsOverTime(await res.json());
        }
      } catch (error) {
        console.error("Failed to fetch average earnings over time:", error);
        setAverageEarningsOverTime([]);
      }
    };
    fetchData();
  }, [timeRange, chainFilter]);

  useEffect(() => {
    if (viewMode !== "admin") return;
    const fetchBountyTypes = async () => {
      try {
        const params = new URLSearchParams();
        const chain = chainFilter === "all" ? "ALL" : chainFilter;
        params.set("chain", chain);

        const res = await fetch(
          `${backendUrl}/api/kpis/bounty-types-over-time?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            },
          },
        );
        if (res.ok) setBountyTypesOverTime(await res.json());
      } catch {}
    };
    fetchBountyTypes();
  }, [viewMode, chainFilter]);

  // === Derived Values ===
  const sortedContributors = useMemo(() => {
    return [...topContributors].sort((a, b) => {
      let valA: number, valB: number;
      if (sortKey === "completed") {
        valA = a.completed;
        valB = b.completed;
      } else if (sortKey === "submitted") {
        valA = a.submitted;
        valB = b.submitted;
      } else if (sortKey === "totalEarned") {
        valA = a.totalEarned || 0;
        valB = b.totalEarned || 0;
      } else {
        valA = a.submitted > 0 ? (a.completed / a.submitted) * 100 : 0;
        valB = b.submitted > 0 ? (b.completed / b.submitted) * 100 : 0;
      }
      return sortDirection === "desc" ? valB - valA : valA - valB;
    });
  }, [topContributors, sortKey, sortDirection]);



  const displayedContributors = useMemo(() => {
    return sortedContributors.filter((u) => {
      if (!matchesBadgeFilter(badgeFilter, u)) return false;
      return matchesReceiverFilter(
        (u as any).receivers,
        receiverFilter,
        receiverMode,
      );
    });
  }, [sortedContributors, badgeFilter, receiverFilter, receiverMode]);


  const totalBounties = useMemo(
    () => topContributors.reduce((sum, u) => sum + (u.submitted || 0), 0),
    [topContributors],
  );
  const completedBounties = useMemo(
    () => topContributors.reduce((sum, u) => sum + (u.completed || 0), 0),
    [topContributors],
  );
  const cancelledBounties = useMemo(
    () => topContributors.reduce((sum, u) => sum + (u.cancelled || 0), 0),
    [topContributors],
  );
  const activeBounties = totalBounties - completedBounties - cancelledBounties;
  const uniqueContributors = topContributors.length;
  const totalZecPaid = useMemo(
    () => sortedContributors.reduce((sum, u) => sum + (u.totalEarned || 0), 0),
    [sortedContributors],
  );

  // === NEW: Avg ZEC per Earner ===
  const avgZecPerEarner = useMemo(() => {
    const earners = topContributors.filter((u) => u.totalEarned > 0);
    return earners.length > 0 ? totalZecPaid / earners.length : 0;
  }, [topContributors, totalZecPaid]);

  // Real calendar series from API (respects chain + timeRange via average-earnings fetch)
  const zecEarnedOverTime = useMemo(() => {
    let cumulative = 0;
    return (averageEarningsOverTime || []).map((row: any) => {
      const paid = Number(row.totalPaid) || 0;
      cumulative += paid;
      return {
        month: row.month,
        totalPaid: paid,
        cumulative: Number(cumulative.toFixed(4)),
      };
    });
  }, [averageEarningsOverTime]);

  // Per-member totals — matches table column (same topContributors / chain)
  const topEarnersChart = useMemo(() => {
    return [...topContributors]
      .filter((u) => (u.totalEarned || 0) > 0)
      .sort((a, b) => (b.totalEarned || 0) - (a.totalEarned || 0))
      .slice(0, 12)
      .map((u) => ({
        name: u.name || "Unknown",
        totalEarned: Number(u.totalEarned || 0),
      }));
  }, [topContributors]);

  const addressTypeDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    topContributors.forEach((u) => {
      const type = u.addressType || "None";
      counts[type] = (counts[type] || 0) + 1;
    });
    return Object.entries(counts).map(([type, count]) => ({ type, count }));
  }, [topContributors]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  // Handlers
  const handleRefreshBalance = async () => {
    setIsRefreshingBalance(true);
    setRescanMessage("");
    setRescanError("");
    try {
      await fetchBalance();
      await new Promise((r) => setTimeout(r, 400));
      setRescanMessage("Balance refreshed");
      setTimeout(() => setRescanMessage(""), 2500);
    } catch {
      setRescanError("Failed to refresh");
      setTimeout(() => setRescanError(""), 3000);
    } finally {
      setIsRefreshingBalance(false);
    }
  };

  const handleRescan = async () => {
    setIsRescanning(true);
    setRescanMessage("");
    setRescanError("");
    try {
      await rescanWallet();
      setRescanMessage("Rescan triggered");
      setTimeout(() => setRescanMessage(""), 4000);
    } catch {
      setRescanError("Failed to rescan");
      setTimeout(() => setRescanError(""), 3000);
    } finally {
      setIsRescanning(false);
    }
  };

  const openBadgeModal = (user: any) => {
    setSelectedUserForBadges(user);
    setSelectedBadges(user.badges || []);
    setIsBadgeModalOpen(true);
  };

  const closeBadgeModal = () => {
    setUserFilter("");
    setIsBadgeModalOpen(false);
    setSelectedUserForBadges(null);
    setSelectedBadges([]);
  };

  const toggleBadge = (badgeKey: string) => {
    setSelectedBadges((prev) =>
      prev.includes(badgeKey)
        ? prev.filter((b) => b !== badgeKey)
        : [...prev, badgeKey],
    );
  };

  const saveUserBadges = async () => {
    if (!selectedUserForBadges) return;

    setIsSavingBadges(true);
    try {
      const res = await fetch(
        `${backendUrl}/api/kpis/users/${selectedUserForBadges.id}/badges`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("authToken")}`,
          },
          body: JSON.stringify({ badges: selectedBadges }),
        },
      );

      if (!res.ok) throw new Error("Failed to update badges");

      // Better than window.location.reload()
      // Re-fetch the contributors list
      const params = new URLSearchParams();
      if (showAllUsers) params.set("all", "true");
      params.set("timeRange", timeRange);

      const refreshRes = await fetch(
        `${backendUrl}/api/kpis/top-contributors?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("authToken")}`,
          },
        },
      );

      if (refreshRes.ok) {
        let newData = await refreshRes.json();
        setTopContributors(newData);
      }

      toast.success("Badges updated");
      closeBadgeModal();
    } catch (error) {
      console.error(error);
      toast.error("Failed to save badges", {
        description: "Please try again.",
      });
    } finally {
      setIsSavingBadges(false);
    }
  };

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-background">
        <AdminNavbar isAdmin={true} />
        <div className="imd:container max-w-7xl mx-auto px-6 py-8 bg-background min-h-screen text-foreground">
          {/* Header */}
          <div className="grid grid-cols-1 imd:flex flex-col imd:flex-row justify-between items-center mb-8 gap-4">
            <div>
              <h1 className="text-4xl font-bold tracking-tight">
                Platform Dashboard
              </h1>
              <p className="text-muted-foreground mt-1">
                Key metrics and leaderboards
              </p>
            </div>

            <div className="grid grid-cols-1 imd:flex items-center gap-4">
              {/* View Mode Toggle - subtle text switch */}
              {isAdmin && (
                <div className="flex items-center gap-1 text-sm">
                  <button
                    onClick={() => setViewMode("public")}
                    className={cn(
                      "px-2 py-1 rounded transition-colors",
                      viewMode === "public"
                        ? "text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Public
                  </button>
                  <span className="text-muted-foreground">/</span>
                  <button
                    onClick={() => setViewMode("admin")}
                    className={cn(
                      "px-2 py-1 rounded transition-colors",
                      viewMode === "admin"
                        ? "text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Admin
                  </button>
                </div>
              )}

              {/* Combined Filters Popover */}
<div className="relative" ref={filtersRef}>
  <Button
    variant="outline"
    size="sm"
    onClick={() => setFiltersOpen(!filtersOpen)}
    className="gap-2 text-muted-foreground font-normal"
  >
    <SlidersHorizontal className="w-3.5 h-3.5" />
    {currentTimeConfig.label} · {chainLabel}
  </Button>
  {filtersOpen && (
    <div className="absolute right-0 mt-2 w-56 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg p-3 z-20">
      {/* Time Range */}
      <div className="mb-3">
        <p className="text-xs text-muted-foreground mb-1.5 px-1">
          Time Range
        </p>
        {(["30d", "90d", "all"] as const).map((opt) => (
          <button
            key={opt}
            onClick={() => setTimeRange(opt)}
            className="w-full flex items-center justify-between px-2 py-1.5 rounded text-sm hover:bg-muted"
          >
            {timeRangeConfig[opt].label}
            {timeRange === opt && <Check className="w-3.5 h-3.5" />}
          </button>
        ))}
      </div>

      {/* Chain */}
      <div className="border-t border-border pt-3">
        <p className="text-xs text-muted-foreground mb-1.5 px-1">Chain</p>
        {(
          [
            { key: "MAIN", label: "Mainnet" },
            { key: "TEST", label: "Testnet" },
            { key: "all", label: "Both" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.key}
            onClick={() => setChainFilter(opt.key as ChainFilter)}
            className="w-full flex items-center justify-between px-2 py-1.5 rounded text-sm hover:bg-muted"
          >
            {opt.label}
            {chainFilter === opt.key && <Check className="w-3.5 h-3.5" />}
          </button>
        ))}
      </div>

      {/* Badges */}
      <div className="border-t border-border pt-3">
        <p className="text-xs text-muted-foreground mb-1.5 px-1">Badges</p>
        <div className="px-1">
          <SpecialtyFilterChips compact value={badgeFilter} onChange={setBadgeFilter} />
        </div>
      </div>

      {/* Stars — replaces old avatar color filter */}
      <div className="border-t border-border pt-3">
        <p className="text-xs text-muted-foreground mb-1.5 px-1">Stars</p>
        <div className="px-1">
          <StarFilterChips value={badgeFilter} onChange={setBadgeFilter} />
        </div>
      </div>

      {/* UA receivers — admin KPI page only */}
      <div className="border-t border-border pt-3">
        <p className="text-xs text-muted-foreground mb-1.5 px-1">
          UA receivers
        </p>
        <div className="px-1 mb-2">
          <UaFilterChips value={receiverFilter} onChange={setReceiverFilter} />
        </div>
          <div className="flex gap-1 px-1">
            <button
              type="button"
              onClick={() => setReceiverMode("all")}
              className={`px-2 py-0.5 rounded text-xs border ${
                receiverMode === "all"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted border-border"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setReceiverMode("any")}
              className={`px-2 py-0.5 rounded text-xs border ${
                receiverMode === "any"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted border-border"
              }`}
            >
              Any
            </button>
            <button
              type="button"
              onClick={() => setReceiverMode("exact")}
              className={`px-2 py-0.5 rounded text-xs border ${
                receiverMode === "exact"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted border-border"
              }`}
            >
              Exact
            </button>
          </div>
      </div>

      {/* Clear */}
      {(badgeFilter.length > 0 || receiverFilter.length > 0) && (
        <div className="border-t border-border pt-2 mt-1">
          <button
            type="button"
            className="w-full text-xs text-muted-foreground hover:text-foreground px-2 py-1"
            onClick={() => {
              setBadgeFilter([]);
              setReceiverFilter([]);
            }}
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  )}
</div>
</div>
</div>
          {/* Top Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
            {[
              { label: "Total Bounties", value: totalBounties },
              {
                label: "Completed",
                value: completedBounties,
                color: "text-emerald-500 dark:text-emerald-400",
              },
              {
                label: "Active",
                value: activeBounties,
                color: "text-yellow-500 dark:text-yellow-400",
              },
              {
                label: "Total ZEC Paid",
                value: totalZecPaid.toFixed(4),
                color: "text-primary",
              },
              { label: "Unique Contributors", value: uniqueContributors },
              {
                label: "Avg ZEC per Earner",
                value: avgZecPerEarner.toFixed(4),
                color: "text-purple-500 dark:text-purple-400",
              },
            ].map((stat, i) => (
              <KpiCard key={i} timeRange={timeRange}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">
                    {stat.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className={`text-4xl font-bold tracking-tighter ${stat.color || ""}`}
                  >
                    {stat.value}
                  </div>
                </CardContent>
              </KpiCard>
            ))}
          </div>

          {/* Table */}
          <Card className="bg-card border-border mb-8">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  {showAllUsers ? "All Users" : "Top Contributors (Top 25)"}
                </CardTitle>
                <div className="w-[170px] flex justify-end">
                  {isAdmin && viewMode === "admin" && (
                    <Button
                      variant={showAllUsers ? "default" : "outline"}
                      size="sm"
                      onClick={() => setShowAllUsers(!showAllUsers)}
                    >
                      {showAllUsers
                        ? "Show Top Contributors"
                        : "Show All Users"}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingContributors ? (
                <div className="py-8 text-center text-muted-foreground">
                  Loading...
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border hover:bg-transparent">
                      <TableHead className="w-16">Rank</TableHead>
                      <TableHead className="w-12">Avatar</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={() => toggleSort("completed")}
                      >
                        Completed <ArrowUpDown className="inline w-4 h-4" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={() => toggleSort("submitted")}
                      >
                        Submitted <ArrowUpDown className="inline w-4 h-4" />
                      </TableHead>
                      {/* Badges — public; edit control admin-only */}
			<TableHead>
			  <div className="flex items-center gap-2">
			    <span>Badges</span>
			    {isAdmin && viewMode === "admin" && (
			      <button
				onClick={() => {
				  setSelectedUserForBadges(null);
				  setSelectedBadges([]);
				  setIsBadgeModalOpen(true);
				}}
				className="p-1 hover:bg-muted rounded transition-colors"
				title="Manage User Badges"
			      >
				<Pencil className="w-4 h-4 text-muted-foreground hover:text-foreground" />
			      </button>
			    )}
			  </div>
			</TableHead>
			{viewMode === "admin" && (
			  <TableHead className="w-[7.5rem]">
			    <span className="flex w-full justify-center">Address Type</span>
			  </TableHead>
			)}
			{viewMode === "admin" && (
			  <TableHead
			    className="cursor-pointer"
			    onClick={() => toggleSort("totalEarned")}
			  >
			    <span className="flex w-full items-center justify-end gap-1">
			      Total ZEC Earned
			      <ArrowUpDown className="w-4 h-4" />
			    </span>
			  </TableHead>
			)}
			{viewMode === "admin" && (
			  <TableHead
			    className="cursor-pointer"
			    onClick={() => toggleSort("completionRate")}
			  >
			    <span className="flex w-full items-center justify-end gap-1">
			      Completion %
			      <ArrowUpDown className="w-4 h-4" />
			    </span>
			  </TableHead>
			)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedContributors.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={viewMode === "admin" ? 9 : 6}
                          className="text-center py-8 text-muted-foreground"
                        >
                          No data available.
                        </TableCell>
                      </TableRow>
                    ) : (
                      displayedContributors.map((user, index) => {
                        const rate =
                          user.submitted > 0
                            ? Math.round(
                                (user.completed / user.submitted) * 100,
                              )
                            : 0;
                        return (
                          <TableRow
                            key={index}
                            className="border-b border-border hover:bg-muted/50"
                          >
                            <TableCell>#{index + 1}</TableCell>

                            {/* Avatar with hover tooltip */}
                            <TableCell>
                              <Link
                               href={profileHref(user)}
                                className="inline-block hover:opacity-80"
                                title="View profile"
                              >
                                <UserAvatar
                                  user={user}
                                  getDefaultAvatarClasses={
                                    getDefaultAvatarClasses
                                  }
                                />
                              </Link>
                            </TableCell>
                            <TableCell>
                              <Link
                                href={profileHref(user)}
                                className="hover:underline font-medium"
                              >
                                {user.name}
                              </Link>
                            </TableCell>
                            <TableCell>{user.completed}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {user.submitted}
                            </TableCell>
                            {/* Badges — public */}
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <BadgeIcons completed={user.completed} badges={user.badges} role={user.role} />
                              </div>
                            </TableCell>
                            {viewMode === "admin" && (
                              <TableCell>
                                <div className="flex justify-center">
                                  <UaReceiverIcons receivers={user.receivers} />
                                </div>
                              </TableCell>
                            )}
                            {viewMode === "admin" && (
                              <TableCell className="text-right font-medium tabular-nums">
                                {user.totalEarned
                                  ? user.totalEarned.toFixed(4)
                                  : "0.0000"}
                              </TableCell>
                            )}
                            {viewMode === "admin" && (
                              <TableCell className="text-right font-medium tabular-nums">
                                {rate}%
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Analytics Section */}
          {viewMode === "admin" && (
            <Card className="bg-card border-border mb-8">
              <CardHeader>
                <div className="flex flex-col imd:flex-row imd:items-center justify-between gap-4">
                  <CardTitle>Analytics</CardTitle>
                  <select
                    value={selectedChart}
                    onChange={(e) =>
                      setSelectedChart(e.target.value as ChartType)
                    }
                    className="bg-background border border-input text-foreground rounded px-3 py-1 text-sm max-w-50 imd:max-w-none"
                  >
                    <option value="contributors">Contributors Over Time</option>
                    <option value="earned">Total ZEC Earned Over Time</option>
                    <option value="topEarners">Top Earners</option>
                    <option value="bountyTypes">Bounty Types Over Time</option>
                    <option value="addressTypes">
                      Address Type Distribution
                    </option>
                    <option value="avgEarnings">
                      Avg Earnings per Contributor (Monthly)
                    </option>
                  </select>
                </div>
              </CardHeader>
              <CardContent className="h-[340px]">
                {selectedChart === "contributors" && (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={contributorsOverTimeData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border)"
                      />
                      <XAxis dataKey="month" stroke="var(--muted-foreground)" />
                      <YAxis stroke="var(--muted-foreground)" />
                      <Tooltip
                        cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                        contentStyle={{
                          backgroundColor: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: "6px",
                          color: "var(--popover-foreground)",
                        }}
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="cumulativeContributors"
                        name="Cumulative Contributors"
                        stroke="var(--chart-1)"
                        fill="var(--chart-1)"
                        fillOpacity={0.2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
                {selectedChart === "earned" && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={zecEarnedOverTime}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border)"
                      />
                      <XAxis
                        dataKey="month"
                        stroke="var(--muted-foreground)"
                        tickFormatter={(value) => {
                          const [year, month] = String(value).split("-");
                          if (!year || !month) return value;
                          const date = new Date(
                            parseInt(year, 10),
                            parseInt(month, 10) - 1,
                          );
                          return date.toLocaleString("default", {
                            month: "short",
                            year: "2-digit",
                          });
                        }}
                      />
                      <YAxis stroke="var(--muted-foreground)" />
                      <Tooltip
                        cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                        contentStyle={{
                          backgroundColor: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: "6px",
                          color: "var(--popover-foreground)",
                        }}
                      />
                      <Legend />
                      <Bar
                        dataKey="totalPaid"
                        name="ZEC paid this month"
                        fill="var(--chart-2)"
                        radius={[4, 4, 0, 0]}
                        activeBar={false}
                      />
                      <Bar
                        dataKey="cumulative"
                        name="Cumulative ZEC paid"
                        fill="var(--chart-1)"
                        radius={[4, 4, 0, 0]}
                        activeBar={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
                {selectedChart === "topEarners" && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topEarnersChart}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border)"
                      />
                      <XAxis
                        dataKey="name"
                        stroke="var(--muted-foreground)"
                        interval={0}
                        angle={-25}
                        textAnchor="end"
                        height={70}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis stroke="var(--muted-foreground)" />
                      <Tooltip
                        cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                        contentStyle={{
                          backgroundColor: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: "6px",
                          color: "var(--popover-foreground)",
                        }}
                      />
                      <Legend />
                      <Bar
                        dataKey="totalEarned"
                        name="Total ZEC Earned"
                        fill="var(--chart-2)"
                        radius={[4, 4, 0, 0]}
                        activeBar={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
                {selectedChart === "bountyTypes" && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={bountyTypesOverTime}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border)"
                      />
                      <XAxis dataKey="month" stroke="var(--muted-foreground)" />
                      <YAxis stroke="var(--muted-foreground)" />
                      <Tooltip
                        cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                        contentStyle={{
                          backgroundColor: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: "6px",
                          color: "var(--popover-foreground)",
                        }}
                      />
                      <Legend />
                      {bountyTypesOverTime.length > 0 &&
                        Object.keys(bountyTypesOverTime[0])
                          .filter((k) => k !== "month")
                          .map((category, index) => (
                            <Bar
                              key={index}
                              dataKey={category}
                              stackId="a"
                              fill={CHART_PALETTE[index % CHART_PALETTE.length]}
                            />
                          ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
                {selectedChart === "addressTypes" && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={addressTypeDistribution}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border)"
                      />
                      <XAxis dataKey="type" stroke="var(--muted-foreground)" />
                      <YAxis stroke="var(--muted-foreground)" />
                      <Tooltip
                        cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                        contentStyle={{
                          backgroundColor: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: "6px",
                          color: "var(--popover-foreground)",
                        }}
                      />
                      <Legend />
                      <Bar
                        dataKey="count"
                        name="Count"
                        fill="var(--chart-4)"
                        radius={[4, 4, 0, 0]}
                        activeBar={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}

                {/* NEW: Average + Median Earnings Over Time */}
                {selectedChart === "avgEarnings" && (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={averageEarningsOverTime}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border)"
                      />
                      <XAxis
                        dataKey="month"
                        stroke="var(--muted-foreground)"
                        tickFormatter={(value) => {
                          const [year, month] = value.split("-");
                          const date = new Date(
                            parseInt(year),
                            parseInt(month) - 1,
                          );
                          return date.toLocaleString("default", {
                            month: "short",
                            year: "2-digit",
                          });
                        }}
                      />
                      <YAxis stroke="var(--muted-foreground)" />
                      <Tooltip
                        cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                        contentStyle={{
                          backgroundColor: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: "6px",
                          color: "var(--popover-foreground)",
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="average"
                        name="Average ZEC"
                        stroke="var(--chart-5)"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="median"
                        name="Median ZEC"
                        stroke="var(--chart-2)"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          )}

          {/* Admin Wallet Widget */}
          {viewMode === "admin" && (
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-primary" /> Wallet
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Wallet Selector */}
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">
                    Active Wallet
                  </Label>
                  <Select
                    value={selectedWalletId}
                    onValueChange={handleWalletChange}
                  >
                    <SelectTrigger className="w-full min-w-[280px] bg-background border-input h-auto py-2.5">
                      <SelectValue>
                        {currentWallet ? (
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0",
                                currentWallet.isTeam
                                  ? "bg-violet-500/20 text-violet-500 dark:text-violet-400"
                                  : "bg-sky-500/20 text-sky-500 dark:text-sky-400",
                              )}
                            >
                              {getInitials(currentWallet.accountName || "UA")}
                            </div>
                            <div className="flex flex-col items-start min-w-0 flex-1">
                              <span className="text-sm font-medium truncate max-w-[220px]">
                                {currentWallet.accountName || "Unnamed Wallet"}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {currentWallet.isTeam ? "Team" : "Personal"}
                              </span>
                            </div>
                          </div>
                        ) : (
                          "No wallet selected"
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="min-w-[320px]">
                      {availableWallets.map((wallet: any) => (
                        <SelectItem
                          key={wallet.id}
                          value={wallet.id}
                          className="py-2.5"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                                wallet.isTeam
                                  ? "bg-violet-500/20 text-violet-500 dark:text-violet-400"
                                  : "bg-sky-500/20 text-sky-500 dark:text-sky-400",
                              )}
                            >
                              {getInitials(wallet.accountName || "UA")}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {wallet.accountName || "Unnamed"}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {wallet.isTeam ? "Team" : "Personal"}
                              </span>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Balance Display - Improved */}
                <p className="text-4xl font-bold tracking-tighter">
                  {balance
                    ? `${fmt(confirmedTotal(balance))} ZEC`
                    : `0.0000 ZEC`}
                </p>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    onClick={handleRefreshBalance}
                    variant="outline"
                    size="sm"
                    disabled={isRefreshingBalance}
                    className="flex-1"
                  >
                    {isRefreshingBalance ? "Refreshing..." : "Refresh Balance"}
                  </Button>
                  <Button
                    onClick={handleRescan}
                    variant="outline"
                    size="sm"
                    disabled={isRescanning}
                    className="flex-1"
                  >
                    {isRescanning ? "Rescanning..." : "Rescan"}
                  </Button>
                </div>

                {rescanMessage && (
                  <p className="text-sm text-emerald-500 dark:text-emerald-400 text-center">
                    {rescanMessage}
                  </p>
                )}
                {rescanError && (
                  <p className="text-sm text-destructive text-center">
                    {rescanError}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* === Badge Management Modal === */}
{isBadgeModalOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
    <div className="w-full max-w-md rounded-xl bg-popover text-popover-foreground p-6 shadow-xl border border-border">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Manage User Badges</h2>
        <button
          onClick={closeBadgeModal}
          className="text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </div>

      {/* User Selector - only show if no user is pre-selected */}
      {!selectedUserForBadges && (
        <div className="mb-4">
          <label className="text-sm text-muted-foreground mb-1 block">
            Select User
          </label>
          <div className="relative">
            <input
              type="text"
              placeholder="Type to filter users..."
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              autoFocus
            />
            <div className="mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
              {topContributors
                .filter((u) =>
                  u.name
                    .toLowerCase()
                    .includes(userFilter.toLowerCase().trim()),
                )
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      setSelectedUserForBadges(user);
                      setSelectedBadges(user.badges || []);
                      setUserFilter("");
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    {user.name}
                  </button>
                ))}
              {topContributors.filter((u) =>
                u.name
                  .toLowerCase()
                  .includes(userFilter.toLowerCase().trim()),
              ).length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No users found
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Show user name if already selected */}
      {selectedUserForBadges && (
        <div className="mb-4">
          <p className="text-sm text-muted-foreground mb-1">User</p>
          <div className="font-medium">
            {selectedUserForBadges.name}
          </div>
        </div>
      )}

      {/* Badges Multi-Select */}
      {selectedUserForBadges && (
        <div className="mb-6">
          <p className="text-sm text-muted-foreground mb-2">Badges</p>
          <AssignableBadgeList
            selected={selectedBadges}
            onToggle={toggleBadge}
          />
        </div>
      )}

      {/* Avatar Color Override */}
      {/* Star Override */}
{selectedUserForBadges && (
  <div className="mb-6 border-t border-border pt-4">
    <p className="text-sm text-muted-foreground mb-3">
      Star Override
    </p>
    <div className="space-y-1">
      {[
        { value: "avatar:default", label: "Default (based on completed bounties)", star: null },
        { value: "avatar:1", label: "1 Task", star: "1-task" },
        { value: "avatar:5", label: "5 Tasks", star: "5-tasks" },
        { value: "avatar:10", label: "10 Tasks", star: "10-tasks" },
        { value: "avatar:15", label: "15 Tasks", star: "15-tasks" },
        { value: "avatar:25", label: "25 Tasks", star: "25-tasks" },
        { value: "avatar:50", label: "50 Tasks", star: "50-tasks" },
      ].map((option) => {
        const isSelected =
          selectedBadges.includes(option.value) ||
          (option.value === "avatar:default" &&
            !selectedBadges.some((b) => b.startsWith("avatar:")));

        return (
          <button
            key={option.value}
            onClick={() => {
              const filtered = selectedBadges.filter(
                (b) => !b.startsWith("avatar:"),
              );
              if (option.value !== "avatar:default") {
                setSelectedBadges([...filtered, option.value]);
              } else {
                setSelectedBadges(filtered);
              }
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
              isSelected
                ? "bg-muted border border-primary"
                : "hover:bg-muted/50 border border-transparent"
            }`}
          >
            {option.star ? (
              <BadgeSvg
                badgeKey={option.star}
                title={option.label}
                className="w-5 h-5"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{option.label}</div>
            </div>

            {isSelected && (
              <div className="text-primary text-sm flex-shrink-0">✓</div>
            )}
          </button>
        );
      })}
    </div>
    <p className="text-xs text-muted-foreground mt-2">
      This overrides the automatic star based on completed bounties.
    </p>
  </div>
)}

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={closeBadgeModal}
          disabled={isSavingBadges}
        >
          Cancel
        </Button>
        {selectedUserForBadges && (
          <Button onClick={saveUserBadges} disabled={isSavingBadges}>
            {isSavingBadges ? "Saving..." : "Save Changes"}
          </Button>
        )}
      </div>
    </div>
  </div>
)}
        </div>
      </main>
    </ProtectedRoute>
  );
}
