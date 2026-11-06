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
  Activity,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FolderSync,
  User,
  Building2,
  BookOpen,
  LayoutDashboard,
  BarChart3,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import Link from "next/link";
import { useState, useEffect } from "react";
import { WalletTopupModal } from "@/components/wallet-topup-modal";
import { useBounty } from "@/lib/bounty-context";
import { cn } from "@/lib/utils";
import { ThemePicker } from "@/components/theme/theme-picker";
import {
  NavDivider,
  WalletBalanceGroup,
  SyncStatusMenu,
  SyncStatusSummary,
  RescanButton,
  RoleToggleButton,
  useRescanCooldown,
  confirmedTotal,
  fmt,
} from "@/components/layout/nav-parts";

// ── Main navbar ────────────────────────────────────────────────────────────
export function AdminNavbar({
  isAdmin = true,
  searchQuery,
  onSearchChange,
}: {
  isAdmin?: boolean;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
}) {
  const searchEnabled = !!onSearchChange;

  const { theme, setTheme } = useTheme();
  const [topupOpen, setTopupOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileRescanConfirmOpen, setMobileRescanConfirmOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const rescanHidden = useRescanCooldown();

  const {
    currentUser,
    currentTeam,
    zcashParams,
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

  // Auto-load the wallet balance as soon as the navbar mounts for an admin —
  // previously this stayed at 0.0000 ZEC until the user manually hit refresh
  // or opened the topup modal.
  useEffect(() => {
    if (currentUser?.role === "ADMIN") {
      fetchBalance();
    }
  }, [currentUser?.id, currentUser?.role]);

  const activeWallet =
    zcashParams?.find((p) => p.isDefault) ??
    (zcashParams && zcashParams.length > 0
      ? zcashParams[zcashParams.length - 1]
      : null);
  const activeIsTeam = !!(activeWallet?.isTeam && activeWallet?.teamId);
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([fetchBalance()]);
    } finally {
      setIsRefreshing(false);
    }
  };
  const handleWalletClick = async () => {
    setTopupOpen(true);
    await Promise.all([fetchAddresses()]);
  };
  const handleWalletClickMobile = async () => {
    setTopupOpen(true);
    setMobileMenuOpen(false);
    await Promise.all([fetchAddresses()]);
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
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight mr-4 md:mr-6">
            <Link
              href="https://zechub.wiki"
              prefetch
              target="_blank"
              className="transition-colors hover:text-primary"
            >
              <img
                src="/ZecHubBlue.png"
                alt="ZecHub"
                className="h-8 sm:h-10 md:h-12 object-contain"
              />
            </Link>
            <Link
              href="/admin"
              prefetch
              className="transition-colors hover:text-primary"
            >
              <span className="inline text-sm sam:text-base imd:text-2xl">
                ZEC Bounties
              </span>
            </Link>
          </div>

          {/* Desktop nav links */}
          <div className="hidden xl:flex items-center space-x-4 text-sm font-medium mr-auto">
            <Link
              href="/docs"
              className="flex items-center gap-1.5 transition-colors hover:text-primary"
            >
              <BookOpen className="h-4 w-4" />
              Docs
            </Link>
            <Link
              href="/admin/bounties"
              className="transition-colors hover:text-primary"
            >
              Bounties
            </Link>
            <Link
              href="/admin/export"
              className="transition-colors hover:text-primary"
            >
              Export
            </Link>
            <Link
              href="/admin/teams"
              prefetch
              className="transition-colors hover:text-primary"
            >
              Teams
            </Link>
            <Link
              href="/admin/profile"
              prefetch
              className="transition-colors hover:text-primary"
            >
              Profile
            </Link>
            <Link
              href="/admin/settings"
              prefetch
              className="transition-colors hover:text-primary"
            >
              Settings
            </Link>

            <span className="mx-1 h-4 w-px bg-border" aria-hidden />

            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/admin/dashboard"
                    prefetch
                    aria-label="Admin dashboard"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-amber-500 transition-colors hover:bg-amber-500/10 hover:text-amber-400"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  Dashboard
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/admin/kpis"
                    prefetch
                    aria-label="KPIs"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sky-400 transition-colors hover:bg-sky-500/10 hover:text-sky-300"
                  >
                    <BarChart3 className="h-4 w-4" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  KPIs
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Desktop right side — grouped into fixed-width sections separated
              by dividers, so no single group's content can grow and push on
              its neighbours. */}
          <div className="hidden xl:flex items-center ml-auto">
            {searchEnabled && (
              <div className="relative w-[160px] 2xl:w-[220px] mr-2">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search title or @username"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="pl-8 h-9 w-full bg-muted/50 border-none focus-visible:ring-1"
                />
              </div>
            )}

            <TooltipProvider delayDuration={300}>
              <NavDivider />

              <WalletBalanceGroup
                balance={balance}
                isRefreshing={isRefreshing}
                onOpen={handleWalletClick}
                onRefresh={handleRefresh}
              />

              <NavDivider />

              {/* Sync (read-only check) and Rescan (destructive reset) are
                  kept as two distinct, fixed-size controls. Neither one's
                  status display can grow and squeeze its neighbours. */}
              <SyncStatusMenu
                syncStatus={syncStatus}
                syncStatusError={syncStatusError}
                isSyncing={isSyncing}
                onCheckSync={handleSyncStatus}
              />
              <RescanButton
                rescanStatus={rescanStatus}
                rescanLoading={rescanLoading}
                rescanHidden={rescanHidden}
                onRescan={rescanWallet}
              />

              <RoleToggleButton />

              <NavDivider />

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

              <ThemePicker />

              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Bell className="h-4 w-4" />
              </Button>

              <NavDivider />

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

          {/* Mobile right side */}
          <div className="flex xl:hidden items-center gap-1 ml-auto">
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

            <ThemePicker />

            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-[300px] p-4 overflow-y-auto"
              >
                <SheetHeader>
                  <SheetTitle>Admin Menu</SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-4 mt-6">
                  {searchEnabled && (
                    <div className="relative w-[160px] 2xl:w-[220px] mr-2">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="search"
                        placeholder="Search title or @username"
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-8 h-9 w-full bg-muted/50 border-none focus-visible:ring-1"
                      />
                    </div>
                  )}

                  {activeWallet && (
                    <div
                      className={cn(
                        "flex items-center gap-3 px-3 py-3 rounded-lg border",
                        activeIsTeam
                          ? "bg-violet-50 border-violet-200 dark:bg-violet-950/30 dark:border-violet-800"
                          : "bg-sky-50 border-sky-200 dark:bg-sky-950/30 dark:border-sky-800",
                      )}
                    >
                      <div
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                          activeIsTeam
                            ? "bg-violet-100 dark:bg-violet-900"
                            : "bg-sky-100 dark:bg-sky-900",
                        )}
                      >
                        {activeIsTeam ? (
                          <Building2 className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                        ) : (
                          <User className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p
                          className={cn(
                            "text-xs font-semibold truncate",
                            activeIsTeam
                              ? "text-violet-700 dark:text-violet-300"
                              : "text-sky-700 dark:text-sky-300",
                          )}
                        >
                          {activeWallet.accountName || "Active wallet"}
                        </p>
                        <p
                          className={cn(
                            "text-[11px]",
                            activeIsTeam
                              ? "text-violet-500 dark:text-violet-400"
                              : "text-sky-500 dark:text-sky-400",
                          )}
                        >
                          {activeIsTeam
                            ? `Team wallet · ${currentTeam?.name ?? "Team"}`
                            : "Personal wallet"}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    {[
                      { href: "/admin/dashboard", label: "Dashboard" },
                      { href: "/admin/bounties", label: "Bounties" },
                      { href: "/admin/export", label: "Export" },
                      { href: "/admin/teams", label: "Teams" },
                      { href: "/admin/profile", label: "Profile" },
                      { href: "/admin/kpis", label: "KPIs" },
                      { href: "/admin/settings", label: "Settings" },
                      { href: "/docs", label: "Docs" },
                    ].map(({ href, label }) => (
                      <Link
                        key={href}
                        href={href}
                        className="px-3 py-2 text-sm font-medium rounded-md hover:bg-accent transition-colors"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {label}
                      </Link>
                    ))}
                  </div>

                  <div className="border-t" />

                  <Button
                    variant="outline"
                    className="gap-2 justify-start font-mono"
                    onClick={handleWalletClickMobile}
                  >
                    <Wallet className="h-4 w-4" />
                    {balance
                      ? `${fmt(confirmedTotal(balance))} ZEC`
                      : `0.0000 ZEC`}
                  </Button>

                  {/* Sync status card — read-only, separate from rescan */}
                  {(syncStatus || syncStatusError) && (
                    <div className="px-3 py-2 rounded-lg border bg-muted/30 text-xs space-y-1.5">
                      <p className="text-muted-foreground font-medium">
                        Sync status
                      </p>
                      {syncStatusError ? (
                        <div className="flex items-start gap-1.5 text-destructive font-mono">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span className="break-words">{syncStatusError}</span>
                        </div>
                      ) : (
                        <SyncStatusSummary status={syncStatus} />
                      )}
                    </div>
                  )}

                  {/* Rescan result card — separate from sync, since it's a
                      different, destructive action */}
                  {!!rescanStatus && (
                    <div className="px-3 py-2 rounded-lg border bg-muted/30 text-xs space-y-1.5">
                      <p className="text-muted-foreground font-medium">
                        Last rescan
                      </p>
                      <div className="flex items-start gap-1.5 text-emerald-500 font-mono">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span className="break-words">
                          {typeof rescanStatus === "string"
                            ? rescanStatus
                            : JSON.stringify(rescanStatus)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="gap-1.5 flex-1 text-xs"
                      onClick={handleRefresh}
                      disabled={isRefreshing}
                    >
                      <RefreshCw
                        className={cn(
                          "h-3.5 w-3.5",
                          isRefreshing && "animate-spin",
                        )}
                      />
                      Refresh
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-1.5 flex-1 text-xs"
                      onClick={handleSyncStatus}
                      disabled={isSyncing}
                    >
                      {isSyncing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Activity className="h-3.5 w-3.5" />
                      )}
                      Check sync
                    </Button>
                  </div>

                  <AlertDialog
                    open={mobileRescanConfirmOpen}
                    onOpenChange={setMobileRescanConfirmOpen}
                  >
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "gap-1.5 w-full text-xs transition-all duration-300",
                          rescanHidden && "opacity-40 cursor-not-allowed",
                        )}
                        disabled={rescanLoading || rescanHidden}
                      >
                        {rescanLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FolderSync className="h-3.5 w-3.5" />
                        )}
                        {rescanHidden
                          ? "Rescan available soon..."
                          : "Rescan wallet"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Rescan wallet?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This resets your wallet balance to 0 and rescans the
                          chain from scratch. Your balance will show 0 until the
                          rescan finishes — this can take a while.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            setMobileRescanConfirmOpen(false);
                            rescanWallet();
                          }}
                        >
                          Rescan
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

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
                    <span className="text-sm font-medium">
                      {currentUser?.name}
                    </span>
                  </div>

                  <div className="border-t" />

                  <Button
                    variant="ghost"
                    className="justify-start text-destructive"
                    asChild
                  >
                    <div onClick={logout}>Log out</div>
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
        {/* Mobile search bar — persistent second row, no need to open the menu */}
        {searchEnabled && (
          <div className="flex imd:hidden items-center px-4 pb-3 md:px-6">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search title or @username"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-8 h-9 w-full bg-muted/50 border-none focus-visible:ring-1"
              />
            </div>
          </div>
        )}
      </nav>
      {isAdmin && (
        <WalletTopupModal open={topupOpen} onOpenChange={setTopupOpen} />
      )}
    </>
  );
}
