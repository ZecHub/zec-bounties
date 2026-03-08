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

// ── Role toggle button ────────────────────────────────────────────────────────
function RoleToggleButton({ compact = false }: { compact?: boolean }) {
  const { currentUser, switchRole, isSwitchingRole } = useBounty();
  const router = useRouter();

  if (!currentUser?.isRobin) return null;

  const isAdmin = currentUser.role === "ADMIN";

  const handleSwitch = async () => {
    await switchRole();
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
    </TooltipProvider>
  );
}

export function Navbar({
  isAdmin = false,
  searchQuery,
  onSearchChange,
}: {
  isAdmin?: boolean;
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
}) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [topupOpen, setTopupOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [zecBalance] = useState(0.0);
  const { currentUser, logout } = useBounty();

  return (
    <>
      <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center px-4 md:px-6">
          <Link href="/home" className="transition-colors hover:text-primary">
            <div className="flex items-center gap-2 font-bold text-xl tracking-tight mr-4 md:mr-6">
              <img
                src="ZecHubBlue.png"
                alt="ZecHubBlue.png"
                style={{ height: "3rem" }}
              />
              <span className="hidden sm:inline">ZEC Bounties</span>
            </div>
          </Link>

          {/* Desktop Navigation - Only show if logged in */}
          {currentUser && (
            <div className="hidden lg:flex items-center space-x-4 text-sm font-medium mr-auto">
              {!isAdmin && (
                <Link
                  href="/dashboard"
                  className="transition-colors hover:text-primary"
                >
                  Dashboard
                </Link>
              )}
              <Link
                href="/my-bounties"
                className="transition-colors hover:text-primary"
              >
                My Bounties
              </Link>
              {isAdmin && (
                <Link
                  href="/admin"
                  className="transition-colors text-primary font-bold"
                >
                  Admin Console
                </Link>
              )}
            </div>
          )}

          {/* Desktop Right Side */}
          <div className="hidden lg:flex items-center gap-3 ml-auto">
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

            {isAdmin && currentUser && (
              <Button
                variant="ghost"
                className="gap-2 h-9 text-xs font-mono"
                onClick={() => setTopupOpen(true)}
              >
                <Wallet className="h-4 w-4" />
                {zecBalance.toFixed(4)} ZEC
              </Button>
            )}

            {/* ── Role toggle (isRobin only) ── */}
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
                        {!isAdmin && (
                          <Link
                            href="/dashboard"
                            className="px-3 py-2 text-sm font-medium rounded-md hover:bg-accent transition-colors"
                            onClick={() => setMobileMenuOpen(false)}
                          >
                            Dashboard
                          </Link>
                        )}
                        <Link
                          href="/my-bounties"
                          className="px-3 py-2 text-sm font-medium rounded-md hover:bg-accent transition-colors"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          My Bounties
                        </Link>
                        {isAdmin && (
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

                      {isAdmin && (
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
      {isAdmin && currentUser && (
        <WalletTopupModal open={topupOpen} onOpenChange={setTopupOpen} />
      )}
    </>
  );
}
