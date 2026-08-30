"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AdminNavbar } from "@/components/layout/admin/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ShieldCheck,
  Wallet,
  User,
  Save,
  AlertCircle,
  Globe,
  FlaskConical,
  ChevronDown,
  Settings2,
} from "lucide-react";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useBounty } from "@/lib/bounty-context";
import { cn } from "@/lib/utils";
import { backendUrl } from "@/lib/configENV";
import { ProfileVisibility } from "@/lib/types";
import {
  PrivacySettingsCard,
  DEFAULT_VISIBILITY,
} from "@/components/profile/privacy-settings-card";

type SaveState = "idle" | "saving" | "success" | "error";

export default function AdminProfilePage() {
  const router = useRouter();
  const {
    currentUser,
    zAddressUpdate,
    uaAddressUpdate,
    verifyZaddress,
    verifyUaddress,
    setCurrentUser,
    nicknameUpdate,
    emailNotificationsUpdate,
  } = useBounty();

  // ── Additional settings visibility ─────────────────────────────────────────
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // ── Public profile settings: bio + visibility, fetched once here ─────────
  // (shared with PrivacySettingsCard — both edit the same backend record,
  // so this lives in the parent to avoid two components independently
  // fetching/saving the same record and clobbering each other's writes)
  const [bio, setBio] = useState("");
  const [savedBio, setSavedBio] = useState("");
  const [visibility, setVisibility] =
    useState<Required<ProfileVisibility>>(DEFAULT_VISIBILITY);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsLoadError, setSettingsLoadError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setSettingsLoading(true);
      try {
        const token = localStorage.getItem("authToken");
        const res = await fetch(`${backendUrl}/api/users/me/profile-settings`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load settings");
        const data = await res.json();
        if (cancelled) return;
        setBio(data.bio || "");
        setSavedBio(data.bio || "");
        setVisibility({ ...DEFAULT_VISIBILITY, ...data.profileVisibility });
      } catch (e: any) {
        if (!cancelled)
          setSettingsLoadError(e.message || "Failed to load settings");
      } finally {
        if (!cancelled) setSettingsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Shared save call — used by the privacy card (visibility toggles), since
  // the backend persists bio + visibility together. Always sends the
  // parent's current bio so a visibility-only change can't overwrite it.
  const savePublicProfile = async (
    nextBio: string,
    nextVisibility: Required<ProfileVisibility>,
  ) => {
    const token = localStorage.getItem("authToken");
    const res = await fetch(`${backendUrl}/api/users/me/profile`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ bio: nextBio, profileVisibility: nextVisibility }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Save failed");
    }
    const data = await res.json();
    setBio(data.bio || "");
    setSavedBio(data.bio || "");
    setVisibility({ ...DEFAULT_VISIBILITY, ...data.profileVisibility });
    return data;
  };

  // ── Testnet Z-address state ──────────────────────────────────────────────
  const [zAddress, setZAddress] = useState(currentUser?.z_address ?? "");
  const [zSaveState, setZSaveState] = useState<SaveState>("idle");
  const [zVerified, setZVerified] = useState<boolean | null>(null);
  const [zVerifying, setZVerifying] = useState(false);
  const [zError, setZError] = useState<string | null>(null);

  // ── Mainnet UA-address state ─────────────────────────────────────────────
  const [uaAddress, setUaAddress] = useState(currentUser?.UA_address ?? "");
  const [uaSaveState, setUaSaveState] = useState<SaveState>("idle");
  const [uaVerified, setUaVerified] = useState<boolean | null>(null);
  const [uaVerifying, setUaVerifying] = useState(false);
  const [uaError, setUaError] = useState<string | null>(null);

  // ── Nickname + bio state (saved together) ─────────────────────────────────
  const [nickname, setNickname] = useState(currentUser?.nickname ?? "");
  const [nicknameDirty, setNicknameDirty] = useState(false);
  const [profileSaveState, setProfileSaveState] = useState<SaveState>("idle");
  const [profileError, setProfileError] = useState<string | null>(null);

  // Debounce ref for UA inline verification
  const uaDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [emailNotifications, setEmailNotifications] = useState(
    currentUser?.emailNotifications ?? true,
  );
  const [emailNotifDirty, setEmailNotifDirty] = useState(false);
  const [emailNotifSaving, setEmailNotifSaving] = useState(false);

  // ── Keep local state in sync if currentUser updates ──────────────────────
  useEffect(() => {
    if (currentUser) {
      if (!emailNotifSaving) {
        setEmailNotifications(currentUser.emailNotifications ?? true);
      }
      setZAddress(currentUser.z_address ?? "");
      setUaAddress(currentUser.UA_address ?? "");
      if (!nicknameDirty) {
        setNickname(currentUser.nickname ?? "");
      }
    }
  }, [currentUser, emailNotifSaving, nicknameDirty]);

  const handleEmailNotificationsChange = (checked: boolean) => {
    setEmailNotifications(checked);
    setEmailNotifDirty(checked !== (currentUser?.emailNotifications ?? true));
  };

  const handleSaveEmailNotifications = async () => {
    setEmailNotifSaving(true);
    try {
      const ok = await emailNotificationsUpdate(emailNotifications);
      if (ok) {
        setEmailNotifDirty(false);
        toast.success(
          emailNotifications
            ? "Notifications enabled"
            : "Notifications disabled",
          {
            description: emailNotifications
              ? "You will receive emails when new bounties are posted."
              : "You will no longer receive bounty notification emails.",
          },
        );
      } else {
        setEmailNotifications(currentUser?.emailNotifications ?? true);
        setEmailNotifDirty(false);
        toast.error("Failed to update preference", {
          description: "Please try again.",
        });
      }
    } catch {
      setEmailNotifications(currentUser?.emailNotifications ?? true);
      setEmailNotifDirty(false);
      toast.error("Failed to update preference", {
        description: "Something went wrong. Please try again.",
      });
    } finally {
      setEmailNotifSaving(false);
    }
  };

  // ── Testnet handlers ──────────────────────────────────────────────────────

  const handleVerifyZA = async () => {
    if (!zAddress.trim()) return;
    setZVerifying(true);
    setZVerified(null);
    setZError(null);
    try {
      const result = await verifyZaddress(zAddress.trim());
      setZVerified(result ?? false);
    } catch {
      setZVerified(false);
      setZError("Verification failed. Check your wallet connection.");
    } finally {
      setZVerifying(false);
    }
  };

  const handleSaveZAddress = async () => {
    if (!zAddress.trim()) return;
    setZSaveState("saving");
    setZError(null);
    try {
      const ok = await zAddressUpdate(zAddress.trim());
      if (ok) {
        setZSaveState("success");
        setCurrentUser((prev) =>
          prev ? { ...prev, z_address: zAddress.trim() } : prev,
        );
        setTimeout(() => setZSaveState("idle"), 3000);
      } else {
        throw new Error("Update returned false");
      }
    } catch {
      setZSaveState("error");
      setZError("Failed to save address. Please try again.");
    }
  };

  // ── Mainnet handlers ──────────────────────────────────────────────────────

  const handleUaAddressChange = (value: string) => {
    setUaAddress(value);
    setUaError(null);
    setUaVerified(null);
    if (uaSaveState !== "idle") setUaSaveState("idle");

    // Clear any pending debounce
    if (uaDebounceRef.current) clearTimeout(uaDebounceRef.current);

    // Too short — no need to call API
    if (value.trim().length <= 20) return;

    // Debounce the verification call by 600ms
    uaDebounceRef.current = setTimeout(async () => {
      setUaVerifying(true);
      try {
        const result = await verifyUaddress(value.trim());
        setUaVerified(result ?? false);
      } catch {
        setUaVerified(false);
        setUaError("Verification failed. Check your wallet connection.");
      } finally {
        setUaVerifying(false);
      }
    }, 600);
  };

  const handleSaveUaAddress = async () => {
    if (!uaAddress.trim()) return;
    setUaSaveState("saving");
    setUaError(null);
    try {
      const ok = await uaAddressUpdate(uaAddress.trim());
      if (ok) {
        setUaSaveState("success");
        setCurrentUser((prev) =>
          prev ? { ...prev, UA_address: uaAddress.trim() } : prev,
        );
        setTimeout(() => setUaSaveState("idle"), 3000);
      } else {
        throw new Error("Update returned false");
      }
    } catch {
      setUaSaveState("error");
      setUaError("Failed to save address. Please try again.");
    }
  };

  // ── Profile (nickname + bio) handlers ─────────────────────────────────────

  const profileDirty =
    nickname !== (currentUser?.nickname ?? "") || bio !== savedBio;

  const handleNicknameChange = (value: string) => {
    setNickname(value);
    setNicknameDirty(value !== (currentUser?.nickname ?? ""));
    setProfileSaveState("idle");
    setProfileError(null);
  };

  const handleBioChange = (value: string) => {
    setBio(value.slice(0, 500));
    setProfileSaveState("idle");
    setProfileError(null);
  };

  const handleCancelProfile = () => {
    setNickname(currentUser?.nickname ?? "");
    setNicknameDirty(false);
    setBio(savedBio);
    setProfileSaveState("idle");
    setProfileError(null);
  };

  const handleSaveProfile = async () => {
    setProfileSaveState("saving");
    setProfileError(null);
    try {
      const nicknameChanged = nickname !== (currentUser?.nickname ?? "");
      const bioChanged = bio !== savedBio;

      const tasks: Promise<any>[] = [];
      if (nicknameChanged) tasks.push(nicknameUpdate(nickname));
      if (bioChanged) tasks.push(savePublicProfile(bio, visibility));

      const results = await Promise.allSettled(tasks);
      const failed = results.some(
        (r) => r.status === "rejected" || r.value === false,
      );

      if (failed) {
        setProfileSaveState("error");
        setProfileError("Some changes couldn't be saved. Please try again.");
      } else {
        setProfileSaveState("success");
        setNicknameDirty(false);
        setTimeout(() => setProfileSaveState("idle"), 3000);
      }
    } catch (err: any) {
      setProfileSaveState("error");
      setProfileError(err.message ?? "Something went wrong");
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const zAddressDirty = zAddress !== (currentUser?.z_address ?? "");
  const isZcashAddress = zAddress.startsWith("u") || zAddress.startsWith("z");

  const uaAddressDirty = uaAddress !== (currentUser?.UA_address ?? "");
  const isTooShort = uaAddress.length > 0 && uaAddress.trim().length <= 20;
  // Mainnet unified addresses always start with "u1"
  const isValidUaAddress = uaAddress.startsWith("u1");

  return (
    <ProtectedRoute requireAdmin>
      <div className="min-h-screen bg-background">
        <AdminNavbar />

        <main className="container max-w-2xl mx-auto py-10 px-4 space-y-6">
          {/* ── Profile header ─────────────────────────────────────────────── */}
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage
                src={currentUser?.avatar ?? "/abstract-geometric-shapes.png"}
                alt={currentUser?.name}
              />
              <AvatarFallback className="text-xl font-medium">
                {currentUser?.name?.charAt(0).toUpperCase() ?? "U"}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-semibold">{currentUser?.name}</h1>
              <p className="text-sm text-muted-foreground">
                {currentUser?.email}
              </p>
              {/* <Badge variant="secondary" className="mt-1 text-xs capitalize">
                {currentUser.role === "ADMIN" ? (
                  <ShieldCheck className="h-3 w-3 mr-1" />
                ) : (
                  <User className="h-3 w-3 mr-1" />
                )}
                {currentUser.role.toLowerCase()}
              </Badge> */}
            </div>
          </div>

          <Separator />

          {/* ── Account info (read-only) ────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <User className="h-4 w-4" />
                Account information
              </CardTitle>
              <CardDescription>
                These details are managed by your login provider.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Name</Label>
                <Input value={currentUser?.name ?? ""} disabled />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Email</Label>
                <Input value={currentUser?.email ?? ""} disabled />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <User className="h-4 w-4" />
                Profile
              </CardTitle>
              <CardDescription>
                Your nickname and bio, shown on your public page.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-1.5">
                <Label
                  htmlFor="nickname"
                  className="text-xs text-muted-foreground"
                >
                  Nickname
                </Label>
                <Input
                  id="nickname"
                  value={nickname}
                  onChange={(e) => handleNicknameChange(e.target.value)}
                  placeholder="e.g. zechunter42"
                  maxLength={32}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {nickname.length}/32
                </p>
              </div>

              <div className="grid gap-1.5">
                <Label
                  htmlFor="bio"
                  className="text-xs text-muted-foreground flex items-center gap-1.5"
                >
                  Bio
                  {settingsLoading && (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                </Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => handleBioChange(e.target.value)}
                  placeholder="Tell the community a bit about yourself…"
                  maxLength={500}
                  rows={3}
                  disabled={settingsLoading}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground text-right">
                  {bio.length}/500 — visible only if "Bio" is enabled in
                  Additional settings → Public profile & privacy
                </p>
              </div>

              {settingsLoadError && (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    {settingsLoadError}
                  </AlertDescription>
                </Alert>
              )}

              {profileError && (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    {profileError}
                  </AlertDescription>
                </Alert>
              )}

              {profileSaveState === "success" && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Profile saved</p>
                    <p className="text-xs text-muted-foreground">
                      Your nickname and bio have been updated.
                    </p>
                  </div>
                </div>
              )}

              {profileDirty && (
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelProfile}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={profileSaveState === "saving"}
                    onClick={handleSaveProfile}
                    className="gap-1.5"
                  >
                    {profileSaveState === "saving" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save profile
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Notifications
              </CardTitle>
              <CardDescription>
                Control whether you receive email notifications for new bounties
                and platform activity.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Email notifications</p>
                  <p className="text-xs text-muted-foreground">
                    Receive emails when new bounties are posted
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {emailNotifSaving && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                  {emailNotifDirty && (
                    <Button
                      size="sm"
                      onClick={handleSaveEmailNotifications}
                      disabled={emailNotifSaving}
                      className="gap-1.5"
                    >
                      {emailNotifSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Confirm
                    </Button>
                  )}
                  <Switch
                    checked={emailNotifications}
                    onCheckedChange={(checked) =>
                      handleEmailNotificationsChange(checked as boolean)
                    }
                    disabled={emailNotifSaving}
                  />
                </div>
              </div>
            </CardContent>

            {/* <CardContent>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="email-notifications"
                    checked={emailNotifications}
                    onCheckedChange={(checked) =>
                      handleEmailNotificationsChange(checked as boolean)
                    }
                    disabled={emailNotifSaving}
                    className="mt-0.5"
                  />
                  <div className="space-y-0.5">
                    <label
                      htmlFor="email-notifications"
                      className="text-sm font-medium cursor-pointer"
                    >
                      Email notifications
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Receive emails when new bounties are posted
                    </p>
                  </div>
                </div>

                {emailNotifDirty && (
                  <Button
                    size="sm"
                    onClick={handleSaveEmailNotifications}
                    disabled={emailNotifSaving}
                    className="gap-1.5 shrink-0"
                  >
                    {emailNotifSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Confirm
                  </Button>
                )}
              </div>
            </CardContent> */}
          </Card>

          {/* ── Mainnet UA address ───────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Mainnet payment address
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Your unified address on the Zcash mainnet where bounty
                    rewards are sent. Must start with{" "}
                    <code className="font-mono text-xs">u1</code>.
                  </CardDescription>
                </div>
                <Badge className="shrink-0 text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-0">
                  Mainnet
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-1.5">
                <Label
                  htmlFor="ua-address"
                  className="text-xs text-muted-foreground"
                >
                  Unified address
                </Label>
                <div className="relative">
                  <Input
                    id="ua-address"
                    value={uaAddress}
                    onChange={(e) => handleUaAddressChange(e.target.value)}
                    placeholder="u1…"
                    className={cn(
                      "pr-8 font-mono text-sm",
                      uaVerified === true &&
                        "border-green-500 focus-visible:ring-green-500",
                      uaVerified === false &&
                        "border-destructive focus-visible:ring-destructive",
                      uaSaveState === "success" &&
                        "border-green-500 focus-visible:ring-green-500",
                      uaSaveState === "error" &&
                        "border-destructive focus-visible:ring-destructive",
                    )}
                  />
                  {uaVerifying && (
                    <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {!uaVerifying && uaVerified === true && (
                    <CheckCircle2 className="absolute right-2.5 top-2.5 h-4 w-4 text-green-500" />
                  )}
                  {!uaVerifying && uaVerified === false && (
                    <XCircle className="absolute right-2.5 top-2.5 h-4 w-4 text-destructive" />
                  )}
                </div>

                {isTooShort && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <XCircle className="h-3.5 w-3.5" />
                    Invalid Mainnet Address
                  </p>
                )}

                {/* {!isTooShort && uaAddress && !isValidUaAddress && (
                  <p className="text-xs text-muted-foreground">
                    Mainnet unified addresses must start with{" "}
                    <code className="font-mono">u1</code>.
                  </p>
                )} */}

                {uaVerified === true && uaSaveState === "idle" && (
                  <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Address is valid
                  </p>
                )}

                {uaVerified === false && !uaError && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <XCircle className="h-3.5 w-3.5" />
                    Address could not be verified
                  </p>
                )}
              </div>

              {uaError && (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    {uaError}
                  </AlertDescription>
                </Alert>
              )}

              {uaSaveState === "success" && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Mainnet address saved</p>
                    <p className="text-xs text-muted-foreground">
                      You can now receive mainnet bounty payments.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                {uaAddressDirty && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setUaAddress(currentUser?.UA_address ?? "");
                      setUaError(null);
                      setUaSaveState("idle");
                    }}
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  size="sm"
                  disabled={
                    !uaAddressDirty ||
                    !uaAddress.trim() ||
                    uaSaveState === "saving" ||
                    !isValidUaAddress ||
                    uaVerified !== true
                  }
                  onClick={handleSaveUaAddress}
                  className="gap-1.5"
                >
                  {uaSaveState === "saving" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save address
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── Additional settings (collapsed by default) ────────────────────── */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex w-full items-center justify-between text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
            >
              <span className="flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Additional settings
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  advancedOpen && "rotate-180",
                )}
              />
            </button>

            {advancedOpen && (
              <div className="space-y-6 pt-2">
                {/* ── Public profile & privacy ─────────────────────────────── */}
                <PrivacySettingsCard
                  userId={currentUser?.id}
                  bio={bio}
                  visibility={visibility}
                  onVisibilityChange={setVisibility}
                  loading={settingsLoading}
                  onSave={(nextVisibility) =>
                    savePublicProfile(bio, nextVisibility)
                  }
                />

                {/* ── Testnet Z-address ────────────────────────────────────── */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base font-medium flex items-center gap-2">
                          <FlaskConical className="h-4 w-4" />
                          Testnet payment address
                        </CardTitle>
                        <CardDescription className="mt-1">
                          Your shielded or unified address on the Zcash testnet.
                          Used for development bounties. Must start with{" "}
                          <code className="font-mono text-xs">u</code> or{" "}
                          <code className="font-mono text-xs">z</code>.
                        </CardDescription>
                      </div>
                      <Badge className="shrink-0 text-xs bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-0">
                        Testnet
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-1.5">
                      <Label
                        htmlFor="z-address"
                        className="text-xs text-muted-foreground"
                      >
                        Z-address
                      </Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            id="z-address"
                            value={zAddress}
                            onChange={(e) => {
                              setZAddress(e.target.value);
                              setZVerified(null);
                              setZError(null);
                            }}
                            placeholder="u1… or zs1…"
                            className={cn(
                              "pr-8 font-mono text-sm",
                              zVerified === true &&
                                "border-green-500 focus-visible:ring-green-500",
                              zVerified === false &&
                                "border-destructive focus-visible:ring-destructive",
                            )}
                          />
                          {zVerified === true && (
                            <CheckCircle2 className="absolute right-2.5 top-2.5 h-4 w-4 text-green-500" />
                          )}
                          {zVerified === false && (
                            <XCircle className="absolute right-2.5 top-2.5 h-4 w-4 text-destructive" />
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          disabled={
                            !zAddress.trim() || zVerifying || !isZcashAddress
                          }
                          onClick={handleVerifyZA}
                        >
                          {zVerifying ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Verify"
                          )}
                        </Button>
                      </div>

                      {zAddress && !isZcashAddress && (
                        <p className="text-xs text-muted-foreground">
                          Address must start with{" "}
                          <code className="font-mono">u</code> (unified) or{" "}
                          <code className="font-mono">z</code> (shielded).
                        </p>
                      )}

                      {zVerified === true && (
                        <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Address is valid
                        </p>
                      )}

                      {zVerified === false && !zError && (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <XCircle className="h-3.5 w-3.5" />
                          Address could not be verified
                        </p>
                      )}
                    </div>

                    {zError && (
                      <Alert variant="destructive" className="py-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          {zError}
                        </AlertDescription>
                      </Alert>
                    )}

                    {zSaveState === "success" && (
                      <Alert className="py-2 border-green-500 bg-green-50 dark:bg-green-950/20">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <AlertDescription className="text-xs text-green-700 dark:text-green-400">
                          Testnet address saved successfully.
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* <div className="flex justify-end gap-2 pt-1">
                      {zAddressDirty && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setZAddress(currentUser?.z_address ?? "");
                            setZVerified(null);
                            setZError(null);
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                      <Button
                        size="sm"
                        disabled={
                          !zAddressDirty ||
                          !zAddress.trim() ||
                          zSaveState === "saving" ||
                          !isZcashAddress
                        }
                        onClick={handleSaveZAddress}
                        className="gap-1.5"
                      >
                        {zSaveState === "saving" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        Save address
                      </Button>
                    </div> */}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
