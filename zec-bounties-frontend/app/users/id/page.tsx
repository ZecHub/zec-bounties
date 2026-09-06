"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useBounty } from "@/lib/bounty-context";
import { backendUrl } from "@/lib/configENV";
import { ProfileChain, PublicUserProfile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Lock,
  Github,
  ArrowLeft,
  TreeDeciduous,
  Leaf,
  Ban,
  AlertTriangle,
  Settings,
} from "lucide-react";
import { BadgeIcons } from "@/components/badges/badge-icons";
import { cn, fmt } from "@/lib/utils";

function AddressTypeIcons({
  addressType,
  hasUnified,
  hasShielded,
}: {
  addressType?: string;
  hasUnified?: boolean;
  hasShielded?: boolean;
}) {
  const n = (addressType || "").toLowerCase();
  const ironwood =
    n.includes("ironwood") ||
    n.includes("orchard") ||
    n.includes("ua") ||
    hasUnified;
  const sapling = n.includes("sapling") || (hasShielded && !hasUnified);
  const transparent = n.includes("transparent");
  const none = !ironwood && !sapling && !transparent && n === "none";

  if (none || (!ironwood && !sapling && !transparent && !addressType)) {
    return (
      <span
        title="No address on file"
        className="inline-flex items-center gap-1 text-red-500"
      >
        <Ban className="w-4 h-4" />
        <span className="text-sm">None</span>
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {transparent && (
        <span title="Transparent" className="text-yellow-400">
          <AlertTriangle className="w-4 h-4" />
        </span>
      )}
      {(sapling || n.includes("sapling")) && (
        <span title="Sapling" className="text-emerald-400">
          <Leaf className="w-4 h-4" />
        </span>
      )}
      {ironwood && (
        <span
          title="Ironwood"
          className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-zinc-700 border border-zinc-400"
        >
          <TreeDeciduous className="w-3.5 h-3.5 text-zinc-200" />
        </span>
      )}
    </div>
  );
}

function PrivatePlaceholder({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Lock className="w-3.5 h-3.5 shrink-0" />
      <span>{label} is private</span>
    </div>
  );
}

export default function PublicUserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { currentUser } = useBounty();
  const idOrNickname = String(params.id || "");

  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chain, setChain] = useState<ProfileChain>("MAIN");

  useEffect(() => {
    if (!idOrNickname) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem("authToken");
        const headers: HeadersInit = {};
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch(
          `${backendUrl}/api/users/${encodeURIComponent(idOrNickname)}/public`,
          { headers },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Profile not found");
        }
        const data = await res.json();
        if (!cancelled) setProfile(data);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [idOrNickname]);

  const v = profile?.visibility;
  const isOwn =
    profile?.isOwner ||
    (currentUser && profile && currentUser.id === profile.id);

  const chainStats = profile?.statsByChain?.[chain];
  const completed = chainStats?.completed ?? profile?.completed ?? 0;
  const created = chainStats?.created ?? profile?.created ?? 0;
  const totalEarned = chainStats?.totalEarned ?? profile?.totalEarned ?? 0;
  const completionRate =
    chainStats?.completionRate ?? profile?.completionRate ?? null;
  const recentCompleted =
    chainStats?.recentCompleted ?? profile?.recentCompleted ?? [];
  const recentCreated =
    chainStats?.recentCreated ?? profile?.recentCreated ?? [];
  const badgeCompleted =
    (profile?.statsByChain?.MAIN?.completed ?? profile?.completed ?? 0) +
    (profile?.statsByChain?.TEST?.completed ?? 0);

  const roleLabel =
    profile?.role === "HUNTER"
      ? "Hunter"
      : profile?.role === "TEAM"
        ? "Team"
        : profile?.role === "ADMIN"
          ? "Admin"
          : profile?.role === "CLIENT"
            ? "Client"
            : profile?.role;

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              className="gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            {isOwn && (
              <Button variant="outline" size="sm" asChild className="gap-1.5">
                <Link href="/profile">
                  <Settings className="w-4 h-4" />
                  Privacy settings
                </Link>
              </Button>
            )}
          </div>

          {loading && (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && !loading && (
            <Card>
              <CardContent className="py-10 text-center space-y-3">
                <p className="text-muted-foreground">{error}</p>
                <Button variant="outline" onClick={() => router.push("/kpis")}>
                  Back to KPIs
                </Button>
              </CardContent>
            </Card>
          )}

          {profile && !loading && (
            <>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col sm:flex-row gap-5 items-start">
                    {v?.showAvatar !== false && profile.avatar !== undefined ? (
                      <Avatar className="w-20 h-20 border border-border">
                        <AvatarImage src={profile.avatar || undefined} />
                        <AvatarFallback className="text-xl">
                          {(profile.displayName || "?")[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                        <Lock className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0 space-y-2">
                      <h1 className="text-2xl font-bold tracking-tight truncate">
                        {profile.displayName || "Anonymous contributor"}
                      </h1>

                      <div className="flex flex-wrap items-center gap-2">
                        {v?.showRole && profile.role && (
                          <Badge variant="secondary">{roleLabel}</Badge>
                        )}
                        {profile.teams &&
                          profile.teams.length > 0 &&
                          profile.teams.map((team) => (
                            <Link
                              key={team.id}
                              href={`/teams/${team.id}`}
                              className="inline-flex items-center gap-1.5"
                            >
                              <Badge variant="outline" className="gap-1.5">
                                {team.logo ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={team.logo}
                                    alt=""
                                    className="h-3.5 w-3.5 rounded-sm object-cover"
                                  />
                                ) : null}
                                {team.name}
                                <span className="text-[10px] text-muted-foreground">
                                  {team.memberRole}
                                </span>
                              </Badge>
                            </Link>
                          ))}
                      </div>

                      {v?.showMemberSince && profile.memberSince && (
                        <p className="text-sm text-muted-foreground">
                          Member since{" "}
                          {new Date(profile.memberSince).toLocaleDateString(
                            undefined,
                            { year: "numeric", month: "short" },
                          )}
                        </p>
                      )}

                      {v?.showGithub && profile.githubId && (
                        <a
                          href={`https://github.com/${profile.githubId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                        >
                          <Github className="w-4 h-4" />
                          GitHub
                        </a>
                      )}

                      {v?.showBadges && profile.badges ? (
                        <div className="pt-1">
                          <BadgeIcons
                            completed={badgeCompleted}
                            badges={profile.badges}
                            role={profile.role}
                          />
                        </div>
                      ) : (
                        !v?.showBadges && <PrivatePlaceholder label="Badges" />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">About</CardTitle>
                </CardHeader>
                <CardContent>
                  {v?.showBio ? (
                    profile.bio ? (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {profile.bio}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">
                        No bio yet.
                      </p>
                    )
                  ) : (
                    <PrivatePlaceholder label="Bio" />
                  )}
                </CardContent>
              </Card>

              <div className="flex items-center justify-end">
                <div className="inline-flex rounded-md border p-0.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={chain === "MAIN" ? "default" : "ghost"}
                    className="h-7 px-3 text-xs"
                    onClick={() => setChain("MAIN")}
                  >
                    Mainnet
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={chain === "TEST" ? "default" : "ghost"}
                    className="h-7 px-3 text-xs"
                    onClick={() => setChain("TEST")}
                  >
                    Testnet
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground mb-1">
                      Completed
                    </p>
                    {v?.showCompleted ? (
                      <p className="text-2xl font-bold tabular-nums">
                        {completed}
                      </p>
                    ) : (
                      <PrivatePlaceholder label="Completed" />
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground mb-1">
                      Created
                    </p>
                    {v?.showCreated ? (
                      <p className="text-2xl font-bold tabular-nums">
                        {created}
                      </p>
                    ) : (
                      <PrivatePlaceholder label="Created" />
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground mb-1">Earned</p>
                    {v?.showEarnings ? (
                      <p className="text-2xl font-bold tabular-nums">
                        {fmt(totalEarned)} ZEC
                      </p>
                    ) : (
                      <PrivatePlaceholder label="Earnings" />
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground mb-1">
                      Completion
                    </p>
                    {v?.showCompletionRate ? (
                      <p className="text-2xl font-bold tabular-nums">
                        {completionRate != null ? `${completionRate}%` : "—"}
                      </p>
                    ) : (
                      <PrivatePlaceholder label="Rate" />
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Address type</CardTitle>
                </CardHeader>
                <CardContent>
                  {v?.showAddressType ? (
                    <AddressTypeIcons
                      addressType={profile.addressType}
                      hasUnified={profile.hasUnifiedAddress}
                      hasShielded={profile.hasShieldedAddress}
                    />
                  ) : (
                    <PrivatePlaceholder label="Address type" />
                  )}
                  <p className="text-xs text-muted-foreground mt-2">
                    Actual wallet addresses are never shown on public profiles.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Recent activity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {v?.showRecentBounties ? (
                    <>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          Recently completed
                        </p>
                        {recentCompleted.length > 0 ? (
                          <ul className="space-y-2">
                            {recentCompleted.map((b) => (
                              <li
                                key={b.id}
                                className="flex justify-between gap-3 text-sm border-b border-border/50 pb-2 last:border-0"
                              >
                                <span className="truncate">{b.title}</span>
                                <span className="tabular-nums text-muted-foreground shrink-0">
                                  {b.bountyAmount != null
                                    ? `${fmt(b.bountyAmount)} ZEC`
                                    : ""}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No completed bounties yet.
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          Recently created
                        </p>
                        {recentCreated.length > 0 ? (
                          <ul className="space-y-2">
                            {recentCreated.map((b) => (
                              <li
                                key={b.id}
                                className="flex justify-between gap-3 text-sm border-b border-border/50 pb-2 last:border-0"
                              >
                                <span className="truncate">{b.title}</span>
                                <span className="text-xs text-muted-foreground shrink-0">
                                  {b.status}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No created bounties yet.
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <PrivatePlaceholder label="Recent activity" />
                  )}
                </CardContent>
              </Card>

              {isOwn && (
                <Card className="border-dashed">
                  <CardContent className="py-4 text-sm text-muted-foreground">
                    This is how others see your profile. Hidden fields show as
                    private.{" "}
                    <Link
                      href="/profile"
                      className="text-primary hover:underline"
                    >
                      Manage visibility
                    </Link>
                    .
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}
