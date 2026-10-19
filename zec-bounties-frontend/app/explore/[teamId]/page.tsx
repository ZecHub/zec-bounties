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
  Globe,
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

type SocialLink = {
  url: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  hover: string;
};

const XIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden
  >
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817-5.966 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
  </svg>
);

const DiscordIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden
  >
    <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.1.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
  </svg>
);

const GithubIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden
  >
    <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
  </svg>
);

const TelegramIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden
  >
    <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42Z" />
  </svg>
);

function normalizeUrl(raw: string): string {
  const v = raw.trim();
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function describeLink(raw: string): SocialLink | null {
  let u: URL;
  try {
    u = new URL(normalizeUrl(raw));
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  const first = u.pathname.split("/").filter(Boolean)[0];

  if (host === "x.com" || host === "twitter.com") {
    return {
      url: u.toString(),
      label: first ? `@${first}` : "X",
      Icon: XIcon,
      hover: "hover:border-foreground/40 hover:text-foreground",
    };
  }
  if (host === "discord.gg" || host.endsWith("discord.com")) {
    return {
      url: u.toString(),
      label: "Discord",
      Icon: DiscordIcon,
      hover: "hover:border-[#5865F2]/50 hover:text-[#5865F2]",
    };
  }
  if (host === "github.com") {
    return {
      url: u.toString(),
      label: first ? `GitHub · ${first}` : "GitHub",
      Icon: GithubIcon,
      hover: "hover:border-foreground/40 hover:text-foreground",
    };
  }
  if (host === "t.me" || host === "telegram.me") {
    return {
      url: u.toString(),
      label: "Telegram",
      Icon: TelegramIcon,
      hover: "hover:border-[#229ED9]/50 hover:text-[#229ED9]",
    };
  }
  return {
    url: u.toString(),
    label: host,
    Icon: Globe,
    hover: "hover:border-primary/40 hover:text-primary",
  };
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
  const links: SocialLink[] = team
    ? Array.from(
        new Map(
          [team.twitterUrl, team.discordUrl, ...team.additionalLinks]
            .filter((l): l is string => Boolean(l?.trim()))
            .map(describeLink)
            .filter((l): l is SocialLink => l !== null)
            .map((l) => [l.url.replace(/\/$/, ""), l] as const),
        ).values(),
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
                <div className="mt-5 flex flex-wrap gap-2">
                  {links.map(({ url, label, Icon, hover }) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex h-9 max-w-full items-center gap-2 rounded-full border bg-muted/30 px-3.5 text-sm font-medium text-muted-foreground transition-colors ${hover}`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{label}</span>
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
