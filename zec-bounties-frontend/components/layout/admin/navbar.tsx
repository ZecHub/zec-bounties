"use client";

import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  Moon,
  Sun,
  Bell,
  Search,
  Wallet,
  Menu,
  RefreshCw,
  ScanLine,
  Activity,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FolderSync,
  ShieldCheck,
  User,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import Link from "next/link";
import { useState } from "react";
import { WalletTopupModal } from "@/components/wallet-topup-modal";
import { useBounty } from "@/lib/bounty-context";
import type { SyncStatus } from "@/lib/bounty-context";
import { useRouter } from "next/navigation";

// ── Sync status badge ─────────────────────────────────────────────────────────
function SyncStatusBadge({ status }: { status: SyncStatus | null }) {
  if (!status) return null;

  const pct =
    status.percentage_total_blocks_scanned ||
    status.percentage_total_outputs_scanned;

  const done = pct === 100 || status.in_progress === false;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/60 border text-xs font-mono">
      {done ? (
        <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
      ) : (
        <Activity className="h-3 w-3 text-amber-400 animate-pulse shrink-0" />
      )}
      <span className="hidden xl:inline text-muted-foreground">Sync</span>
      <span className={done ? "text-emerald-500" : "text-amber-400"}>
        {pct != null
          ? `${Number(pct).toFixed(2)}%`
          : status.in_progress
            ? "…"
            : "—"}
      </span>
      {status.synced_blocks != null && status.total_blocks != null && (
        <span className="hidden 2xl:inline text-muted-foreground/60">
          ({status.synced_blocks}/{status.total_blocks})
        </span>
      )}
    </div>
  );
}

// ── Role toggle button ────────────────────────────────────────────────────────
function RoleToggleButton({ compact = false }: { compact?: boolean }) {
  const { currentUser, switchRole, isSwitchingRole } = useBounty();
  const router = useRouter();

  if (!currentUser?.isRobin) return null;

  const isAdmin = currentUser.role === "ADMIN";

  const handleSwitch = async () => {
    await switchRole();
    // Redirect to the appropriate home page after role switch
    router.push(isAdmin ? "/home" : "/admin");
  };

  if (compact) {
    return (
      <Button
        variant="outline"
        className="gap-2 justify-start"
        onClick={handleSwitch}
        disabled={isSwitchingRole}
      >
        {isSwitchingRole ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isAdmin ? (
          <User className="h-4 w-4" />
        ) : (
          <ShieldCheck className="h-4 w-4" />
        )}
        {isSwitchingRole
          ? "Switching..."
          : isAdmin
            ? "Switch to Client"
            : "Switch to Admin"}
      </Button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-8 text-xs font-medium border-dashed"
          onClick={handleSwitch}
          disabled={isSwitchingRole}
        >
          {isSwitchingRole ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isAdmin ? (
            <User className="h-3.5 w-3.5" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" />
          )}
          <span className="hidden xl:inline">
            {isSwitchingRole ? "..." : isAdmin ? "Client" : "Admin"}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {isAdmin ? "Switch to Client view" : "Switch to Admin view"}
      </TooltipContent>
    </Tooltip>
  );
}

export function AdminNavbar({
  isAdmin = true,
  searchQuery,
  onSearchChange,
}: {
  isAdmin?: boolean;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
}) {
  const { theme, setTheme } = useTheme();
  const [topupOpen, setTopupOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const {
    currentUser,
    logout,
    balance,
    fetchBalance,
    fetchAddresses,
    syncStatus,
    rescanStatus,
    syncStatusError,
    fetchSyncStatus,
    rescanWallet,
    rescanLoading,
  } = useBounty();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([fetchAddresses(), fetchBalance()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSyncStatus = async () => {
    setIsSyncing(true);
    try {
      await fetchSyncStatus();
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <>
      <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center px-4 md:px-6">
          {/* Logo */}
          <Link href="/admin" className="transition-colors hover:text-primary">
            <div className="flex items-center gap-2 font-bold text-xl tracking-tight mr-4 md:mr-6">
              <img
                src="ZecHubBlue.png"
                alt="ZecHubBlue.png"
                style={{ height: "3rem" }}
              />
              <span className="hidden sm:inline">ZEC Bounties</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center space-x-4 text-sm font-medium mr-auto">
            <Link
              href="/admin/dashboard"
              className="transition-colors hover:text-primary"
            >
              Dashboard
            </Link>
            <Link
              href="/admin/bounties"
              className="transition-colors hover:text-primary"
            >
              Bounties
            </Link>
          </div>

          {/* Desktop Right Side */}
          <div className="hidden lg:flex items-center gap-1 ml-auto">
            {/* Search */}
            <div className="relative max-w-sm mr-2">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search bounties..."
                value={searchQuery}
                onChange={(e) => onSearchChange?.(e.target.value)}
                className="pl-8 h-9 w-[200px] lg:w-[300px] bg-muted/50 border-none focus-visible:ring-1"
              />
            </div>

            <TooltipProvider delayDuration={300}>
              {/* Sync / rescan status badges */}
              {syncStatus || syncStatusError ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      {syncStatusError ? (
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/60 border text-xs font-mono text-destructive">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          <span className="hidden xl:inline">Error</span>
                        </div>
                      ) : (
                        <SyncStatusBadge status={syncStatus} />
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    className="font-mono text-xs max-w-xs whitespace-pre-wrap"
                  >
                    {syncStatusError
                      ? syncStatusError
                      : JSON.stringify(syncStatus, null, 2)}
                  </TooltipContent>
                </Tooltip>
              ) : rescanStatus ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/60 border text-xs font-mono text-emerald-500">
                      <CheckCircle2 className="h-3 w-3 shrink-0" />
                      <span className="hidden xl:inline">Rescan Success</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    className="font-mono text-xs max-w-xs whitespace-pre-wrap"
                  >
                    {typeof rescanStatus === "string"
                      ? rescanStatus
                      : JSON.stringify(rescanStatus, null, 2)}
                  </TooltipContent>
                </Tooltip>
              ) : null}

              {/* Wallet balance */}
              <Button
                variant="ghost"
                className="gap-2 h-9 text-xs font-mono"
                onClick={() => setTopupOpen(true)}
              >
                <Wallet className="h-4 w-4" />
                {balance
                  ? `${(balance / 1e8).toFixed(4)} ZEC`
                  : `${(0.0).toFixed(4)} ZEC`}
              </Button>

              {/* Refresh */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="h-9 w-9"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Refresh balance
                </TooltipContent>
              </Tooltip>

              {/* Sync status */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleSyncStatus}
                    disabled={isSyncing}
                    className="h-9 w-9"
                  >
                    {isSyncing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Activity className="w-4 h-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Refresh sync status
                </TooltipContent>
              </Tooltip>

              {/* Rescan */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={rescanWallet}
                    disabled={rescanLoading}
                    className="h-9 w-9"
                  >
                    {rescanLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FolderSync className="w-4 h-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Rescan wallet
                </TooltipContent>
              </Tooltip>

              {/* ── Role toggle (isRobin only) ── */}
              <RoleToggleButton />

              {/* Theme toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="h-9 w-9"
              >
                <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Toggle theme</span>
              </Button>

              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Bell className="h-4 w-4" />
              </Button>

              {/* User menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative h-8 w-8 rounded-full"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage
                        src={
                          currentUser?.avatar ||
                          "/abstract-geometric-shapes.png"
                        }
                        alt="User"
                      />
                      <AvatarFallback>JD</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>{currentUser?.name}</DropdownMenuLabel>
                  <DropdownMenuItem asChild>
                    <div onClick={logout}>Log out</div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TooltipProvider>
          </div>

          {/* Mobile Right Side */}
          <div className="flex lg:hidden items-center gap-2 ml-auto">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="h-9 w-9"
            >
              <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>

            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] p-4">
                <SheetHeader>
                  <SheetTitle>Admin Menu</SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-4 mt-6">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Search bounties..."
                      value={searchQuery}
                      onChange={(e) => onSearchChange?.(e.target.value)}
                      className="pl-8 bg-muted/50 border-none focus-visible:ring-1"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Link
                      href="/admin/dashboard"
                      className="px-3 py-2 text-sm font-medium rounded-md hover:bg-accent transition-colors"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Dashboard
                    </Link>
                    <Link
                      href="/admin/bounties"
                      className="px-3 py-2 text-sm font-medium rounded-md hover:bg-accent transition-colors"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Bounties
                    </Link>
                  </div>

                  <div className="border-t" />

                  {(syncStatus || syncStatusError) && (
                    <div className="px-1">
                      <p className="text-xs text-muted-foreground mb-1.5">
                        Sync Status
                      </p>
                      {syncStatusError ? (
                        <div className="flex items-center gap-2 text-xs text-destructive font-mono">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          {syncStatusError}
                        </div>
                      ) : (
                        <SyncStatusBadge status={syncStatus} />
                      )}
                    </div>
                  )}

                  {rescanStatus && (
                    <div className="px-1">
                      <p className="text-xs text-muted-foreground mb-1.5">
                        Rescan Status
                      </p>
                      <div className="flex items-center gap-2 text-xs text-emerald-500 font-mono">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        {typeof rescanStatus === "string"
                          ? rescanStatus
                          : JSON.stringify(rescanStatus)}
                      </div>
                    </div>
                  )}

                  <Button
                    variant="outline"
                    className="gap-2 justify-start font-mono"
                    onClick={() => {
                      setTopupOpen(true);
                      setMobileMenuOpen(false);
                    }}
                  >
                    <Wallet className="h-4 w-4" />
                    {balance
                      ? `${(balance / 1e8).toFixed(4)} ZEC`
                      : `${(0.0).toFixed(4)} ZEC`}
                  </Button>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="gap-2 flex-1"
                      onClick={handleRefresh}
                      disabled={isRefreshing}
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
                      />
                      Refresh
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 flex-1"
                      onClick={handleSyncStatus}
                      disabled={isSyncing}
                    >
                      {isSyncing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Activity className="h-4 w-4" />
                      )}
                      Sync
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 flex-1"
                      onClick={rescanWallet}
                      disabled={rescanLoading}
                    >
                      {rescanLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FolderSync className="h-4 w-4" />
                      )}
                      Rescan
                    </Button>
                  </div>

                  {/* ── Mobile role toggle (isRobin only) ── */}
                  <RoleToggleButton compact />

                  <Button variant="outline" className="gap-2 justify-start">
                    <Bell className="h-4 w-4" />
                    Notifications
                  </Button>

                  <div className="border-t" />

                  <div className="flex items-center gap-3 px-3 py-2">
                    <Avatar className="h-10 w-10">
                      <AvatarImage
                        src={
                          currentUser?.avatar ||
                          "/abstract-geometric-shapes.png"
                        }
                        alt="User"
                      />
                      <AvatarFallback>JD</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {currentUser?.name}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="border-t my-2" />
                    <Button
                      variant="ghost"
                      className="justify-start text-destructive"
                      asChild
                    >
                      <div onClick={logout}>Log out</div>
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>

      {isAdmin && (
        <WalletTopupModal open={topupOpen} onOpenChange={setTopupOpen} />
      )}
    </>
  );
}
