// app/teams/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useBounty } from "@/lib/bounty-context";
import type { Team } from "@/lib/types";
import { TeamNavbar } from "@/components/layout/teams/navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  ArrowRight,
  Loader2,
  Plus,
  Users,
  Zap,
  Wallet,
  Building2,
} from "lucide-react";
import { backendUrl } from "@/lib/configENV";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function roleBadgeClass(role: string) {
  if (role === "OWNER") return "text-primary border-primary/30 bg-primary/10";
  if (role === "ADMIN") return "text-foreground border-border bg-muted/40";
  return "text-muted-foreground border-border bg-transparent";
}

// Same palette/hash idea as TeamBanner — gives each card a distinct,
// stable accent strip until real banner images exist.
const GRADIENT_PRESETS = [
  "from-primary/60 via-primary/20 to-transparent",
  "from-chart-2/60 via-chart-2/20 to-transparent",
  "from-chart-4/60 via-chart-4/20 to-transparent",
  "from-chart-5/60 via-chart-5/20 to-transparent",
  "from-chart-3/60 via-chart-3/20 to-transparent",
] as const;

function gradientFor(teamId: string) {
  const hash = teamId.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return GRADIENT_PRESETS[hash % GRADIENT_PRESETS.length];
}

export function getUserRole(
  team: Team,
  userId: string,
  isGlobalAdmin: boolean,
): string {
  const member = team.members.find((m) => m.userId === userId);
  if (member) return member.role;
  return isGlobalAdmin ? "ADMIN" : "MEMBER";
}

export default function TeamsPage() {
  const { currentUser, teams, teamsLoading, fetchTeams, bounties } =
    useBounty();
  const router = useRouter();
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (currentUser) fetchTeams();
  }, [currentUser?.id]);

  const stats = useMemo(() => {
    const totalMembers = teams.reduce((sum, t) => sum + t.members.length, 0);
    const totalActive = bounties.filter(
      (b) =>
        !!b.teamId && (b.status === "IN_PROGRESS" || b.status === "IN_REVIEW"),
    ).length;
    const withWallet = teams.filter((t) => !!t.wallet).length;
    return { totalMembers, totalActive, withWallet };
  }, [teams, bounties]);

  if (!currentUser) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <TeamNavbar
          isTeam
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
        <div className="xl:container xl:mx-auto px-4 py-16 text-center">
          <p className="text-muted-foreground">Log in to view your teams.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <TeamNavbar searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      <div className="xl:container xl:mx-auto px-4 py-8">
        <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <span className="block text-xs font-semibold uppercase tracking-widest text-primary">
              Team console
            </span>
            <h1 className="text-4xl font-extrabold tracking-tight">
              Your teams
            </h1>
            <p className="max-w-md text-muted-foreground text-lg imd:hidden">
              Manage bounty programs.
            </p>
            <p className="max-w-md text-muted-foreground text-lg hidden imd:block">
              Manage bounty programs, members, and shared wallets for every
              community you belong to.
            </p>
          </div>
          <Button
            className="rounded-full shrink-0 shadow-lg shadow-primary/20"
            onClick={() => setShowCreatePanel(true)}
          >
            <Plus className="mr-2 h-4 w-4" /> New team
          </Button>
        </div>

        {teams.length > 0 && (
          <div className="mb-10 grid grid-cols-2 gap-3 imd:grid-cols-4">
            <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Building2 className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Teams</div>
                <div className="text-lg font-bold">{teams.length}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chart-2/10 text-chart-2">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  Total members
                </div>
                <div className="text-lg font-bold">{stats.totalMembers}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chart-4/10 text-chart-4">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  Active bounties
                </div>
                <div className="text-lg font-bold">{stats.totalActive}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chart-5/10 text-chart-5">
                <Wallet className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  Wallets set up
                </div>
                <div className="text-lg font-bold">{stats.withWallet}</div>
              </div>
            </div>
          </div>
        )}

        {teamsLoading && teams.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Loading teams...</p>
          </div>
        ) : teams.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-muted/20 px-8 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Building2 className="h-6 w-6" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">
              No teams yet
            </span>
            <p className="max-w-sm text-sm text-muted-foreground">
              Create a team to start posting bounties and pooling a shared
              wallet with your community.
            </p>
            <Button className="mt-2" onClick={() => setShowCreatePanel(true)}>
              Create your first team
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 imd:grid-cols-4">
            {teams.map((team) => {
              const teamBounties = bounties.filter((b) => b.teamId === team.id);
              const activeBounties = teamBounties.filter(
                (b) => b.status === "IN_PROGRESS" || b.status === "IN_REVIEW",
              ).length;
              const role = getUserRole(team, currentUser.id, false);

              return (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => router.push(`/teams/${team.id}`)}
                  className="group flex flex-col overflow-hidden rounded-xl border bg-card text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                >
                  <div
                    className={`h-16 shrink-0 bg-gradient-to-br ${gradientFor(team.id)}`}
                  />

                  <div className="flex flex-1 flex-col gap-4 p-6 pt-0">
                    <div className="-mt-8 flex items-end justify-between gap-3">
                      <Avatar className="h-16 w-16 border-4 border-card shrink-0 shadow-sm">
                        {team.logo && (
                          <AvatarImage
                            src={team.logo}
                            alt={`${team.name} logo`}
                          />
                        )}
                        <AvatarFallback className="text-base font-semibold">
                          {initials(team.name)}
                        </AvatarFallback>
                      </Avatar>
                      <Badge
                        variant="outline"
                        className={`mb-1 shrink-0 ${roleBadgeClass(role)}`}
                      >
                        {role}
                      </Badge>
                    </div>

                    <div>
                      <span className="text-lg font-semibold">{team.name}</span>
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {team.description || "No description yet."}
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-3 border-t pt-4 text-xs">
                      <div>
                        <div className="text-muted-foreground">Members</div>
                        <div className="mt-1 text-sm font-medium">
                          {team.members.length}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Active</div>
                        <div className="mt-1 text-sm font-medium">
                          {activeBounties}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Wallet</div>
                        <div className="mt-1 text-sm font-medium">
                          {team.wallet ? "Set up" : "Not set up"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-sm font-medium text-primary">
                      <span>Open console</span>
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <CreateTeamPanel
        open={showCreatePanel}
        onOpenChange={setShowCreatePanel}
      />
    </main>
  );
}

function CreateTeamPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { createTeam } = useBounty();
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [twitterUrl, setTwitterUrl] = useState("");
  const [discordUrl, setDiscordUrl] = useState("");
  const [additionalLinks, setAdditionalLinks] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setName("");
      setDescription("");
      setTwitterUrl("");
      setDiscordUrl("");
      setAdditionalLinks([""]);
      setError(null);
    }
  };

  const updateLink = (index: number, value: string) => {
    setAdditionalLinks((prev) => prev.map((l, i) => (i === index ? value : l)));
  };

  const addLinkField = () => setAdditionalLinks((prev) => [...prev, ""]);

  const removeLinkField = (index: number) =>
    setAdditionalLinks((prev) => prev.filter((_, i) => i !== index));

  const handleCreate = async () => {
    if (!name.trim()) return;
    if (!twitterUrl.trim() || !discordUrl.trim()) {
      setError("Twitter and Discord links are required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const team = await createTeam({
        name: name.trim(),
        description: description.trim() || undefined,
        twitterUrl: twitterUrl.trim(),
        discordUrl: discordUrl.trim(),
        additionalLinks: additionalLinks.map((l) => l.trim()).filter(Boolean),
      });
      handleClose(false);
      router.push(`/teams/${team.id}`); // jump straight into the new team's console
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create team");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New team</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="team-name" className="text-xs">
              Team name
            </Label>
            <input
              id="team-name"
              type="text"
              placeholder="e.g. Orchard Collective"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-description" className="text-xs">
              Description
            </Label>
            <textarea
              id="team-description"
              placeholder="What does this team work on?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="team-twitter" className="text-xs">
              Twitter / X link <span className="text-red-500">*</span>
            </Label>
            <input
              id="team-twitter"
              type="url"
              placeholder="https://x.com/yourteam"
              value={twitterUrl}
              onChange={(e) => setTwitterUrl(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="team-discord" className="text-xs">
              Discord link <span className="text-red-500">*</span>
            </Label>
            <input
              id="team-discord"
              type="url"
              placeholder="https://discord.gg/yourteam"
              value={discordUrl}
              onChange={(e) => setDiscordUrl(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Additional links</Label>
              <button
                type="button"
                onClick={addLinkField}
                className="text-xs font-medium text-primary hover:underline"
              >
                Add link
              </button>
            </div>
            {additionalLinks.map((link, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://..."
                  value={link}
                  onChange={(e) => updateLink(i, e.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary"
                />
                {additionalLinks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLinkField(i)}
                    className="shrink-0 px-2 text-sm text-muted-foreground hover:text-red-500"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="mt-2 flex justify-end gap-3">
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || submitting}>
            {submitting ? "Creating..." : "Create team"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
