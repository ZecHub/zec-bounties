"use client";

import { useState, useEffect, useCallback } from "react";
import type { ElementType, ReactNode } from "react";
import { AdminNavbar } from "@/components/layout/admin/navbar";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useRoleGuard } from "@/hooks/use-role-guard";
import { useBounty } from "@/lib/bounty-context";
import { backendUrl } from "@/lib/configENV";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Users,
  Plus,
  MoreHorizontal,
  Trash2,
  UserPlus,
  UserMinus,
  Wallet,
  Shield,
  ShieldCheck,
  Crown,
  User,
  ChevronRight,
  Loader2,
  Building2,
  AlertTriangle,
  Check,
  X,
  Edit2,
  Copy,
  Eye,
  EyeOff,
  ArrowLeft,
  Link2,
  ExternalLink,
  Calendar,
} from "lucide-react";
import { RxDiscordLogo } from "react-icons/rx";
import { FaXTwitter } from "react-icons/fa6";
import type { Team } from "@/lib/types";
import { toast } from "sonner";
import { format } from "date-fns";
import { TeamBanner } from "@/components/teams/team-banner";
import { CreateTeamPanel } from "@/components/teams/create-team-panel";
import { QRCodeSVG } from "qrcode.react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  joinedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
}

interface TeamWallet {
  id: string;
  teamId: string;
  accountName: string;
  chain: string;
  serverUrl: string;
  address?: string;
  createdAt: string;
}

// ── API helpers ───────────────────────────────────────────────────────────────

function useTeamsApi() {
  const getHeaders = () => {
    const token = localStorage.getItem("authToken");
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const api = useCallback(
    async <T = any,>(path: string, options: RequestInit = {}): Promise<T> => {
      const res = await fetch(`${backendUrl}/api/teams${path}`, {
        ...options,
        headers: { ...getHeaders(), ...(options.headers || {}) },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      return data;
    },
    [],
  );

  return { api };
}

// ── Role badge ────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: TeamMember["role"] }) {
  const cfg = {
    OWNER: {
      icon: Crown,
      label: "Owner",
      class: "bg-amber-500/10 text-amber-600 border-amber-500/30",
    },
    ADMIN: {
      icon: Shield,
      label: "Admin",
      class: "bg-blue-500/10 text-blue-600 border-blue-500/30",
    },
    MEMBER: {
      icon: User,
      label: "Member",
      class: "bg-muted text-muted-foreground border-border",
    },
  }[role];

  const Icon = cfg.icon;
  return (
    <Badge
      variant="outline"
      className={`gap-1 text-[10px] font-medium ${cfg.class}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {cfg.label}
    </Badge>
  );
}

// ── Team links ────────────────────────────────────────────────────────────────

interface TeamLink {
  key: string;
  label: string;
  href: string;
  icon: ElementType;
}

// Only allow http(s) so a malicious "javascript:" URL can't end up in an href
const isSafeUrl = (url: string) => /^https?:\/\//i.test(url.trim());

function getTeamLinks(team: Team): TeamLink[] {
  const links: TeamLink[] = [];
  if (team.twitterUrl)
    links.push({
      key: "twitter",
      label: "X / Twitter",
      href: team.twitterUrl,
      icon: FaXTwitter,
    });
  if (team.discordUrl)
    links.push({
      key: "discord",
      label: "Discord",
      href: team.discordUrl,
      icon: RxDiscordLogo,
    });
  (team.additionalLinks ?? []).forEach((href, i) =>
    links.push({ key: `extra-${i}`, label: "Link", href, icon: Link2 }),
  );
  return links.filter((l) => isSafeUrl(l.href));
}

/** "https://www.x.com/acme/" -> "x.com/acme" */
function displayUrl(href: string) {
  try {
    const u = new URL(href);
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    const text = u.hostname.replace(/^www\./, "") + path;
    return text.length > 60 ? text.slice(0, 57) + "…" : text;
  } catch {
    return href.length > 60 ? href.slice(0, 57) + "…" : href;
  }
}

// ── Shared overview building blocks ───────────────────────────────────────────

function OverviewCard({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 overflow-hidden rounded-2xl border bg-card/50 ${className}`}
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      <div className="p-4 pt-3 sm:p-5 sm:pt-3">{children}</div>
    </section>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: ElementType;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card/50 px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-semibold capitalize">{value}</div>
      </div>
    </div>
  );
}

// ── Verification modal ────────────────────────────────────────────────────────

function TeamVerificationModal({
  open,
  onOpenChange,
  team,
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  team: Team;
  loading: boolean;
  onConfirm: () => void;
}) {
  const links = getTeamLinks(team);
  const [clicked, setClicked] = useState<Set<string>>(new Set());

  // Reset progress every time the modal closes
  useEffect(() => {
    if (!open) setClicked(new Set());
  }, [open]);

  const markClicked = (key: string) =>
    setClicked((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));

  const total = links.length;
  const done = links.filter((l) => clicked.has(l.key)).length;
  const allClicked = done === total; // true when there are no links too

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] flex-col gap-4 overflow-hidden rounded-xl p-4 sm:max-w-md md:p-6">
        <DialogHeader className="shrink-0 text-left sm:text-left">
          <DialogTitle className="flex min-w-0 items-center gap-2 text-base md:text-lg">
            <Shield className="h-5 w-5 shrink-0" />
            <span className="truncate">Verify {team.name}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Scrolls inside the modal when there are many links */}
        <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden">
          <p className="text-xs leading-relaxed text-muted-foreground md:text-sm">
            {total > 0
              ? "Open each of the team's links and make sure they look legitimate before verifying."
              : "This team has no social links. You can still verify it, but consider whether that's enough."}
          </p>

          {total > 0 && (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Links reviewed</span>
                  <span className="tabular-nums">
                    {done}/{total}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${(done / total) * 100}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {links.map(({ key, label, href, icon: Icon }) => {
                  const visited = clicked.has(key);
                  return (
                    <a
                      key={key}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => markClicked(key)}
                      onAuxClick={() => markClicked(key)} // middle-click
                      className={`group flex min-w-0 items-center gap-3 rounded-xl border px-3 py-3 text-sm transition-colors active:bg-muted/60 ${
                        visited
                          ? "border-green-500/30 bg-green-500/5"
                          : "hover:border-primary/40 hover:bg-muted/40"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          visited ? "text-green-600" : "text-muted-foreground"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium">{label}</div>
                        <div className="truncate text-[11px] text-muted-foreground md:text-xs">
                          {displayUrl(href)}
                        </div>
                      </div>
                      {visited ? (
                        <span className="flex shrink-0 items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600">
                          <Check className="h-2.5 w-2.5" />
                          <span className="hidden imd:inline">Visited</span>
                        </span>
                      ) : (
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 group-hover:text-primary" />
                      )}
                    </a>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Stacked + full-width on mobile, side by side from md up */}
        <DialogFooter className="shrink-0 flex-col-reverse gap-2 sm:flex-col-reverse md:flex-row md:justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="w-full md:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!allClicked || loading}
            className="w-full md:w-auto"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {allClicked ? "Verify team" : `Visit all (${done}/${total})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Verification control (lives in the header, next to the ⋯ menu) ────────────

function VerificationControl({ team }: { team: Team }) {
  const { teamVerifications, fetchTeamVerification, verifyTeam, unverifyTeam } =
    useBounty();
  const status = teamVerifications[team.id] ?? null;
  const [acting, setActing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!status) fetchTeamVerification(team.id).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.id]);

  if (!status) {
    return <div className="h-8 w-28 animate-pulse rounded-full bg-muted" />;
  }

  const handleUnverify = async () => {
    setActing(true);
    try {
      await unverifyTeam(team.id);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  };

  const handleConfirmVerify = async () => {
    setActing(true);
    try {
      await verifyTeam(team.id);
      setModalOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  };

  const verified = status.isVerified;

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Status pill */}
        <div
          title={
            verified
              ? "This team is verified"
              : `Needs ${status.requiredVerifications} admin sign-offs before it can post bounties`
          }
          className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${
            verified
              ? "border-green-500/30 bg-green-500/10 text-green-600"
              : "border-amber-500/30 bg-amber-500/10 text-amber-600"
          }`}
        >
          {verified ? (
            <ShieldCheck className="h-3.5 w-3.5" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5" />
          )}
          <span className="hidden md:inline">
            {verified ? "Verified" : "Unverified"}
          </span>
          <span className="tabular-nums opacity-70">
            {status.verificationCount}/{status.requiredVerifications}
          </span>
        </div>

        {/* Action */}
        <Button
          size="sm"
          variant={status.verifiedByMe ? "outline" : "default"}
          className="h-8 rounded-full px-3 text-xs"
          disabled={acting}
          onClick={
            status.verifiedByMe ? handleUnverify : () => setModalOpen(true)
          }
        >
          {acting && status.verifiedByMe && (
            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
          )}
          {status.verifiedByMe ? "Unverify" : "Verify"}
        </Button>
      </div>

      <TeamVerificationModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        team={team}
        loading={acting}
        onConfirm={handleConfirmVerify}
      />
    </>
  );
}

// ── Links card ────────────────────────────────────────────────────────────────

function LinksCard({ team }: { team: Team }) {
  const links = getTeamLinks(team);

  return (
    <OverviewCard title="Links">
      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This team hasn't added any links.
        </p>
      ) : (
        <ul className="-mx-2 min-w-0 space-y-0.5">
          {links.map(({ key, label, href, icon: Icon }) => (
            <li key={key} className="min-w-0">
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex min-w-0 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium">{label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {displayUrl(href)}
                  </span>
                </span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-primary" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </OverviewCard>
  );
}

// ── About card ────────────────────────────────────────────────────────────────

function AboutCard({ team, onEdit }: { team: Team; onEdit: () => void }) {
  return (
    <OverviewCard
      title="About"
      action={
        <Button
          variant="ghost"
          size="sm"
          className="-mr-2 h-7 gap-1 px-2 text-xs text-muted-foreground"
          onClick={onEdit}
        >
          <Edit2 className="h-3 w-3" /> Edit
        </Button>
      }
    >
      {team.description ? (
        <p className="whitespace-pre-line break-words text-sm leading-relaxed text-foreground/90">
          {team.description}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">No description yet.</p>
      )}
    </OverviewCard>
  );
}

// Cache keyed by team + wallet so switching teams is instant, and replacing
// a wallet naturally busts the cache.
const donationAddressCache = new Map<string, string | null>();

function useDonationAddress(teamId: string, walletId?: string) {
  const key = `${teamId}:${walletId ?? "none"}`;
  const [address, setAddress] = useState<string | null | undefined>(() =>
    donationAddressCache.get(key),
  );

  useEffect(() => {
    if (!walletId) return;
    if (donationAddressCache.has(key)) {
      setAddress(donationAddressCache.get(key));
      return;
    }
    setAddress(undefined);
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(`${backendUrl}/api/teams/${teamId}/overview`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Failed to load address");
        const data = await res.json();
        const addr: string | null = data.donationAddress ?? null;
        donationAddressCache.set(key, addr);
        setAddress(addr);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setAddress(null);
      }
    })();

    return () => controller.abort();
  }, [key, teamId, walletId]);

  return address; // undefined = loading, null = unavailable
}

// ── Wallet panel ──────────────────────────────────────────────────────────────

function WalletPanel({
  team,
  onAddWallet,
}: {
  team: Team;
  onAddWallet: () => void;
}) {
  const addr = useDonationAddress(team.id, team.wallet?.id);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Address copied");
    } catch {
      toast.error("Failed to copy");
    }
  };

  if (!team.wallet) {
    return (
      <OverviewCard title="Payout wallet">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
            <Wallet className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">No wallet connected</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Add a wallet so this team has a payout address.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={onAddWallet}
          >
            Add wallet
          </Button>
        </div>
      </OverviewCard>
    );
  }

  return (
    <OverviewCard
      title="Payout wallet"
      action={
        <Badge
          variant="outline"
          className="gap-1 border-green-500/30 bg-green-500/10 text-[10px] text-green-600"
        >
          <Check className="h-2.5 w-2.5" /> Connected
        </Badge>
      }
    >
      {/* Wallet identity */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Wallet className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            {team.wallet.accountName}
          </div>
          <div className="truncate text-xs capitalize text-muted-foreground">
            {team.wallet.chain}
          </div>
        </div>
      </div>

      {addr === undefined ? (
        <div className="flex animate-pulse flex-col items-center gap-4">
          <div className="h-[176px] w-[176px] rounded-xl bg-muted" />
          <div className="h-12 w-full rounded-lg bg-muted" />
        </div>
      ) : addr === null ? (
        <p className="text-sm text-muted-foreground">Address unavailable.</p>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5">
            <QRCodeSVG value={addr} size={176} level="M" />
          </div>
          <div className="w-full space-y-2">
            <code className="block max-h-24 overflow-y-auto break-all rounded-lg border bg-background/60 p-3 text-center font-mono text-[11px] leading-relaxed select-all">
              {addr}
            </code>
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-full gap-1.5 text-xs"
              onClick={() => copy(addr)}
            >
              <Copy className="h-3.5 w-3.5" /> Copy address
            </Button>
          </div>
        </div>
      )}
    </OverviewCard>
  );
}

// ── Overview tab body ─────────────────────────────────────────────────────────

function OverviewTab({
  team,
  onEdit,
  onAddWallet,
}: {
  team: Team;
  onEdit: () => void;
  onAddWallet: () => void;
}) {
  const adminCount = team.members.filter((m) =>
    ["OWNER", "ADMIN"].includes(m.role),
  ).length;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Users} label="Members" value={team.members.length} />
        <StatTile icon={Shield} label="Admins" value={adminCount} />
        <StatTile
          icon={Wallet}
          label="Network"
          value={team.wallet ? team.wallet.chain : "No wallet"}
        />
        <StatTile
          icon={Calendar}
          label="Created"
          value={
            team.createdAt ? format(new Date(team.createdAt), "MMM yyyy") : "—"
          }
        />
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="min-w-0 space-y-4 lg:col-span-3">
          <AboutCard team={team} onEdit={onEdit} />
          <LinksCard team={team} />
        </div>
        <div className="min-w-0 lg:col-span-2">
          <WalletPanel team={team} onAddWallet={onAddWallet} />
        </div>
      </div>
    </div>
  );
}

// ── Create / Edit Team Modal ──────────────────────────────────────────────────

function TeamFormModal({
  open,
  onOpenChange,
  team,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  team?: Team | null;
  onSuccess: (team: Team) => void;
}) {
  const { api } = useTeamsApi();
  const [name, setName] = useState(team?.name || "");
  const [description, setDescription] = useState(team?.description || "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setName(team?.name || "");
      setDescription(team?.description || "");
    }
  }, [open, team]);

  const handleSubmit = async () => {
    if (!name.trim()) return toast.error("Team name is required");
    setLoading(true);
    try {
      let result: Team;
      if (team) {
        result = await api(`/${team.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
          }),
        });
      } else {
        result = await api("/", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
          }),
        });
      }
      toast.success(team ? "Team updated" : "Team created");
      onSuccess(result);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md rounded-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {team ? "Edit Team" : "Create New Team"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Team Name *</Label>
            <Input
              placeholder="e.g. Engineering"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              rows={3}
              placeholder="Optional description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="flex-1 sm:flex-none"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 sm:flex-none"
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {team ? "Save Changes" : "Create Team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Members Modal ─────────────────────────────────────────────────────────

function AddMembersModal({
  open,
  onOpenChange,
  team,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  team: Team;
  onSuccess: (members: TeamMember[]) => void;
}) {
  const { api } = useTeamsApi();
  const { users } = useBounty();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [role, setRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) {
      setSelectedIds([]);
      setSearch("");
      setRole("MEMBER");
    }
  }, [open]);

  const currentMemberIds = team.members.map((m) => m.userId);
  const available = users.filter(
    (u: any) =>
      !currentMemberIds.includes(u.id) &&
      (u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())),
  );

  const toggle = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const handleAdd = async () => {
    if (selectedIds.length === 0)
      return toast.error("Select at least one user");
    setLoading(true);
    try {
      const { members } = await api<{ members: TeamMember[] }>(
        `/${team.id}/members`,
        {
          method: "POST",
          body: JSON.stringify({ userIds: selectedIds, role }),
        },
      );
      toast.success(`Added ${members.length} member(s)`);
      onSuccess(members);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg rounded-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add Members to {team.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
            />
            <Select value={role} onValueChange={(v) => setRole(v as any)}>
              <SelectTrigger className="w-full sm:w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBER">Member</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border rounded-lg divide-y max-h-56 sm:max-h-64 overflow-y-auto">
            {available.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {search
                  ? "No users match your search"
                  : "All users are already members"}
              </div>
            ) : (
              available.map((user: any) => {
                const selected = selectedIds.includes(user.id);
                return (
                  <button
                    key={user.id}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                      selected ? "bg-primary/5" : "hover:bg-muted/50"
                    }`}
                    onClick={() => toggle(user.id)}
                  >
                    <div
                      className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        selected ? "bg-primary border-primary" : "border-border"
                      }`}
                    >
                      {selected && (
                        <Check className="h-2.5 w-2.5 text-primary-foreground" />
                      )}
                    </div>
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarImage src={user.avatar} />
                      <AvatarFallback className="text-[10px]">
                        {user.name?.[0] ?? "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {user.name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {user.email}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {selectedIds.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {selectedIds.length} user{selectedIds.length > 1 ? "s" : ""}{" "}
              selected
            </p>
          )}
        </div>

        <DialogFooter className="flex-row gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="flex-1 sm:flex-none"
          >
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={loading || selectedIds.length === 0}
            className="flex-1 sm:flex-none"
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add {selectedIds.length > 0 ? `(${selectedIds.length})` : "Members"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Team Wallet Modal ─────────────────────────────────────────────────────────

function TeamWalletModal({
  open,
  onOpenChange,
  team,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  team: Team;
  onSuccess: (wallet: TeamWallet) => void;
}) {
  const { api } = useTeamsApi();
  const [tab, setTab] = useState<"new" | "import">("new");
  const [accountName, setAccountName] = useState("");
  const [chain, setChain] = useState("mainnet");
  const [serverUrl, setServerUrl] = useState("https://zec.rocks:443");
  const [seedPhrase, setSeedPhrase] = useState("");
  const [birthdayHeight, setBirthdayHeight] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSeed, setShowSeed] = useState(false);

  useEffect(() => {
    if (!open) {
      setTab("new");
      setAccountName("");
      setChain("mainnet");
      setServerUrl("https://zec.rocks:443");
      setSeedPhrase("");
      setBirthdayHeight("");
      setShowSeed(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!accountName.trim()) return toast.error("Account name is required");
    if (tab === "import" && !seedPhrase.trim())
      return toast.error("Seed phrase is required");

    setLoading(true);
    try {
      const endpoint =
        tab === "import" ? `/${team.id}/wallet/import` : `/${team.id}/wallet`;
      const body: any = { accountName: accountName.trim(), chain, serverUrl };
      if (tab === "import") {
        body.seedPhrase = seedPhrase.trim();
        if (birthdayHeight) body.birthdayHeight = parseInt(birthdayHeight);
      }

      const { wallet } = await api<{ wallet: TeamWallet }>(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      });

      toast.success(
        tab === "import" ? "Wallet imported successfully" : "Wallet created",
      );
      onSuccess(wallet);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg rounded-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            {team.wallet ? "Replace" : "Add"} Team Wallet for {team.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Tab switcher */}
          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            {(["new", "import"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  tab === t
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "new" ? "New Wallet" : "Import Seed"}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Account Name *</Label>
              <Input
                placeholder="e.g. Team Main"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Chain</Label>
                <Select
                  value={chain}
                  onValueChange={(v) => {
                    setChain(v);
                    setServerUrl(
                      v === "mainnet"
                        ? "https://zec.rocks:443"
                        : "https://testnet.zec.rocks:443",
                    );
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mainnet">Mainnet</SelectItem>
                    <SelectItem value="testnet">Testnet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Server URL</Label>
                <Input
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="https://zec.rocks:443"
                />
              </div>
            </div>

            {tab === "import" && (
              <>
                <div className="space-y-1.5">
                  <Label>Seed Phrase (24 words) *</Label>
                  <div className="relative">
                    {!showSeed && seedPhrase && (
                      <div className="absolute inset-0 z-10 flex items-center px-3 py-2 pointer-events-none">
                        <span className="text-sm tracking-[0.3em] text-foreground select-none break-all leading-relaxed">
                          {"•".repeat(
                            seedPhrase.trim().split(/\s+/).filter(Boolean)
                              .length * 4,
                          )}
                        </span>
                      </div>
                    )}
                    <Textarea
                      rows={3}
                      placeholder={
                        showSeed ? "Enter your 24-word seed phrase..." : ""
                      }
                      value={seedPhrase}
                      onChange={(e) => setSeedPhrase(e.target.value)}
                      className={`font-mono text-sm resize-none pr-10 ${
                        !showSeed && seedPhrase
                          ? "text-transparent caret-foreground"
                          : ""
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSeed((v) => !v)}
                      className="absolute top-2 right-2 p-1 rounded text-muted-foreground hover:text-foreground transition-colors z-20"
                    >
                      {showSeed ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Your seed phrase is never stored.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Birthday Height (optional)</Label>
                  <Input
                    type="number"
                    placeholder="e.g. 1500000"
                    value={birthdayHeight}
                    onChange={(e) => setBirthdayHeight(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="flex-row gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="flex-1 sm:flex-none"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 sm:flex-none"
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {tab === "import" ? "Import Wallet" : "Create Wallet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Team Detail Panel ─────────────────────────────────────────────────────────

function TeamDetailPanel({
  team,
  onUpdate,
  onDelete,
  onBack,
}: {
  team: Team;
  onUpdate: (updated: Team) => void;
  onDelete: (id: string) => void;
  onBack?: () => void;
}) {
  const { api } = useTeamsApi();
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deletingMember, setDeletingMember] = useState<string | null>(null);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [tab, setTab] = useState<"overview" | "members">("overview");

  const handleRemoveMember = async (userId: string) => {
    setDeletingMember(userId);
    try {
      await api(`/${team.id}/members/${userId}`, { method: "DELETE" });
      onUpdate({
        ...team,
        members: team.members.filter((m) => m.userId !== userId),
      });
      toast.success("Member removed");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeletingMember(null);
    }
  };

  const handleRoleChange = async (userId: string, role: TeamMember["role"]) => {
    setUpdatingRole(userId);
    try {
      await api(`/${team.id}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      onUpdate({
        ...team,
        members: team.members.map((m) =>
          m.userId === userId ? { ...m, role } : m,
        ),
      });
      toast.success("Role updated");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUpdatingRole(null);
    }
  };

  const handleDeleteTeam = async () => {
    setDeleteLoading(true);
    try {
      await api(`/${team.id}`, { method: "DELETE" });
      toast.success("Team deleted");
      onDelete(team.id);
      setDeleteConfirmOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDeleteWallet = async () => {
    try {
      await api(`/${team.id}/wallet`, { method: "DELETE" });
      onUpdate({ ...team, wallet: null });
      toast.success("Wallet removed");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleWalletCreated = (wallet: TeamWallet) => {
    onUpdate({ ...team, wallet });
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Mobile-only back bar — sticky so it's always reachable */}
      {onBack && (
        <div className="sticky top-0 z-20 shrink-0 flex items-center justify-between gap-2 px-2 py-2 border-b bg-card/95 backdrop-blur md:hidden">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 -ml-1 text-sm font-medium"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />
            Teams
          </Button>
          <span className="text-xs text-muted-foreground truncate max-w-[50%]">
            {team.name}
          </span>
        </div>
      )}

      {/* Banner */}
      <div className="w-full h-fit">
        <TeamBanner
          teamId={team.id}
          bannerUrl={team.banner}
          canManage
          className="rounded-none"
        />
      </div>

      {/* Header */}
      <div className="px-4 pb-4 sm:px-6">
        <div className="-mt-10 flex items-end justify-between gap-3 md:-mt-14">
          <Avatar className="relative z-10 h-20 w-20 shrink-0 border-4 border-background shadow-sm md:h-28 md:w-28">
            {team.logo && (
              <AvatarImage
                src={team.logo}
                alt={team.name}
                className="object-cover"
              />
            )}
            <AvatarFallback className="bg-muted text-xl font-semibold text-muted-foreground md:text-2xl">
              {team.name
                .split(" ")
                .map((p) => p[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>

          {/* Verification + actions menu */}
          <div className="flex items-center gap-2 pb-1">
            <VerificationControl team={team} />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Team Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Edit2 className="h-4 w-4 mr-2" /> Edit Team
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAddMembersOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-2" /> Add Members
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setWalletOpen(true)}>
                  <Wallet className="h-4 w-4 mr-2" />
                  {team.wallet ? "Replace Wallet" : "Add Wallet"}
                </DropdownMenuItem>
                {team.wallet && (
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={handleDeleteWallet}
                  >
                    <X className="h-4 w-4 mr-2" /> Remove Wallet
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Delete Team
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mt-3 space-y-1">
          <h2 className="break-words text-xl font-extrabold tracking-tight md:text-3xl">
            {team.name}
          </h2>
          <p className="text-sm text-muted-foreground">
            {team.members.length}{" "}
            {team.members.length === 1 ? "member" : "members"}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 px-4 sm:px-6 border-b">
        {(
          [
            { id: "overview", label: "Overview" },
            { id: "members", label: `Members (${team.members.length})` },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <OverviewTab
          team={team}
          onEdit={() => setEditOpen(true)}
          onAddWallet={() => setWalletOpen(true)}
        />
      )}

      {/* Members list */}
      {tab === "members" && (
        <div>
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h3 className="text-sm font-semibold">
              Members ({team.members.length})
            </h3>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => setAddMembersOpen(true)}
            >
              <UserPlus className="h-3 w-3" /> Add
            </Button>
          </div>

          <div className="divide-y">
            {team.members.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No members yet
              </div>
            ) : (
              team.members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-2 sm:gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={member.user.avatar} />
                    <AvatarFallback className="text-xs">
                      {member.user.name?.[0] ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium truncate">
                        {member.user.name}
                      </span>
                      <RoleBadge role={member.role} />
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {member.user.email}
                    </div>
                  </div>

                  {member.role !== "OWNER" && (
                    <div className="flex items-center gap-1 shrink-0">
                      <div className="hidden sm:block">
                        <Select
                          value={member.role}
                          onValueChange={(v) =>
                            handleRoleChange(
                              member.userId,
                              v as TeamMember["role"],
                            )
                          }
                          disabled={updatingRole === member.userId}
                        >
                          <SelectTrigger className="h-7 w-24 text-xs">
                            {updatingRole === member.userId ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <SelectValue />
                            )}
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ADMIN">Admin</SelectItem>
                            <SelectItem value="MEMBER">Member</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleRemoveMember(member.userId)}
                        disabled={deletingMember === member.userId}
                      >
                        {deletingMember === member.userId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <UserMinus className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <TeamFormModal
        open={editOpen}
        onOpenChange={setEditOpen}
        team={team}
        onSuccess={onUpdate}
      />

      <AddMembersModal
        open={addMembersOpen}
        onOpenChange={setAddMembersOpen}
        team={team}
        onSuccess={(newMembers) =>
          onUpdate({
            ...team,
            members: [
              ...team.members.filter(
                (m) => !newMembers.find((nm) => nm.userId === m.userId),
              ),
              ...newMembers,
            ],
          })
        }
      />

      <TeamWalletModal
        open={walletOpen}
        onOpenChange={setWalletOpen}
        team={team}
        onSuccess={handleWalletCreated}
      />

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Team
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong>{team.name}</strong>? This
            will permanently remove all members and the team wallet. This cannot
            be undone.
          </p>
          <DialogFooter className="flex-row gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={deleteLoading}
              className="flex-1 sm:flex-none"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteTeam}
              disabled={deleteLoading}
              className="flex-1 sm:flex-none"
            >
              {deleteLoading && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Delete Team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminTeamsPage() {
  useRoleGuard("ADMIN");

  const { api } = useTeamsApi();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  const selectedTeam = teams.find((t) => t.id === selectedTeamId) || null;

  const filteredTeams = teams.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description?.toLowerCase().includes(search.toLowerCase()),
  );

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Team[]>("/");
      setTeams(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load teams");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const handleTeamCreated = (team: Team) => {
    setTeams((prev) => [team, ...prev]);
    setSelectedTeamId(team.id);
    setMobileView("detail");
  };

  const handleTeamUpdated = (updated: Team) => {
    setTeams((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const handleTeamDeleted = (id: string) => {
    setTeams((prev) => prev.filter((t) => t.id !== id));
    if (selectedTeamId === id) {
      setSelectedTeamId(null);
      setMobileView("list");
    }
  };

  const handleSelectTeam = (id: string) => {
    setSelectedTeamId(id);
    setMobileView("detail");
  };

  const handleBack = () => {
    setSelectedTeamId(null);
    setMobileView("list");
  };

  return (
    <ProtectedRoute requireAdmin>
      <main className="min-h-screen bg-background">
        <AdminNavbar isAdmin />

        <div className="flex h-[calc(100vh-3.5rem)]">
          {/* Sidebar: team list */}
          <aside
            className={`
              w-full md:w-80 md:shrink-0 border-r flex flex-col bg-card/30
              ${mobileView === "detail" ? "hidden md:flex" : "flex"}
            `}
          >
            <div className="p-4 border-b space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-base font-bold">Teams</h1>
                  <p className="text-xs text-muted-foreground">
                    {teams.length} team{teams.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" /> New
                </Button>
              </div>
              <Input
                placeholder="Search teams..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredTeams.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <Building2 className="h-8 w-8 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium">
                    {search ? "No teams match" : "No teams yet"}
                  </p>
                  {!search && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Create your first team to get started
                    </p>
                  )}
                </div>
              ) : (
                <div className="py-1">
                  {filteredTeams.map((team) => (
                    <button
                      key={team.id}
                      onClick={() => handleSelectTeam(team.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                        selectedTeamId === team.id
                          ? "bg-primary/8 border-r-2 border-primary"
                          : "hover:bg-muted/50 active:bg-muted/70"
                      }`}
                    >
                      <Avatar className="h-9 w-9 rounded-lg border shrink-0">
                        {team.logo && (
                          <AvatarImage
                            src={team.logo}
                            alt={team.name}
                            className="object-cover"
                          />
                        )}
                        <AvatarFallback className="rounded-lg bg-muted text-sm font-bold">
                          {team.name?.[0] ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {team.name}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            {team.members.length} member
                            {team.members.length !== 1 ? "s" : ""}
                          </span>
                          {!team.isVerified && (
                            <>
                              <span className="text-muted-foreground/40 text-xs">
                                ·
                              </span>
                              <span className="text-xs text-amber-600">
                                Unverified
                              </span>
                            </>
                          )}

                          {team.wallet && (
                            <>
                              <span className="text-muted-foreground/40 text-xs">
                                ·
                              </span>
                              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                <Wallet className="h-2.5 w-2.5" />
                                {team.wallet.chain}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          {/* Main: team detail */}
          <div
            className={`
              flex-1 overflow-hidden
              ${mobileView === "list" ? "hidden md:block" : "block"}
            `}
          >
            {selectedTeam ? (
              <TeamDetailPanel
                key={selectedTeam.id}
                team={selectedTeam}
                onUpdate={handleTeamUpdated}
                onDelete={handleTeamDeleted}
                onBack={handleBack}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center px-8">
                <div className="h-16 w-16 rounded-2xl bg-muted border flex items-center justify-center mb-4">
                  <Users className="h-8 w-8 text-muted-foreground/40" />
                </div>
                <h2 className="text-lg font-semibold">Select a team</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  Choose a team from the sidebar to view and manage its members
                  and wallet, or create a new one.
                </p>
                <Button
                  className="mt-4 gap-2"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="h-4 w-4" /> Create Team
                </Button>
              </div>
            )}
          </div>
        </div>

        <CreateTeamPanel
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSuccess={handleTeamCreated}
        />
      </main>
    </ProtectedRoute>
  );
}
