"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Star, Users, Compass } from "lucide-react";
import { useBounty } from "@/lib/bounty-context";
import { backendUrl } from "@/lib/configENV";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

interface FavoriteTeamsSidebarProps {
  activeTeamId: string | null;
  onSelectTeam: (teamId: string | null) => void;
}

export function FavoriteTeamsSidebar({
  activeTeamId,
  onSelectTeam,
}: FavoriteTeamsSidebarProps) {
  const {
    communities,
    communitiesLoading,
    fetchCommunities,
    favoriteTeamIds,
    favoriteTeamsLoading,
  } = useBounty();

  useEffect(() => {
    // Homepage doesn't otherwise load communities — fetch on mount so we
    // have names/avatars to render for whatever's in favoriteTeamIds.
    fetchCommunities();
  }, []);

  const favoritedTeams = communities.filter((c) => favoriteTeamIds.has(c.id));
  const loading = communitiesLoading || favoriteTeamsLoading;

  return (
    <div className="imd:w-64">
      <div className="mb-4 flex items-center gap-2">
        <Star className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Favorite teams</h3>
      </div>

      {loading ? (
        <div className="space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-md bg-muted/50" />
          ))}
        </div>
      ) : favoritedTeams.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-center">
          <p className="text-xs text-muted-foreground">
            You haven't favorited any teams yet.
          </p>
          <Link
            href="/explore"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Compass className="h-3 w-3" /> Explore teams
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => onSelectTeam(null)}
            className={`flex items-center justify-start gap-2 rounded-md px-3 h-9 text-sm transition ${
              activeTeamId === null
                ? "bg-secondary font-bold text-primary"
                : "text-muted-foreground hover:text-primary hover:bg-muted/50"
            }`}
          >
            All bounties
          </button>

          {favoritedTeams.map((team) => (
            <button
              key={team.id}
              type="button"
              onClick={() =>
                onSelectTeam(activeTeamId === team.id ? null : team.id)
              }
              className={`flex items-center gap-2 rounded-md px-3 h-9 text-sm transition ${
                activeTeamId === team.id
                  ? "bg-secondary font-bold text-primary"
                  : "text-muted-foreground hover:text-primary hover:bg-muted/50"
              }`}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-xs font-semibold text-muted-foreground">
                {team.logo ? (
                  <img
                    src={`${backendUrl}${team.logo}`}
                    alt={`${team.name} logo`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initials(team.name)
                )}
              </div>
              <span className="truncate">{team.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
