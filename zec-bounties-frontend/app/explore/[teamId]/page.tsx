"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Star,
  Users,
  Loader2,
  Calendar,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import { useBounty } from "@/lib/bounty-context";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { backendUrl } from "@/lib/configENV";
import { MobileNavShell } from "@/components/layout/mobile-nav-shell";

type TeamOverview = {
  id: string;
  name: string;
  description: string | null;
  logo: string | null;
  banner: string | null;
  twitterUrl: string | null;
  discordUrl: string | null;
  additionalLinks: string[];
  isVerified: boolean;
  createdAt: string | null;
  memberCount: number;
  communityCount: number;
  donationAddress: string | null;
};

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function linkLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function DonationCard({
  teamName,
  address,
}: {
  teamName: string;
  address: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the address is still selectable below.
    }
  };

  return (
    <div className="border-t px-4 py-5 md:px-8 md:py-6">
      <h2 className="mb-1 text-lg font-bold">Support {teamName}</h2>
      <p className="mb-5 text-sm text-muted-foreground">
        Scan the code or copy the address to send ZEC to this team.
      </p>

      <div className="flex flex-col items-stretch gap-5 md:flex-row md:items-center md:gap-6">
        {/* White tile keeps the code scannable in dark mode. */}
        <div className="shrink-0 self-center rounded-lg border bg-white p-3 md:self-auto">
          <QRCodeSVG
            value={address}
            size={168}
            level="M"
            bgColor="#ffffff"
            fgColor="#000000"
            title={`${teamName} donation address`}
          />
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              Unified address
            </div>
            <code className="block max-h-28 overflow-y-auto break-all rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">
              {address}
            </code>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={copy}
            className="w-full md:w-auto"
          >
            {copied ? (
              <>
                <Check className="mr-1.5 h-4 w-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="mr-1.5 h-4 w-4" />
                Copy address
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TeamOverviewContent() {
  const router = useRouter();
  const params = useParams<{ teamId: string }>();
  const teamId = params?.teamId;

  const { favoriteTeamIds, toggleFavoriteTeam } = useBounty();

  const [team, setTeam] = useState<TeamOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) return;
    const controller = new AbortController();

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${backendUrl}/api/teams/${teamId}/overview`, {
          signal: controller.signal,
        });
        if (res.status === 404) {
          setTeam(null);
          return;
        }
        if (!res.ok) throw new Error("Failed to load team");
        setTeam(await res.json());
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError("Couldn't load this team. Try again in a moment.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [teamId]);

  const isFavorited = team ? favoriteTeamIds.has(team.id) : false;
  const createdAt = team?.createdAt ? new Date(team.createdAt) : null;
  // Dedupe: the same URL can appear in more than one field.
  const links = team
    ? Array.from(
        new Set(
          [team.twitterUrl, team.discordUrl, ...team.additionalLinks]
            .map((l) => l?.trim())
            .filter((l): l is string => Boolean(l)),
        ),
      )
    : [];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navbar />

      <div className="xl:container xl:mx-auto px-4 py-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/explore")}
          className="mb-4 -ml-2 text-muted-foreground"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to explore
        </Button>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading team...</p>
          </div>
        ) : error ? (
          <div className="rounded-xl border bg-muted/20 py-20 text-center">
            <p className="text-muted-foreground">{error}</p>
          </div>
        ) : !team ? (
          <div className="rounded-xl border bg-muted/20 py-20 text-center">
            <p className="font-medium">Team not found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              It may have been removed, or the link is incorrect.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-6"
              onClick={() => router.push("/explore")}
            >
              Browse all teams
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            {/* Banner */}
            <div className="relative h-32 w-full bg-gradient-to-br from-primary/25 via-primary/10 to-muted md:h-56 lg:h-64">
              {team.banner && (
                <img
                  src={team.banner}
                  alt={`${team.name} banner`}
                  className="h-full w-full object-cover"
                />
              )}
            </div>

            {/* Header */}
            <div className="px-4 pb-5 md:px-8 md:pb-6">
              <div className="-mt-10 flex items-end justify-between gap-3 md:-mt-14">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-card bg-muted text-xl font-semibold text-muted-foreground shadow-sm md:h-28 md:w-28 md:text-2xl z-50">
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

                <Button
                  variant={isFavorited ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleFavoriteTeam(team.id)}
                  aria-pressed={isFavorited}
                >
                  <Star
                    className={`mr-1.5 h-4 w-4 ${
                      isFavorited ? "fill-current" : ""
                    }`}
                  />
                  {isFavorited ? "Favorited" : "Favorite"}
                </Button>
              </div>

              <div className="mt-4 space-y-3">
                <h1 className="break-words text-2xl font-extrabold tracking-tight md:text-4xl">
                  {team.name}
                </h1>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="gap-1.5">
                    <Users className="h-3 w-3" />
                    {team.memberCount}{" "}
                    {team.memberCount === 1 ? "member" : "members"}
                  </Badge>
                  <Badge variant="secondary" className="gap-1.5">
                    <Star className="h-3 w-3" />
                    {team.communityCount}{" "}
                    {team.communityCount === 1 ? "favorite" : "favorites"}
                  </Badge>
                  {createdAt && !Number.isNaN(createdAt.getTime()) && (
                    <Badge variant="secondary" className="gap-1.5">
                      <Calendar className="h-3 w-3" />
                      Created{" "}
                      {createdAt.toLocaleDateString(undefined, {
                        month: "short",
                        year: "numeric",
                      })}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Overview */}
            <div className="border-t px-4 py-5 md:px-8 md:py-6">
              <h2 className="mb-2 text-lg font-bold">Overview</h2>
              <p className="max-w-3xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {team.description ||
                  "This team hasn't added a description yet."}
              </p>

              {links.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {links.map((url, i) => (
                    <a
                      key={`${i}-${url}`}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border px-3 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                    >
                      <span className="truncate">{linkLabel(url)}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Donations — only when the team has a UA address */}
            {team.donationAddress && (
              <DonationCard
                teamName={team.name}
                address={team.donationAddress}
              />
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function TeamOverviewPage() {
  return (
    <ProtectedRoute blockAdmin blockTeam>
      <MobileNavShell>
        <TeamOverviewContent />
      </MobileNavShell>
    </ProtectedRoute>
  );
}
