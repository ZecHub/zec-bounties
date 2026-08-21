// app/explore/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, Search, Users, ArrowRight, Loader2 } from "lucide-react";
import { useBounty } from "@/lib/bounty-context";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { backendUrl } from "@/lib/configENV";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

type FavFilter = "all" | "favorites";

function ExploreContent() {
  const router = useRouter();
  const {
    communities,
    communitiesLoading,
    fetchCommunities,
    favoriteTeamIds,
    favoriteTeamsLoading,
    toggleFavoriteTeam,
  } = useBounty();

  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FavFilter>("all");

  useEffect(() => {
    fetchCommunities();
  }, []);

  const filteredTeams = useMemo(() => {
    let list = communities;

    if (filter === "favorites") {
      list = list.filter((c) => favoriteTeamIds.has(c.id));
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q),
      );
    }

    return [...list].sort((a, b) => {
      const aFav = favoriteTeamIds.has(a.id);
      const bFav = favoriteTeamIds.has(b.id);
      if (aFav !== bFav) return aFav ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [communities, searchQuery, filter, favoriteTeamIds]);

  const favoritedCount = communities.filter((c) =>
    favoriteTeamIds.has(c.id),
  ).length;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navbar searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      <div className="xl:container xl:mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="space-y-2">
            <h1 className="text-4xl font-extrabold tracking-tight">
              Explore teams
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl">
              Browse every team on the platform and star the ones you want to
              keep an eye on.
            </p>
          </div>
        </div>

        <div className="space-y-6 min-w-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 h-9 text-sm transition ${
                filter === "all"
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "border-border text-muted-foreground hover:text-primary hover:border-primary/40"
              }`}
            >
              All teams
              <Badge
                variant="secondary"
                className="text-[10px] h-4 px-1.5 leading-none"
              >
                {communities.length}
              </Badge>
            </button>
            <button
              type="button"
              onClick={() => setFilter("favorites")}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 h-9 text-sm transition ${
                filter === "favorites"
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "border-border text-muted-foreground hover:text-primary hover:border-primary/40"
              }`}
            >
              <Star className="h-3.5 w-3.5" />
              Favorites
              <Badge
                variant="secondary"
                className="text-[10px] h-4 px-1.5 leading-none"
              >
                {favoritedCount}
              </Badge>
            </button>
          </div>

          <div className="flex items-center justify-between pb-4 border-b">
            <h2 className="text-xl font-bold">
              {filter === "favorites" ? "Your favorite teams" : "All teams"}
            </h2>
            <div className="relative w-64 hidden sm:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search teams…"
                className="h-9 w-full rounded-full border border-border bg-transparent pl-9 pr-3 text-sm outline-none focus:border-primary/40"
              />
            </div>
          </div>

          {(communitiesLoading && communities.length === 0) ||
          (filter === "favorites" && favoriteTeamsLoading) ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Loading teams...</p>
            </div>
          ) : filteredTeams.length === 0 ? (
            <div className="text-center py-20 border rounded-xl bg-muted/20">
              <p className="text-muted-foreground">
                {filter === "favorites"
                  ? "You haven't favorited any teams yet."
                  : searchQuery
                    ? `No teams found matching "${searchQuery}".`
                    : "No teams have been created yet."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTeams.map((team) => {
                const isFavorited = favoriteTeamIds.has(team.id);
                return (
                  <div
                    key={team.id}
                    className="group flex flex-col justify-between gap-4 rounded-xl border bg-card p-4 transition hover:shadow-md hover:border-primary/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => router.push(`/teams/${team.id}`)}
                        className="flex min-w-0 items-center gap-3 text-left"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-xs font-semibold text-muted-foreground">
                          {team.logo ? (
                            <img
                              src={team.logo}
                              alt={`${team.name} logo`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            initials(team.name)
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-semibold">
                            {team.name}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="h-3 w-3" />
                            {team.memberCount}{" "}
                            {team.memberCount === 1 ? "member" : "members"}
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleFavoriteTeam(team.id)}
                        aria-label={
                          isFavorited
                            ? "Remove from favorites"
                            : "Add to favorites"
                        }
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-primary"
                      >
                        <Star
                          className={`h-4 w-4 ${
                            isFavorited ? "fill-primary text-primary" : ""
                          }`}
                        />
                      </button>
                    </div>

                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {team.description || "No description yet."}
                    </p>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/teams/${team.id}`)}
                      className="h-8 w-fit px-2 text-xs opacity-0 transition group-hover:opacity-100"
                    >
                      View team <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function ExplorePage() {
  return (
    <ProtectedRoute blockAdmin blockTeam>
      <ExploreContent />
    </ProtectedRoute>
  );
}
