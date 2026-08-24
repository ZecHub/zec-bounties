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
  LogIn,
  ShieldCheck,
  User,
  Loader2,
  BarChart3,
  RefreshCw,
  Activity,
  CheckCircle2,
  AlertCircle,
  Building2,
  FolderSync,
} from "lucide-react";
import { Balance } from "@/lib/types";
import type { SyncStatus } from "@/lib/bounty-context";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import { useRouter } from "next/navigation";
import { ThemePicker } from "@/components/theme/theme-picker";

// ── Role toggle button ────────────────────────────────────────────────────────
function RoleToggleButton({ compact = false }: { compact?: boolean }) {
  const { currentUser, switchRole, isSwitchingRole } = useBounty();
  const router = useRouter();
  if (!currentUser?.isRobin) return null;

  const isTeam = currentUser.role === "TEAM";

  const handleSwitch = async () => {
    await switchRole();
    router.push(isTeam ? "/home" : "/admin");
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
        ) : isTeam ? (
          <User className="h-4 w-4" />
        ) : (
          <ShieldCheck className="h-4 w-4" />
        )}
        {isSwitchingRole
          ? "Switching..."
          : isTeam
            ? "Switch to Client"
            : "Switch to Admin"}
      </Button>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
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
            ) : isTeam ? (
              <User className="h-3.5 w-3.5" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            <span className="hidden xl:inline">
              {isSwitchingRole ? "..." : isTeam ? "Client" : "Admin"}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {isTeam ? "Switch to Client view" : "Switch to Admin view"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ActiveWalletTypePill() {
  const { zcashParams, currentTeam } = useBounty();
  if (!zcashParams || zcashParams.length === 0) return null;
  const active =
    zcashParams.find((p) => p.isDefault) ?? zcashParams[zcashParams.length - 1];
  if (!active) return null;
  const isTeam = !!(active.isTeam && active.teamId);
  const teamName = isTeam && currentTeam ? currentTeam.name : null;
  const accountLabel = active.accountName || "Wallet";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-semibold cursor-default select-none transition-colors",
            isTeam
              ? "bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-950/50 dark:border-violet-800 dark:text-violet-300"
              : "bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-950/50 dark:border-sky-800 dark:text-sky-300",
          )}
        >
          {isTeam ? (
            <Building2 className="h-3 w-3 shrink-0" />
          ) : (
            <User className="h-3 w-3 shrink-0" />
          )}
          <span className="hidden lg:inline">
            {isTeam ? (teamName ?? "Team") : accountLabel}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs max-w-[200px]">
        <p className="font-semibold mb-0.5">
          {isTeam ? "Team wallet" : "Personal wallet"}
        </p>
        <p className="text-muted-foreground">{accountLabel}</p>
        {teamName && <p className="text-muted-foreground">Team: {teamName}</p>}
      </TooltipContent>
    </Tooltip>
  );
}

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
      <span className={done ? "text-emerald-500" : "text-amber-400"}>
        {pct != null
          ? `${Number(pct).toFixed(2)}%`
          : status.in_progress
            ? "…"
            : "—"}
      </span>
    </div>
  );
}

export function TeamNavbar({
  isTeam = false,
  searchQuery,
  onSearchChange,
}: {
  isTeam?: boolean;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
}) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [topupOpen, setTopupOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [zecBalance] = useState(0.0);
  const {
    currentUser,
    logout,
    currentTeam,
    fetchTeamWalletBalance,
    teamSyncStatus,
    teamSyncStatusError,
    fetchTeamSyncStatus,
    rescanTeamWallet,
    teamRescanLoading,
  } = useBounty();
  const [teamBalance, setTeamBalance] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const confirmedTotal = (b: Balance | undefined) =>
    ((b?.confirmed_ironwood_balance ?? 0) +
      (b?.confirmed_orchard_balance ?? 0) +
      (b?.confirmed_sapling_balance ?? 0) +
      (b?.confirmed_transparent_balance ?? 0)) /
    1e8;
  const fmt = (n: number) => n.toFixed(4);

  const handleRefresh = async () => {
    if (!currentTeam) return;
    setIsRefreshing(true);
    try {
      const bal = await fetchTeamWalletBalance(currentTeam.id);
      setTeamBalance(bal);
    } finally {
      setIsRefreshing(false);
    }
  };
  const handleSyncStatus = async () => {
    if (!currentTeam) return;
    setIsSyncing(true);
    try {
      await fetchTeamSyncStatus(currentTeam.id);
    } finally {
      setIsSyncing(false);
    }
  };
  const currentSyncStatus = currentTeam
    ? (teamSyncStatus[currentTeam.id] ?? null)
    : null;

  return (
    <>
      <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center px-4 md:px-6">
          {/* Logo */}
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight mr-4 md:mr-6">
            <Link
              href="https://zechub.wiki"
              target="_blank"
              className="transition-colors hover:text-primary"
            >
              <img
                src="/ZecHubBlue.png"
                alt="ZecHubBlue.png"
                style={{ height: "3rem" }}
              />
            </Link>
            <Link
              href={currentUser ? "/home" : "/"}
              className="transition-colors hover:text-primary"
            >
              <span className="hidden sm:inline">ZEC Bounties</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          {currentUser && (
            <div className="hidden xl:flex items-center space-x-5 text-sm font-medium mr-auto">
              {/* Dashboard Link - Visible to everyone */}
              <Link
                href="/teams"
                className="flex items-center gap-1.5 transition-colors hover:text-primary"
              >
                Teams
              </Link>

              <Link
                href="/teams/bounties"
                className="transition-colors hover:text-primary"
              >
                Bounties
              </Link>
              <Link
                href="/teams/profile"
                className="transition-colors hover:text-primary"
              >
                Profile
              </Link>
            </div>
          )}

          {/* Desktop Right Side */}
          <div className="hidden xl:flex items-center gap-3 ml-auto">
            <div className="relative max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search bounties..."
                value={searchQuery}
                onChange={(e) => onSearchChange?.(e.target.value)}
                className="pl-8 h-9 w-[200px] lg:w-[300px] bg-muted/50 border-none focus-visible:ring-1"
              />
            </div>

            {isTeam && currentUser && currentTeam?.wallet && (
              <>
                {(currentSyncStatus || teamSyncStatusError) && (
                  <div className="px-1">
                    {teamSyncStatusError ? (
                      <div className="flex items-center gap-2 text-xs text-destructive font-mono">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        {teamSyncStatusError}
                      </div>
                    ) : (
                      <SyncStatusBadge status={currentSyncStatus} />
                    )}
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
                  {teamBalance
                    ? `${fmt(confirmedTotal(teamBalance))} ZEC`
                    : "0.0000 ZEC"}
                </Button>

                <div className="grid grid-cols-3 gap-2">
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
                    Sync
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-1.5 flex-1 text-xs"
                    onClick={() => rescanTeamWallet(currentTeam.id)}
                    disabled={teamRescanLoading}
                  >
                    {teamRescanLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FolderSync className="h-3.5 w-3.5" />
                    )}
                    Rescan
                  </Button>
                </div>
              </>
            )}

            {/* Role Toggle */}
            {currentUser && <RoleToggleButton />}

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

            {currentUser && (
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Bell className="h-4 w-4" />
              </Button>
            )}

            {!currentUser ? (
              <Button
                onClick={() => router.push("/login")}
                className="gap-2 h-9 px-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg shadow-primary/20"
              >
                <LogIn className="h-4 w-4" />
                Sign In
              </Button>
            ) : (
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
                      <AvatarFallback>
                        {currentUser?.name?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>{currentUser?.name}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <div onClick={logout} className="cursor-pointer">
                      Log out
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Mobile Right Side */}
          <div className="flex xl:hidden items-center gap-2 ml-auto">
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
                  <SheetTitle>Menu</SheetTitle>
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

                  {!currentUser && (
                    <>
                      <Button
                        onClick={() => {
                          router.push("/login");
                          setMobileMenuOpen(false);
                        }}
                        className="gap-2 w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg shadow-primary/20"
                      >
                        <LogIn className="h-4 w-4" />
                        Sign In
                      </Button>
                      <div className="border-t" />
                    </>
                  )}

                  {currentUser && (
                    <>
                      <div className="flex flex-col gap-2">
                        {/* Dashboard - Mobile */}
                        <Link
                          href="/teams"
                          className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md hover:bg-accent transition-colors"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          <BarChart3 className="h-4 w-4" />
                          Teams
                        </Link>

                        <Link
                          href="/teams/bounties"
                          className="px-3 py-2 text-sm font-medium rounded-md hover:bg-accent transition-colors"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          My Bounties
                        </Link>
                        <Link
                          href="/teams/profile"
                          className="px-3 py-2 text-sm font-medium rounded-md hover:bg-accent transition-colors"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          Profile
                        </Link>

                        {isTeam && (
                          <Link
                            href="/admin"
                            className="px-3 py-2 text-sm font-bold text-primary rounded-md hover:bg-accent transition-colors"
                            onClick={() => setMobileMenuOpen(false)}
                          >
                            Admin Console
                          </Link>
                        )}
                      </div>

                      <div className="border-t" />

                      {isTeam && (
                        <Button
                          variant="outline"
                          className="gap-2 justify-start font-mono"
                          onClick={() => {
                            setTopupOpen(true);
                            setMobileMenuOpen(false);
                          }}
                        >
                          <Wallet className="h-4 w-4" />
                          {zecBalance.toFixed(4)} ZEC
                        </Button>
                      )}

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
                          <AvatarFallback>
                            {currentUser?.name?.charAt(0).toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            {currentUser?.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {currentUser?.email}
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
                          <div onClick={logout} className="cursor-pointer">
                            Log out
                          </div>
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>

      {isTeam && currentUser && (
        <WalletTopupModal open={topupOpen} onOpenChange={setTopupOpen} />
      )}
    </>
  );
}
