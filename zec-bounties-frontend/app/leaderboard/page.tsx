"use client";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/layout/navbar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Trophy, Target, Zap, Lock } from "lucide-react";
import { BadgeIcons } from "@/components/badges/badge-icons";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useBounty } from "@/lib/bounty-context";

type TimeRange = "all" | "30d" | "90d";

export default function AdminLeaderboardPage() {
  const { currentUser, leaderboard, leaderboardLoading, fetchLeaderboard } =
    useBounty();
  const [timeRange, setTimeRange] = useState<TimeRange>("all");

  useEffect(() => {
    fetchLeaderboard({ timeRange, chain: "MAIN", limit: 25 });
  }, [timeRange]);

  const isMe = (entry: (typeof leaderboard)[number]) =>
    currentUser?.id === entry.id;

  const myEntry = leaderboard.find(isMe);

  // `zec` is the raw ZEC amount; alternates with USD when a price is available.
  const formatEarned = (zec: number) =>
    `${zec.toLocaleString(undefined, { maximumFractionDigits: 4 })} ZEC`;

  const displayNameFor = (entry: (typeof leaderboard)[number]) =>
    entry.nickname || entry.name;

  // First 4 characters (Array.from keeps emoji/surrogate pairs intact).
  const shortName = (name: string) =>
    Array.from(name).length > 4
      ? `${Array.from(name).slice(0, 4).join("")}…`
      : name;

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-background text-foreground">
        <Navbar />
        <div className="imd:container mx-auto px-4 py-8 max-w-5xl">
          <div className="mb-12 text-center">
            <Badge
              variant="outline"
              className="mb-4 border-primary/20 text-primary"
            >
              Hall of Fame
            </Badge>
            <h1 className="text-4xl font-extrabold tracking-tight mb-2">
              Global Leaderboard
            </h1>
            <p className="text-muted-foreground">
              The world's top contributors solving the hardest challenges.
            </p>

            <div className="flex items-center justify-center gap-2 mt-6">
              {(["all", "30d", "90d"] as TimeRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    timeRange === range
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-muted text-muted-foreground hover:bg-muted/30"
                  }`}
                >
                  {range === "all"
                    ? "All Time"
                    : range === "30d"
                      ? "Last 30 Days"
                      : "Last 90 Days"}
                </button>
              ))}
            </div>

            {myEntry ? (
              <p className="mt-4 text-sm text-muted-foreground">
                You're ranked{" "}
                <span className="font-bold text-primary">#{myEntry.rank}</span>{" "}
                <span className="hidden md:inline">
                  {" "}
                  with {myEntry.points.toLocaleString()} pts
                </span>
              </p>
            ) : currentUser ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Complete a bounty to appear on the leaderboard.
              </p>
            ) : null}
          </div>

          {leaderboardLoading ? (
            <Card className="bg-card/50">
              <CardContent className="py-12 text-center text-muted-foreground">
                Loading leaderboard…
              </CardContent>
            </Card>
          ) : leaderboard.length === 0 ? (
            <Card className="bg-card/50">
              <CardContent className="py-12 text-center text-muted-foreground">
                No completed bounties yet — the leaderboard will populate as
                work gets approved.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                {leaderboard.slice(0, 3).map((entry) => {
                  const mine = isMe(entry);
                  return (
                    <Card
                      key={entry.id}
                      className={`relative overflow-hidden ${
                        entry.rank === 1
                          ? "border-primary ring-1 ring-primary/20 shadow-xl shadow-primary/10"
                          : ""
                      } ${mine ? "ring-2 ring-primary" : ""}`}
                    >
                      {entry.rank === 1 && (
                        <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-bl-lg">
                          Top Hunter
                        </div>
                      )}
                      {mine && (
                        <div className="absolute top-0 left-0 bg-primary text-primary-foreground px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-br-lg">
                          You
                        </div>
                      )}
                      <CardContent className="pt-8 text-center">
                        <div className="relative inline-block mb-4">
                          <Avatar
                            className={`h-20 w-20 border-4 ${
                              entry.rank === 1
                                ? "border-primary"
                                : "border-muted"
                            } ${!mine ? "blur-sm" : ""}`}
                          >
                            <AvatarImage
                              src={entry.avatar || "/placeholder.svg"}
                            />
                            <AvatarFallback>{"None"}</AvatarFallback>
                          </Avatar>
                          <div
                            className={`absolute -bottom-2 -right-2 h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm ${
                              entry.rank === 1
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            #{entry.rank}
                          </div>
                        </div>
                        <h3
                          className={`text-lg font-bold mb-1 ${
                            !mine ? "blur-sm select-none" : ""
                          }`}
                        >
                          {(() => {
                            const full = mine
                              ? displayNameFor(entry)
                              : "Hidden Hunter";
                            return (
                              <>
                                <span className="md:hidden">
                                  {shortName(full)}
                                </span>
                                <span className="hidden md:inline">{full}</span>
                              </>
                            );
                          })()}
                        </h3>
                        <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground mb-4">
                          <Target className="h-3 w-3" />
                          <span>{entry.completed} Bounties</span>
                        </div>
                        <div className="flex items-center justify-center gap-1.5 mb-4">
                          <BadgeIcons
                            completed={entry.completed}
                            badges={entry.badges}
                            role={entry.role}
                          />
                        </div>
                        <div className="text-2xl font-black text-primary">
                          {formatEarned(entry.earned)}
                        </div>
                        <p className="text-[10px] uppercase tracking-tighter text-muted-foreground">
                          Total Earnings
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <Card className="bg-card/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-primary" /> Active Standings
                  </CardTitle>
                  <CardDescription className="flex items-center gap-1 flex-wrap">
                    Rankings based on total earnings and bounties completed
                    <span className="inline-flex items-center gap-1 ml-2 text-xs">
                      <Lock className="h-3 w-3" /> Other hunters' identities are
                      private
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {leaderboard.map((entry) => {
                      const mine = isMe(entry);
                      return (
                        <div
                          key={entry.id}
                          className={`flex items-center p-4 transition-colors gap-4 ${
                            mine
                              ? "bg-primary/5 hover:bg-primary/10"
                              : "hover:bg-muted/30"
                          }`}
                        >
                          <div className="w-8 text-center font-mono font-bold text-muted-foreground">
                            #{entry.rank}
                          </div>
                          <Avatar
                            className={`h-10 w-10 border ${!mine ? "blur-sm" : ""}`}
                          >
                            <AvatarImage
                              src={entry.avatar || "/placeholder.svg"}
                            />
                            <AvatarFallback>{"None"}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p
                              className={`font-bold leading-none flex items-center gap-2 ${
                                !mine ? "blur-sm select-none" : ""
                              }`}
                            >
                              {(() => {
                                const full = mine
                                  ? displayNameFor(entry)
                                  : "Hidden Hunter";
                                return (
                                  <>
                                    <span className="md:hidden">
                                      {shortName(full)}
                                    </span>
                                    <span className="hidden md:inline">
                                      {full}
                                    </span>
                                  </>
                                );
                              })()}
                              {mine && (
                                <Badge
                                  className="text-[10px]"
                                  variant="outline"
                                >
                                  You
                                </Badge>
                              )}
                            </p>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <span className="hidden md:flex items-center gap-1">
                                <BadgeIcons
                                  completed={entry.completed}
                                  badges={entry.badges}
                                  role={entry.role}
                                />
                              </span>
                              <span className="flex items-center gap-1">
                                <Target className="h-3 w-3" /> {entry.completed}{" "}
                                Completed
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-bold tabular-nums">
                              {formatEarned(entry.earned)}
                            </p>
                            <p className="text-[10px] text-muted-foreground font-mono">
                              TOTAL EARNED
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}
