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
  BarChart3,
} from "lucide-react";
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
import { TooltipProvider } from "@/components/ui/tooltip";
import Link from "next/link";
import { useState, useEffect } from "react";
import { WalletTopupModal } from "@/components/wallet-topup-modal";
import { useBounty } from "@/lib/bounty-context";
import { useRouter, useParams } from "next/navigation";
import { ThemePicker } from "@/components/theme/theme-picker";
import {
  NavDivider,
  WalletBalanceGroup,
  SyncStatusMenu,
  RescanButton,
  RoleToggleButton,
  useRescanCooldown,
  confirmedTotal,
  fmt,
} from "@/components/layout/nav-parts";

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
  // The route is the source of truth on /teams/[id]/*. Handles either param name.
  const routeParams = useParams<{ id?: string; teamId?: string }>();
  const routeTeamId = routeParams?.teamId ?? routeParams?.id;
  const [topupOpen, setTopupOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const {
    currentUser,
    logout,
    currentTeam,
    teams,
    zcashParams,
    fetchTeamWalletBalance,
    teamBalances,
    teamRescanStatus,
    fetchTeamWalletAddresses,
    teamSyncStatus,
    teamSyncStatusError,
    fetchTeamSyncStatus,
    rescanTeamWallet,
    teamRescanLoading,
  } = useBounty();

  // Resolve the team whose wallet to show: route team first, then the
  // context's current team, then the default/any team wallet param.
  const teamWalletParam =
    zcashParams?.find((p) => p.isDefault && p.isTeam && p.teamId) ??
    zcashParams?.find((p) => p.isTeam && p.teamId);

  const activeTeam =
    (routeTeamId ? teams?.find((t) => t.id === routeTeamId) : undefined) ??
    currentTeam ??
    (teamWalletParam
      ? teams?.find((t) => t.id === teamWalletParam.teamId)
      : undefined) ??
    null;

  const hasTeamWallet =
    !!activeTeam?.wallet ||
    !!zcashParams?.some((p) => p.isTeam && p.teamId === activeTeam?.id);

  const teamBalance = activeTeam ? (teamBalances[activeTeam.id] ?? null) : null;

  const rescanHidden = useRescanCooldown(
    activeTeam ? `walletImportedAt:${activeTeam.id}` : undefined,
  );

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [teamAddresses, setTeamAddresses] = useState<string[]>([]);

  // Auto-load the team wallet balance once a team with a wallet is known —
  // previously this stayed at 0.0000 ZEC until someone clicked Refresh.
  useEffect(() => {
    if (!activeTeam || !hasTeamWallet) return;
    fetchTeamWalletBalance(activeTeam.id);
  }, [activeTeam?.id, hasTeamWallet]);

  const handleRefresh = async () => {
    if (!activeTeam || !hasTeamWallet) return;
    setIsRefreshing(true);
    try {
      await fetchTeamWalletBalance(activeTeam.id);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSyncStatus = async () => {
    if (!activeTeam) return;
    setIsSyncing(true);
    try {
      await fetchTeamSyncStatus(activeTeam.id);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOpenTopup = async () => {
    setTopupOpen(true);
    setMobileMenuOpen(false);
    if (activeTeam) {
      const addrs = await fetchTeamWalletAddresses(activeTeam.id);
      setTeamAddresses(addrs);
    }
  };

  const currentSyncStatus = activeTeam
    ? (teamSyncStatus[activeTeam.id] ?? null)
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

            {isTeam && currentUser && activeTeam && hasTeamWallet && (
              <TooltipProvider delayDuration={300}>
                <NavDivider />
                <WalletBalanceGroup
                  balance={teamBalance}
                  label={activeTeam.name}
                  isTeam
                  isRefreshing={isRefreshing}
                  onOpen={handleOpenTopup}
                  onRefresh={handleRefresh}
                />
                <NavDivider />
                <SyncStatusMenu
                  syncStatus={currentSyncStatus}
                  syncStatusError={teamSyncStatusError}
                  isSyncing={isSyncing}
                  onCheckSync={handleSyncStatus}
                />
                <RescanButton
                  rescanStatus={teamRescanStatus}
                  rescanLoading={teamRescanLoading}
                  rescanHidden={rescanHidden}
                  onRescan={() => rescanTeamWallet(activeTeam.id)}
                />
                <NavDivider />
              </TooltipProvider>
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
                          onClick={handleOpenTopup}
                        >
                          <Wallet className="h-4 w-4" />
                          {teamBalance
                            ? `${fmt(confirmedTotal(teamBalance))} ZEC`
                            : "0.0000 ZEC"}
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
        <WalletTopupModal
          open={topupOpen}
          onOpenChange={setTopupOpen}
          addresses={teamAddresses}
        />
      )}
    </>
  );
}
