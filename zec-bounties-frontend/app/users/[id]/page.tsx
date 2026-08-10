"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useBounty } from "@/lib/bounty-context";
import { backendUrl } from "@/lib/configENV";
import { PublicUserProfile } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Users,
  Shield,
  Server,
  Pickaxe,
  BookOpen,
  Lock,
  Github,
  ArrowLeft,
  TreeDeciduous,
  Leaf,
  Ban,
  AlertTriangle,
  Settings,
} from "lucide-react";
import { cn, fmt } from "@/lib/utils";
import {
  initAddressDecoder,
  getAddressReceivers,
  isDecoderReady,
} from "@/lib/decodeAddress";

function BadgeIcons({
  completed = 0,
  badges = [],
  role,
}: {
  completed?: number;
  badges?: string[];
  role?: string;
}) {
  const list = Array.isArray(badges) ? badges : [];
  let badgeClass = "text-muted-foreground";
  const avatarOverride = list.find((b) => b.startsWith("avatar:"));
  if (avatarOverride === "avatar:red") badgeClass = "text-red-500";
  else if (avatarOverride === "avatar:blue") badgeClass = "text-blue-500";
  else if (avatarOverride === "avatar:purple") badgeClass = "text-purple-500";
  else if (avatarOverride === "avatar:gold") badgeClass = "text-yellow-500";
  else if (avatarOverride === "avatar:pink") badgeClass = "text-pink-500";
  else if (completed >= 60) badgeClass = "text-pink-500";
  else if (completed >= 20) badgeClass = "text-yellow-500";
  else if (completed >= 10) badgeClass = "text-purple-500";
  else if (completed >= 5) badgeClass = "text-blue-500";
  else if (completed >= 1) badgeClass = "text-red-500";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span title="Member">
        <Users className={cn("w-5 h-5", badgeClass)} />
      </span>
      {(role === "ADMIN" || list.includes("admin")) && (
        <span title="Admin" className="text-purple-500">
          <Shield className="w-5 h-5" />
        </span>
      )}
      {list.includes("dao-member") && (
        <span title="DAO Member">
          <img src="/ZecHubBlue.png" alt="ZecHub" className="w-5 h-5" />
        </span>
      )}
      {list.includes("node-runner") && (
        <span title="Node Runner" className="text-blue-500">
          <Server className="w-5 h-5" />
        </span>
      )}
      {list.includes("miner") && (
        <span title="Miner" className="text-orange-500">
          <Pickaxe className="w-5 h-5" />
        </span>
      )}
      {list.includes("researcher") && (
        <span title="Researcher" className="text-emerald-500">
          <BookOpen className="w-5 h-5" />
        </span>
      )}
    </div>
  );
}

function AddressTypeIcons({
  receivers,
}: {
  receivers?: {
    ironwood?: boolean;
    sapling?: boolean;
    transparent?: boolean;
  };
}) {
  if (
    !receivers ||
    (!receivers.ironwood && !receivers.sapling && !receivers.transparent)
  ) {
    return (
      <div className="flex items-center justify-center gap-2 text-red-500">
        <Ban className="w-6 h-6" />
        <span className="text-sm">None</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-3">
      {receivers.transparent && (
        <div
          title="Transparent"
          className="flex items-center justify-center w-9 h-9 text-yellow-400"
        >
          <AlertTriangle className="w-9 h-9" />
        </div>
      )}
      {receivers.sapling && (
        <div
          title="Sapling"
          className="flex items-center justify-center w-9 h-9 text-emerald-400"
        >
          <Leaf className="w-9 h-9" />
        </div>
      )}
      {receivers.ironwood && (
        <div
          title="Ironwood"
          className="flex items-center justify-center w-9 h-9 rounded-full bg-zinc-700 border-2 border-zinc-300"
        >
          <TreeDeciduous className="w-9 h-9 text-zinc-200" />
        </div>
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
  const idOrNickname = String(params?.id ?? "");

  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receivers, setReceivers] = useState<{
    ironwood?: boolean;
    sapling?: boolean;
    transparent?: boolean;
  } | null>(null);

  // Load profile when user id/nickname changes
  useEffect(() => {
    if (!idOrNickname) return;

    let cancelled = false;

    setProfile(null);
    setReceivers(null);
    setError(null);
    setLoading(true);

    const load = async () => {
      try {
        const token = localStorage.getItem("authToken");
        const headers: HeadersInit = {};
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch(
          `${backendUrl}/api/users/${encodeURIComponent(idOrNickname)}/public`,
          { headers, cache: "no-store" },
        );

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Profile not found");
        }

        const data = await res.json();
        if (!cancelled) setProfile(data);
      } catch (e: any) {
        if (!cancelled) {
          setProfile(null);
          setError(e.message || "Failed to load profile");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [idOrNickname]);

  // Decode UA → receivers whenever profile changes (same as KPI dashboard)
  useEffect(() => {
    let cancelled = false;
    setReceivers(null);

    if (!profile?.visibility?.showAddressType) return;

    const addr =
      (profile as any).UA_address ||
      (profile as any).z_address ||
      null;

    if (!addr) {
      setReceivers({ ironwood: false, sapling: false, transparent: false });
      return;
    }

    (async () => {
      try {
        await initAddressDecoder();
        if (cancelled || !isDecoderReady()) return;

        const r = getAddressReceivers(addr) as any;
        if (cancelled) return;

        setReceivers({
          ironwood: !!(r.ironwood || r.orchard),
          sapling: !!r.sapling,
          transparent: !!r.transparent,
        });
      } catch (err) {
        console.error("Address decode failed:", err);
        if (!cancelled) {
          setReceivers({ ironwood: false, sapling: false, transparent: false });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile?.id, profile?.visibility?.showAddressType]);

  const v = profile?.visibility;
  const isOwn =
    !!profile?.isOwner ||
    !!(currentUser && profile && currentUser.id === profile.id);

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-background">
        <Navbar />
        <div
          key={idOrNickname}
          className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6"
        >
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

                      {v?.showRole && profile.role && (
                        <Badge variant="secondary">{profile.role}</Badge>
                      )}

                      {v?.showMemberSince && profile.memberSince && (
                        <p className="text-sm text-muted-foreground">
                          Member since{" "}
                          {new Date(profile.memberSince).toLocaleDateString(
                            undefined,
                            { year: "numeric", month: "short" },
                          )}
                        </p>
                      )}

                      {v?.showGithub && (profile.githubUsername || profile.nickname) && (
                        <a
                          href={`https://github.com/${profile.githubUsername}`}
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
                            completed={profile.completed}
                            badges={profile.badges}
                            role={profile.role}
                          />
                        </div>
                      ) : (
                        !v?.showBadges && (
                          <PrivatePlaceholder label="Badges" />
                        )
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

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground mb-1">
                      Completed
                    </p>
                    {v?.showCompleted ? (
                      <p className="text-2xl font-bold tabular-nums">
                        {profile.completed ?? 0}
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
                        {profile.created ?? 0}
                      </p>
                    ) : (
                      <PrivatePlaceholder label="Created" />
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground mb-1">
                      Earned
                    </p>
                    {v?.showEarnings ? (
                      <p className="text-2xl font-bold tabular-nums">
                        {fmt(profile.totalEarned ?? 0)} ZEC
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
                        {profile.completionRate != null
                          ? `${profile.completionRate}%`
                          : "—"}
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
                      receivers={
                        receivers ?? {
                          ironwood: false,
                          sapling: false,
                          transparent: false,
                        }
                      }
                    />
                  ) : (
                    <PrivatePlaceholder label="Address type" />
                  )}
                  <p className="text-xs text-muted-foreground mt-3 text-center">
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
                        {profile.recentCompleted &&
                        profile.recentCompleted.length > 0 ? (
                          <ul className="space-y-2">
                            {profile.recentCompleted.map((b) => (
                              <li
                                key={b.id}
                                className="flex justify-between gap-3 text-sm border-b border-border/50 pb-2 last:border-0"
                              >
                                <span className="truncate">{b.title}</span>
                                <span className="tabular-nums text-muted-foreground shrink-0">
                                  {fmt(b.bountyAmount)} ZEC
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
                        {profile.recentCreated &&
                        profile.recentCreated.length > 0 ? (
                          <ul className="space-y-2">
                            {profile.recentCreated.map((b) => (
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
