"use client";

import { useState } from "react";
import Link from "next/link";
import { ProfileVisibility } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
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

export const DEFAULT_VISIBILITY: Required<ProfileVisibility> = {
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
      { key: "showAvatar", label: "Avatar", hint: "Your profile photo" },
      {
        key: "showDisplayName",
        label: "Display name",
        hint: "Nickname or name on your public page",
      },
      { key: "showRole", label: "Role", hint: "ADMIN / CLIENT badge" },
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
      { key: "showBio", label: "Bio", hint: "Your custom info box" },
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

interface PrivacySettingsCardProps {
  userId?: string;
  bio: string;
  visibility: Required<ProfileVisibility>;
  loading: boolean;
  onVisibilityChange: (next: Required<ProfileVisibility>) => void;
  onSave: (visibility: Required<ProfileVisibility>) => Promise<unknown>;
}

export function PrivacySettingsCard({
  userId,
  bio,
  visibility,
  loading,
  onVisibilityChange,
  onSave,
}: PrivacySettingsCardProps) {
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const toggle = (key: keyof ProfileVisibility, value: boolean) => {
    onVisibilityChange({ ...visibility, [key]: value });
    setDirty(true);
    setSuccess(false);
  };

  const setAll = (value: boolean) => {
    const next = { ...visibility };
    (Object.keys(DEFAULT_VISIBILITY) as (keyof ProfileVisibility)[]).forEach(
      (k) => {
        next[k] = value;
      },
    );
    onVisibilityChange(next);
    setDirty(true);
    setSuccess(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await onSave(visibility);
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Public profile & privacy
        </CardTitle>
        <CardDescription>
          Privacy-first by default. Only fields you enable appear on your public
          page. Wallet addresses are never shown publicly. Your bio is set at
          the top of this page — the toggle below just controls whether it's
          public.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
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
