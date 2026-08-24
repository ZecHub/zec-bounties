"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, PlusCircle, Users, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface BottomTabBarProps {
  onNewBounty: () => void;
  onOpenTeams?: () => void;
  teamsActive?: boolean;
}

const SIDE_TABS = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/my-bounties", label: "Bounties", icon: LayoutGrid },
] as const;

export function BottomTabBar({
  onNewBounty,
  onOpenTeams,
  teamsActive,
}: BottomTabBarProps) {
  const pathname = usePathname();
  const isHome = pathname === "/home";
  const isProfile = pathname === "/profile";

  return (
    <nav
      className="
        md:hidden fixed bottom-0 inset-x-0 z-50
        border-t border-border bg-background/95 backdrop-blur
        supports-[backdrop-filter]:bg-background/80
        pb-[env(safe-area-inset-bottom)]
      "
    >
      <div className="grid grid-cols-5 items-center h-14">
        {SIDE_TABS.map((tab) => {
          const active = pathname === tab.href;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 h-full text-[10px] sam:text-[11px] transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "fill-primary/10")} />
              {tab.label}
            </Link>
          );
        })}

        {/* Center elevated "New Bounty" action — disabled on Profile */}
        <div className="flex items-center justify-center h-full">
          <button
            type="button"
            onClick={isProfile ? undefined : onNewBounty}
            disabled={isProfile}
            aria-disabled={isProfile}
            aria-label="New bounty"
            title={isProfile ? "Not available on Profile" : "New bounty"}
            className={cn(
              "-mt-6 flex h-12 w-12 items-center justify-center rounded-full",
              "bg-primary text-primary-foreground shadow-lg shadow-primary/30",
              "active:scale-95 transition-transform",
              isProfile && "opacity-40 cursor-not-allowed active:scale-100",
            )}
          >
            <PlusCircle className="h-6 w-6" />
          </button>
        </div>

        {/* Teams — only interactive on Home, where the sheet + filter state live */}
        <button
          type="button"
          onClick={isHome ? onOpenTeams : undefined}
          disabled={!isHome}
          aria-disabled={!isHome}
          title={isHome ? "Favorite teams" : "Go to Home to filter by team"}
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 h-full text-[10px] sam:text-[11px] transition-colors",
            !isHome && "opacity-40 cursor-not-allowed",
            isHome && teamsActive
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Users
            className={cn(
              "h-5 w-5",
              isHome && teamsActive && "fill-primary/10",
            )}
          />
          Teams
        </button>

        <Link
          href="/profile"
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 h-full text-[10px] sam:text-[11px] transition-colors",
            pathname === "/profile"
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <User className="h-5 w-5" />
          Profile
        </Link>
      </div>
    </nav>
  );
}
