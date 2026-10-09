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
import { Loader2, Lock, Github, ArrowLeft, Settings } from "lucide-react";
import { RxDiscordLogo } from "react-icons/rx";
import { BadgeIcons } from "@/components/badges/badge-icons";
import {
  StaffBountyView,
  StaffViewCard,
} from "@/components/profile/staff-view-card";
import { UaReceiverIcons } from "@/components/address/ua-receiver-icons";
import { fmt } from "@/lib/utils";
import {
  initAddressDecoder,
  getAddressReceivers,
  isDecoderReady,
} from "@/lib/decodeAddress";

const ADMIN_FULL_VISIBILITY = {
  showAvatar: true,
  showDisplayName: true,
  showBio: true,
  showBadges: true,
  showCompleted: true,
  showCreated: true,
  showEarnings: true,
  showCompletionRate: true,
  showAddressType: true,
  showMemberSince: true,
  showRecentBounties: true,
  showRole: true,
  showGithub: true,
  showDiscord: true,
} as NonNullable<PublicUserProfile["visibility"]>;

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
  const [chain, setChain] = useState<ProfileChain>("MAIN");
  const [staffView, setStaffView] = useState<StaffBountyView | null>(null);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffOpenOffset, setStaffOpenOffset] = useState(0);
  const [staffHistoryOffset, setStaffHistoryOffset] = useState(0);
  const staffKey = `${idOrNickname}:${chain}`;
  const [staffKeySeen, setStaffKeySeen] = useState(staffKey);
  if (staffKeySeen !== staffKey) {
    setStaffKeySeen(staffKey);
    setStaffOpenOffset(0);
    setStaffHistoryOffset(0);
  }
  const isAdmin = currentUser?.role === "ADMIN";

  const isOwn =
    !!profile?.isOwner ||
    !!(currentUser && profile && currentUser.id === profile.id);

  const isAdminView = !!profile?.isAdminViewer && !isOwn;
  const v = isAdminView ? ADMIN_FULL_VISIBILITY : profile?.visibility;

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

  useEffect(() => {
    if (!isAdmin || !idOrNickname) {
      setStaffView(null);
      setStaffError(null);
      setStaffLoading(false);
      setStaffOpenOffset(0);
      setStaffHistoryOffset(0);
      return;
    }
    if (chain !== "MAIN" && chain !== "TEST") return;

    let cancelled = false;
    setStaffLoading(true);
    setStaffError(null);

    const load = async () => {
      try {
        const token = localStorage.getItem("authToken");
        if (!token) throw new Error("Admin session required");
        const params = new URLSearchParams({ chain });
        if (staffOpenOffset) params.set("openOffset", String(staffOpenOffset));
        if (staffHistoryOffset) params.set("historyOffset", String(staffHistoryOffset));
        const res = await fetch(
          `${backendUrl}/api/users/${encodeURIComponent(idOrNickname)}/staff-bounties?${params}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          },
        );
        if (res.status === 401 || res.status === 403) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Staff view is admin only");
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load staff view");
        }
        const data = (await res.json()) as StaffBountyView;
        if (!cancelled) {
          setStaffView((prev) => {
            const sameUser = prev?.userId === data.userId && prev?.chain === data.chain;
            if (!sameUser || (!staffOpenOffset && !staffHistoryOffset)) return data;
            return {
              ...data,
              open: staffOpenOffset ? [...prev.open, ...data.open] : data.open,
              history: staffHistoryOffset ? [...prev.history, ...data.history] : data.history,
            };
          });
        }
      } catch (e: any) {
        if (!cancelled) {
          setStaffView(null);
          setStaffError(e.message || "Failed to load staff view");
        }
      } finally {
        if (!cancelled) setStaffLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, idOrNickname, chain, staffOpenOffset, staffHistoryOffset]);

  const loadMoreStaff = (which: "open" | "history") => {
    if (!staffView) return;
    if (which === "open" && staffView.openNextOffset != null) {
      setStaffOpenOffset(staffView.openNextOffset);
    }
    if (which === "history" && staffView.historyNextOffset != null) {
      setStaffHistoryOffset(staffView.historyNextOffset);
    }
  };

  // Decode UA → receivers whenever profile changes (same as KPI dashboard)
  useEffect(() => {
    let cancelled = false;
    setReceivers(null);

    if (!v?.showAddressType) return;

    const addr =
      (profile as any).UA_address || (profile as any).z_address || null;

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
  }, [profile?.id, v?.showAddressType]);

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

                      <div className="flex flex-col imd:flex-row gap-4 items-baseline">
                        {v?.showGithub &&
                          (profile.githubUsername || profile.nickname) && (
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

                        {v?.showDiscord && profile.discord && (
                          <div className="space-y-0.5">
                            <a
                              href={`https://discord.com/users/${profile.discord.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                            >
                              <RxDiscordLogo className="w-4 h-4" />
                              {profile.discord.globalName ||
                                profile.discord.username ||
                                "Discord"}
                              {profile.discord.globalName &&
                                profile.discord.username && (
                                  <span className="text-muted-foreground">
                                    @{profile.discord.username}
                                  </span>
                                )}
                            </a>
                            {/* {isAdminView && profile.discord.connectedAt && (
                              <p className="text-xs text-muted-foreground">
                                Discord linked{" "}
                                {new Date(
                                  profile.discord.connectedAt,
                                ).toLocaleDateString(undefined, {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                })}
                              </p>
                            )} */}
                          </div>
                        )}
                      </div>
                      {isAdminView && profile?.discord?.connectedAt && (
                        <p className="text-xs text-muted-foreground">
                          Discord linked{" "}
                          {new Date(
                            profile.discord.connectedAt,
                          ).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
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
{isAdmin && (
                <StaffViewCard
                  chain={chain === "TEST" ? "TEST" : "MAIN"}
                  loading={staffLoading}
                  error={staffError}
                  data={staffView}
                  onLoadMoreOpen={() => loadMoreStaff("open")}
                  onLoadMoreHistory={() => loadMoreStaff("history")}
                />
              )}

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
              <div className="grid grid-cols-2 imd:grid-cols-4 gap-3">
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
                    <UaReceiverIcons
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
              {isAdminView && (
                <Card className="border-dashed">
                  <CardContent className="py-4 text-sm text-muted-foreground">
                    Admin view: fields this user has set to private are shown.
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
