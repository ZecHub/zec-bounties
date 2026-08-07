"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { backendUrl } from "@/lib/configENV";
import { ProfileVisibility } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  Save,
  Shield,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

const DEFAULT_VISIBILITY: Required<ProfileVisibility> = {
  showAvatar: true,
  showDisplayName: true,
  showBio: false,
  showBadges: false,
  showCompleted: false,
  showCreated: false,
  showEarnings: false,
  showCompletionRate: false,
  showAddressType: false,
  showMemberSince: false,
  showRecentBounties: false,
  showRole: false,
  showGithub: false,
};

const TOGGLE_GROUPS: {
  title: string;
  items: { key: keyof ProfileVisibility; label: string; hint: string }[];
}[] = [
  {
    title: "Identity",
    items: [
      {
        key: "showAvatar",
        label: "Avatar",
        hint: "Your profile photo",
      },
      {
        key: "showDisplayName",
        label: "Display name",
        hint: "Nickname or name on your public page",
      },
      {
        key: "showRole",
        label: "Role",
        hint: "ADMIN / CLIENT badge",
      },
      {
        key: "showGithub",
        label: "GitHub link",
        hint: "Link to your GitHub account (never the private email)",
      },
      {
        key: "showMemberSince",
        label: "Member since",
        hint: "When you joined the platform",
      },
    ],
  },
  {
    title: "About",
    items: [
      {
        key: "showBio",
        label: "Bio",
        hint: "Your custom info box",
      },
      {
        key: "showBadges",
        label: "Badges",
        hint: "Researcher, node-runner, DAO member, etc.",
      },
    ],
  },
  {
    title: "Contribution stats",
    items: [
      {
        key: "showCompleted",
        label: "Completed & submitted",
        hint: "Counts of work you finished",
      },
      {
        key: "showCreated",
        label: "Bounties created",
        hint: "How many bounties you posted",
      },
      {
        key: "showEarnings",
        label: "Total ZEC earned",
        hint: "Aggregate paid rewards only",
      },
      {
        key: "showCompletionRate",
        label: "Completion rate",
        hint: "Completed ÷ submitted",
      },
      {
        key: "showRecentBounties",
        label: "Recent activity",
        hint: "Last few completed/created bounties",
      },
    ],
  },
  {
    title: "Wallet signals (never the address)",
    items: [
      {
        key: "showAddressType",
        label: "Address type icons",
        hint: "Ironwood / Sapling / Transparent only — never your UA or z-address",
      },
    ],
  },
];

export function PrivacySettingsCard({ userId }: { userId?: string }) {
  const [bio, setBio] = useState("");
  const [visibility, setVisibility] =
    useState<Required<ProfileVisibility>>(DEFAULT_VISIBILITY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("authToken");
        const res = await fetch(`${backendUrl}/api/users/me/profile-settings`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load settings");
        const data = await res.json();
        if (cancelled) return;
        setBio(data.bio || "");
        setVisibility({ ...DEFAULT_VISIBILITY, ...data.profileVisibility });
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (key: keyof ProfileVisibility, value: boolean) => {
    setVisibility((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSuccess(false);
  };

  const handleBioChange = (value: string) => {
    setBio(value.slice(0, 500));
    setDirty(true);
    setSuccess(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const token = localStorage.getItem("authToken");
      const res = await fetch(`${backendUrl}/api/users/me/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bio,
          profileVisibility: visibility,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Save failed");
      }
      const data = await res.json();
      setBio(data.bio || "");
      setVisibility({ ...DEFAULT_VISIBILITY, ...data.profileVisibility });
      setDirty(false);
      setSuccess(true);
      toast.success("Privacy settings saved");
    } catch (e: any) {
      setError(e.message || "Save failed");
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const setAll = (value: boolean) => {
    const next = { ...visibility };
    (Object.keys(DEFAULT_VISIBILITY) as (keyof ProfileVisibility)[]).forEach(
      (k) => {
        next[k] = value;
      },
    );
    setVisibility(next);
    setDirty(true);
    setSuccess(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Public profile & privacy
        </CardTitle>
        <CardDescription>
          Privacy-first by default. Only fields you enable appear on your public
          page. Wallet addresses are never shown publicly.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="public-bio">Public bio</Label>
              <Textarea
                id="public-bio"
                value={bio}
                onChange={(e) => handleBioChange(e.target.value)}
                placeholder="Short intro for other contributors (optional)"
                rows={3}
                maxLength={500}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground text-right">
                {bio.length}/500 — only visible if “Bio” is enabled below
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAll(false)}
              >
                Hide all
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAll(true)}
              >
                Show all
              </Button>
              {userId && (
                <Button type="button" variant="ghost" size="sm" asChild>
                  <Link
                    href={`/users/${userId}`}
                    className="gap-1.5"
                    target="_blank"
                  >
                    Preview public page
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </Button>
              )}
            </div>

            {TOGGLE_GROUPS.map((group) => (
              <div key={group.title} className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.title}
                </p>
                <div className="space-y-3">
                  {group.items.map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.hint}
                        </p>
                      </div>
                      <Switch
                        checked={!!visibility[item.key]}
                        onCheckedChange={(checked) =>
                          toggle(item.key, checked as boolean)
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-700 dark:text-green-400">
                  Saved. Public page updated.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end">
              <Button
                onClick={handleSave}
                disabled={!dirty || saving}
                className="gap-1.5"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save privacy settings
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
