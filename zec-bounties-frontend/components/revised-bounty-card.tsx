"use client";

import { Clock } from "lucide-react";
import type { Bounty } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  bountyCreatorName,
  bountyCreatorInitial,
  bountyCreatorAvatarSrc,
} from "@/lib/displayName";
import { BountyRepoMark } from "@/components/repo-filter";
import { ZecIcon, ZCASH_YELLOW } from "@/components/zec-icon";
import { formatDistanceToNowStrict, isPast } from "date-fns";

const difficultyColors: Record<string, string> = {
  EASY: "text-green-500 border-green-500/30 bg-green-500/10",
  MEDIUM: "text-yellow-500 border-yellow-500/30 bg-yellow-500/10",
  HARD: "text-red-500 border-red-500/30 bg-red-500/10",
};

function isNewBounty(dateCreated: Date | string) {
  return (Date.now() - new Date(dateCreated).getTime()) / 3_600_000 <= 24;
}

export function RevisedBountyCard({
  bounty,
  onClick,
}: {
  bounty: Bounty;
  onClick?: () => void;
}) {
  const dueDate = bounty.timeToComplete
    ? new Date(bounty.timeToComplete)
    : null;
  const hasDue = !!dueDate && !isNaN(dueDate.getTime());
  const overdue = hasDue && isPast(dueDate!);
  const dueSoon =
    hasDue && !overdue && dueDate!.getTime() - Date.now() <= 3 * 86_400_000;
  const dueText = hasDue
    ? overdue
      ? "Overdue"
      : `Due in ${formatDistanceToNowStrict(dueDate!)}`
    : null;

  const amount = bounty.bountyAmount;
  const creator = bountyCreatorName(bounty);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className="group relative flex w-full cursor-pointer items-center gap-3 sm:gap-4 rounded-xl border bg-card px-3 py-3 sm:px-4 sm:py-4 text-left transition hover:border-[#F4B728]/60 hover:bg-muted/40 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F4B728]"
    >
      {isNewBounty(bounty.dateCreated) && (
        <span className="absolute -top-2 -right-2 z-10 rounded-full border-2 border-background bg-red-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">
          NEW
        </span>
      )}

      {/* Creator / team logo */}
      <Avatar className="h-12 w-12 sm:h-14 sm:w-14 shrink-0 rounded-lg border">
        <AvatarImage
          src={bountyCreatorAvatarSrc(bounty) || "/placeholder-user.jpg"}
          className="object-cover"
        />
        <AvatarFallback
          className="rounded-lg text-lg font-bold text-neutral-900"
          style={{ backgroundColor: `${ZCASH_YELLOW}40` }}
        >
          {bountyCreatorInitial(bounty)}
        </AvatarFallback>
      </Avatar>

      {/* Title + meta */}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm sm:text-base font-semibold leading-tight">
          {bounty.title}
        </h3>
        <p className="mt-0.5 truncate text-xs sm:text-sm text-muted-foreground">
          {creator}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge
            variant="secondary"
            className="h-5 text-[10px] uppercase tracking-wide"
          >
            {bounty.categoryId}
          </Badge>
          <BountyRepoMark bounty={bounty} />
          {bounty.difficulty && (
            <Badge
              variant="outline"
              className={`h-5 text-[10px] uppercase tracking-wide ${
                difficultyColors[bounty.difficulty] ?? ""
              }`}
            >
              {bounty.difficulty}
            </Badge>
          )}
          {dueText && (
            <span
              className={`inline-flex items-center gap-1 text-xs ${
                overdue
                  ? "text-red-500"
                  : dueSoon
                    ? "text-yellow-500"
                    : "text-muted-foreground"
              }`}
            >
              <Clock className="h-3 w-3" />
              {dueText}
            </span>
          )}
        </div>
      </div>

      {/* Reward */}
      <div className="flex shrink-0 items-center gap-1.5 text-sm sm:text-lg font-bold">
        <ZecIcon className="h-5 w-5 sm:h-6 sm:w-6" />
        {amount}
      </div>
    </div>
  );
}
