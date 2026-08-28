"use client";

import { useState, useEffect, useCallback } from "react";
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
  Crown,
  User,
  ChevronRight,
  Loader2,
  Building2,
  AlertTriangle,
  Check,
  X,
  Edit2,
  RefreshCw,
  Eye,
  EyeOff,
  ArrowLeft,
  XIcon,
  Link2,
  ExternalLink,
} from "lucide-react";
import { RxDiscordLogo } from "react-icons/rx";
import type { Balance, Team, TeamVerificationStatus } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { format } from "date-fns";
import { TeamBanner } from "@/components/teams/team-banner";

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

function SocialLinksCard({ team }: { team: Team }) {
  const hasAny =
    team.twitterUrl || team.discordUrl || team.additionalLinks?.length > 0;

  if (!hasAny) {
    return (
      <div className="p-3 sm:p-4 border-b">
        <p className="text-xs text-muted-foreground">
          No social links provided for this team.
        </p>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 border-b space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground mb-1">
        Social & links
      </h3>
      <div className="flex flex-col gap-1.5">
        {team.twitterUrl && (
          <a
            href={team.twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors group"
          >
            <XIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{team.twitterUrl}</span>
            <ExternalLink className="h-3 w-3 text-muted-foreground/50 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
        )}
        {team.discordUrl && (
          <a
            href={team.discordUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors group"
          >
            <RxDiscordLogo className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{team.discordUrl}</span>
            <ExternalLink className="h-3 w-3 text-muted-foreground/50 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
        )}
        {team.additionalLinks?.map((link, i) => (
          <a
            key={i}
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors group"
          >
            <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{link}</span>
            <ExternalLink className="h-3 w-3 text-muted-foreground/50 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
        ))}
      </div>
    </div>
  );
}

function VerificationCard({ team }: { team: Team }) {
  const { teamVerifications, fetchTeamVerification, verifyTeam, unverifyTeam } =
    useBounty();
  const status = teamVerifications[team.id] ?? null;
  const [loading, setLoading] = useState(!status);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!status) {
      setLoading(true);
      fetchTeamVerification(team.id).finally(() => setLoading(false));
    }
  }, [team.id]);

  const handleToggle = async () => {
    setActing(true);
    try {
      status?.verifiedByMe
        ? await unverifyTeam(team.id)
        : await verifyTeam(team.id);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  };

  if (loading || !status) {
    return (
      <div className="p-3 sm:p-4 border-b flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading verification...
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 border-b space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={
              status.isVerified
                ? "bg-green-500/10 text-green-600 border-green-500/30"
                : "bg-amber-500/10 text-amber-600 border-amber-500/30"
            }
          >
            {status.isVerified ? "Verified" : "Unverified"}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {status.verificationCount}/{status.requiredVerifications} admin
            sign-offs
          </span>
        </div>
        <Button
          size="sm"
          variant={status.verifiedByMe ? "outline" : "default"}
          className="h-7 text-xs"
          onClick={handleToggle}
          disabled={acting}
        >
          {acting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : status.verifiedByMe ? (
            "Remove my verification"
          ) : (
            "Verify team"
          )}
        </Button>
      </div>
      {!status.isVerified && (
        <p className="text-[11px] text-muted-foreground">
          This team can't post bounties until {status.requiredVerifications}{" "}
          admins verify it.
        </p>
      )}
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
                        {user.name[0]}
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

  const [balance, setBalance] = useState<Balance | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const confirmedTotal = (b: Balance) =>
    ((b.confirmed_ironwood_balance ?? b.confirmed_orchard_balance ?? 0) +
      (b.confirmed_sapling_balance ?? 0) +
      (b.confirmed_transparent_balance ?? 0)) /
    1e8;

  const fmt = (n: number) => n.toFixed(4);

  const fetchBalance = useCallback(async () => {
    if (!team.wallet) return;
    setBalanceLoading(true);
    setBalanceError(null);
    try {
      const data = await api<{ balance: any }>(`/${team.id}/wallet/balance`);
      setBalance(data.balance ?? null);
    } catch (err: any) {
      setBalanceError(err.message);
    } finally {
      setBalanceLoading(false);
    }
  }, [api, team.id, team.wallet]);

  useEffect(() => {
    if (team.wallet) {
      fetchBalance();
    } else {
      setBalance(null);
      setBalanceError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team.id, team.wallet?.id]);

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
      setBalance(null);
      toast.success("Wallet removed");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleWalletCreated = (wallet: TeamWallet) => {
    const updated = { ...team, wallet };
    onUpdate(updated);
    setTimeout(() => {
      setBalance(null);
      setBalanceError(null);
      fetchBalance();
    }, 1500);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Mobile-only back bar — sticky so it's always reachable */}
      {onBack && (
        <div className="sticky top-0 z-20 flex items-center justify-between gap-2 px-2 py-2 border-b bg-card/95 backdrop-blur md:hidden">
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
      <div className="flex items-start justify-between p-4 sm:p-6 border-b">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl border border-primary/20 shrink-0">
            {team.logo && (
              <AvatarImage
                src={team.logo}
                alt={team.name}
                className="object-cover"
              />
            )}
            <AvatarFallback className="rounded-xl bg-primary/10 text-lg sm:text-xl font-bold text-primary">
              {team.name[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-base sm:text-lg font-bold leading-tight">
              {team.name}
            </h2>
            {team.description && (
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 line-clamp-1">
                {team.description}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Created {format(new Date(team.createdAt), "MMM d, yyyy")}
            </p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
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

      {/* Stats strip */}
      <div className="grid grid-cols-3 divide-x border-b text-center">
        {[
          { label: "Members", value: team.members.length },
          {
            label: "Wallet",
            value: team.wallet ? team.wallet.chain : "None",
          },
          {
            label: "Admins",
            value: team.members.filter((m) =>
              ["OWNER", "ADMIN"].includes(m.role),
            ).length,
          },
        ].map((s) => (
          <div key={s.label} className="py-2.5 sm:py-3 px-2 sm:px-4">
            <div className="text-base sm:text-lg font-bold truncate">
              {s.value}
            </div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
      <SocialLinksCard team={team} />
      <VerificationCard team={team} />

      {/* Wallet card */}
      {team.wallet && (
        <div className="p-3 sm:p-4 border-b space-y-2">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
            <Wallet className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">
                {team.wallet.accountName}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {team.wallet.chain} · {team.wallet.serverUrl}
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {team.wallet.chain}
            </Badge>
          </div>

          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Balance</span>
              {balanceLoading ? (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              ) : balanceError ? (
                <span className="text-xs text-destructive">{balanceError}</span>
              ) : balance !== null ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-sm font-mono font-semibold cursor-default underline decoration-dotted underline-offset-2">
                        {fmt(confirmedTotal(balance))} ZEC
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="text-xs space-y-1.5 min-w-[180px]"
                    >
                      <p className="font-semibold text-foreground mb-1">
                        Confirmed balances
                      </p>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Ironwood</span>
                        <span className="font-mono">
                          {fmt(
                            (balance.confirmed_ironwood_balance ??
                              balance.confirmed_orchard_balance ??
                              0) / 1e8,
                          )}{" "}
                          ZEC
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Sapling</span>
                        <span className="font-mono">
                          {fmt(balance.confirmed_sapling_balance / 1e8)} ZEC
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">
                          Transparent
                        </span>
                        <span className="font-mono">
                          {fmt(balance.confirmed_transparent_balance / 1e8)} ZEC
                        </span>
                      </div>
                      <div className="border-t pt-1 flex justify-between gap-4 font-semibold">
                        <span>Total</span>
                        <span className="font-mono">
                          {fmt(confirmedTotal(balance))} ZEC
                        </span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={fetchBalance}
              disabled={balanceLoading}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${balanceLoading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>
      )}

      {/* Members list */}
      <div className="flex-1 overflow-y-auto">
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
                    {member.user.name[0]}
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
                          {team.name[0]}
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

        <TeamFormModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSuccess={handleTeamCreated}
        />
      </main>
    </ProtectedRoute>
  );
}
