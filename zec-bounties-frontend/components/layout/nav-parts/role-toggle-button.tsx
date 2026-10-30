"use client";

import {
  Check,
  ChevronDown,
  Loader2,
  ShieldCheck,
  Target,
  User,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBounty } from "@/lib/bounty-context";

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin", icon: ShieldCheck, redirect: "/admin" },
  { value: "CLIENT", label: "Client", icon: User, redirect: "/home" },
  { value: "HUNTER", label: "Hunter", icon: Target, redirect: "/home" },
  { value: "TEAM", label: "Team", icon: Users, redirect: "/home" },
] as const;

export function RoleToggleButton({ compact = false }: { compact?: boolean }) {
  const { currentUser, switchRole, isSwitchingRole } = useBounty();
  const router = useRouter();
  if (!currentUser?.isRobin) return null;

  const current = ROLE_OPTIONS.find((r) => r.value === currentUser.role);
  const CurrentIcon = current?.icon ?? ShieldCheck;

  const handleSelect = async (role: (typeof ROLE_OPTIONS)[number]) => {
    if (role.value === currentUser.role || isSwitchingRole) return;
    await switchRole(role.value);
    router.push(role.redirect);
  };

  const items = ROLE_OPTIONS.map((role) => {
    const Icon = role.icon;
    const isActive = role.value === currentUser.role;
    return (
      <DropdownMenuItem
        key={role.value}
        className="gap-2"
        onClick={() => handleSelect(role)}
        disabled={isActive}
      >
        <Icon className="h-4 w-4" />
        {role.label}
        {isActive && <Check className="h-3.5 w-3.5 ml-auto" />}
      </DropdownMenuItem>
    );
  });

  if (compact) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="gap-2 justify-start"
            disabled={isSwitchingRole}
          >
            {isSwitchingRole ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CurrentIcon className="h-4 w-4" />
            )}
            {isSwitchingRole
              ? "Switching..."
              : `Role: ${current?.label ?? currentUser.role}`}
            <ChevronDown className="h-3.5 w-3.5 ml-auto opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>Switch role</DropdownMenuLabel>
          {items}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs font-medium border-dashed"
              disabled={isSwitchingRole}
            >
              {isSwitchingRole ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CurrentIcon className="h-3.5 w-3.5" />
              )}
              <span className="hidden 2xl:inline">
                {isSwitchingRole ? "..." : (current?.label ?? currentUser.role)}
              </span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Switch role</DropdownMenuLabel>
            {items}
          </DropdownMenuContent>
        </DropdownMenu>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        Switch role
      </TooltipContent>
    </Tooltip>
  );
}
