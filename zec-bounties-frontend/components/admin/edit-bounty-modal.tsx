"use client";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Loader2,
  Save,
  Search,
  X,
  CheckCircle2,
  AlertTriangle,
  Users,
  Calendar,
  Coins,
  FileText,
  UserPlus,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBounty } from "@/lib/bounty-context";
import { Bounty } from "@/lib/types";
import { displayName } from "@/lib/displayName";
import { toDateInputValue, parseDateInputValue } from "@/lib/utils";

interface EditBountyModalProps {
  bounty: Bounty | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSection?: "details" | "assignees";
}

export function EditBountyModal({
  bounty,
  open,
  onOpenChange,
  defaultSection = "details",
}: EditBountyModalProps) {
  const { updateBounty, nonAdminUsers } = useBounty();
  const [isSaving, setIsSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<"details" | "assignees">(
    defaultSection,
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [bountyAmount, setBountyAmount] = useState("");
  const [timeToComplete, setTimeToComplete] = useState("");
  const [chain, setChain] = useState<"MAIN" | "TEST">("TEST");
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [notifyUsers, setNotifyUsers] = useState(false);

  useEffect(() => {
    if (!bounty) return;
    setTitle(bounty.title ?? "");
    setDescription(bounty.description ?? "");
    setBountyAmount(String(bounty.bountyAmount ?? ""));
    setTimeToComplete(
      bounty.timeToComplete
        ? toDateInputValue(new Date(bounty.timeToComplete))
        : "",
    );
    setChain(bounty.chain ?? "TEST");
    const existingIds = bounty.assignees?.map((a) => a.userId) ?? [];
    setSelectedUserIds(existingIds);
    setAssigneeSearch("");
    setNotifyUsers(false);
    setActiveSection(defaultSection);
  }, [bounty, open, defaultSection]);

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  };

  const filteredUsers = nonAdminUsers
    .filter(
      (u) =>
        displayName(u).toLowerCase().includes(assigneeSearch.toLowerCase()) ||
        u.email?.toLowerCase().includes(assigneeSearch.toLowerCase()),
    )
    .sort((a, b) => {
      const aSelected = selectedUserIds.includes(a.id);
      const bSelected = selectedUserIds.includes(b.id);
      if (aSelected !== bSelected) return aSelected ? -1 : 1;
      const aHasUA = !!a.UA_address;
      const bHasUA = !!b.UA_address;
      if (aHasUA !== bHasUA) return aHasUA ? -1 : 1;
      return 0;
    });

  const handleSave = async () => {
    if (!bounty) return;
    setIsSaving(true);
    try {
      const existingIds = bounty.assignees?.map((a) => a.userId) ?? [];
      const assigneesChanged =
        selectedUserIds.length !== existingIds.length ||
        selectedUserIds.some((id) => !existingIds.includes(id));
      await updateBounty(bounty.id, {
        title,
        description,
        bountyAmount: parseFloat(bountyAmount),
        timeToComplete: timeToComplete
          ? parseDateInputValue(timeToComplete)
          : undefined,
        chain,
        notifyUsers,
        ...(assigneesChanged && { userIds: selectedUserIds }),
      } as any);
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to save bounty:", err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!bounty) return null;

  const selectedUsers = nonAdminUsers.filter((u) =>
    selectedUserIds.includes(u.id),
  );
  const selectedUsersWithoutAddress = selectedUsers.filter((u) =>
    chain === "MAIN" ? !u.UA_address : !u.z_address,
  );
  const hasAddressWarning = selectedUsersWithoutAddress.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-4">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-muted-foreground" />
            Edit Bounty
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
            {bounty.title}
          </p>
        </DialogHeader>

        <div className="flex border-b shrink-0">
          {(["details", "assignees"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveSection(tab)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeSection === tab
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "details" ? (
                <FileText className="h-4 w-4" />
              ) : (
                <Users className="h-4 w-4" />
              )}
              {tab}
              {tab === "assignees" && selectedUserIds.length > 0 && (
                <span className="ml-1 bg-primary/15 text-primary text-xs font-semibold px-1.5 py-0.5 rounded-full">
                  {selectedUserIds.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {activeSection === "details" && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label
                  htmlFor="edit-title"
                  className="flex items-center gap-1.5"
                >
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  Title
                </Label>
                <Input
                  id="edit-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Bounty title"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="edit-desc"
                  className="flex items-center gap-1.5"
                >
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  Description
                </Label>
                <Textarea
                  id="edit-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the bounty..."
                  rows={5}
                  className="resize-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="edit-amount"
                    className="flex items-center gap-1.5"
                  >
                    <Coins className="h-3.5 w-3.5 text-muted-foreground" />
                    Reward (ZEC)
                  </Label>
                  <Input
                    id="edit-amount"
                    type="number"
                    min="0"
                    step="0.001"
                    value={bountyAmount}
                    onChange={(e) => setBountyAmount(e.target.value)}
                    placeholder="0.000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="edit-chain"
                    className="flex items-center gap-1.5"
                  >
                    <Coins className="h-3.5 w-3.5 text-muted-foreground" />
                    Network
                  </Label>
                  <Select
                    value={chain}
                    onValueChange={(v) => setChain(v as "MAIN" | "TEST")}
                  >
                    <SelectTrigger id="edit-chain" className="w-full">
                      <SelectValue placeholder="Select network" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TEST">Testnet</SelectItem>
                      <SelectItem value="MAIN">Mainnet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="edit-deadline"
                    className="flex items-center gap-1.5"
                  >
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    Deadline
                  </Label>
                  <Input
                    id="edit-deadline"
                    type="date"
                    value={timeToComplete}
                    onChange={(e) => setTimeToComplete(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {activeSection === "assignees" && (
            <div className="space-y-4">
              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-3 bg-muted/40 rounded-lg border border-dashed">
                  {selectedUsers.map((u) => (
                    <span
                      key={u.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background border text-xs font-medium shadow-sm"
                    >
                      <Avatar className="h-4 w-4">
                        <AvatarImage
                          src={u.avatar || "/placeholder-user.jpg"}
                        />
                        <AvatarFallback className="text-[8px]">
                          {displayName(u)[0]}
                        </AvatarFallback>
                      </Avatar>
                      {displayName(u)}
                      <button
                        onClick={() => toggleUser(u.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {hasAddressWarning && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 text-sm">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-medium text-yellow-800 dark:text-yellow-200">
                      Missing{" "}
                      {chain === "MAIN"
                        ? "Unified Address (UA)"
                        : "Transparent Address (TA)"}
                    </p>
                    <p className="text-yellow-700 dark:text-yellow-300 text-xs">
                      {selectedUsersWithoutAddress
                        .map((u) => displayName(u))
                        .join(", ")}{" "}
                      {selectedUsersWithoutAddress.length === 1
                        ? "has"
                        : "have"}{" "}
                      no {chain === "MAIN" ? "UA" : "TA"} set and cannot receive
                      payment on {chain === "MAIN" ? "mainnet" : "testnet"}.
                      Remove them or ask them to set their address first.
                    </p>
                  </div>
                </div>
              )}

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search by name or email..."
                  value={assigneeSearch}
                  onChange={(e) => setAssigneeSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="border rounded-lg overflow-hidden divide-y">
                {filteredUsers.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    No users found
                  </div>
                ) : (
                  filteredUsers.map((user) => {
                    const selected = selectedUserIds.includes(user.id);
                    return (
                      <button
                        key={user.id}
                        onClick={() => toggleUser(user.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                          selected
                            ? "bg-primary/8 hover:bg-primary/12"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <Avatar className="h-9 w-9 flex-shrink-0 border">
                          <AvatarImage
                            src={user.avatar || "/placeholder-user.jpg"}
                          />
                          <AvatarFallback className="text-xs font-semibold">
                            {displayName(user)[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {displayName(user)}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {user.email}
                          </p>
                          {chain === "MAIN" ? (
                            user.UA_address ? (
                              <span className="text-green-600 flex items-center gap-0.5 shrink-0 text-xs">
                                <CheckCircle2 className="h-3 w-3" /> UA set
                              </span>
                            ) : (
                              <span className="text-red-600 flex items-center gap-0.5 shrink-0 text-xs">
                                <AlertTriangle className="h-3 w-3" /> No UA
                              </span>
                            )
                          ) : user.z_address ? (
                            <span className="text-blue-600 flex items-center gap-0.5 shrink-0 text-xs">
                              <CheckCircle2 className="h-3 w-3" /> TA set
                            </span>
                          ) : (
                            <span className="text-yellow-600 flex items-center gap-0.5 shrink-0 text-xs">
                              <AlertTriangle className="h-3 w-3" /> No TA
                            </span>
                          )}
                        </div>
                        <div
                          className={`h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                            selected
                              ? "border-primary bg-primary"
                              : "border-muted-foreground/30"
                          }`}
                        >
                          {selected && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary-foreground" />
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
              {selectedUserIds.length === 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  No assignees selected — bounty will be open to applications
                </p>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex flex-col gap-3 shrink-0 bg-muted/20">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={notifyUsers}
              onChange={(e) => setNotifyUsers(e.target.checked)}
            />
            Notify assignees about this update
          </label>
          <div className="grid grid-cols-1 imd:flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {activeSection === "assignees"
                ? `${selectedUserIds.length} assignee${selectedUserIds.length !== 1 ? "s" : ""} selected`
                : `Last updated: ${bounty.dateCreated ? new Date(bounty.dateCreated).toLocaleDateString() : "—"}`}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving || !title.trim() || hasAddressWarning}
                className="gap-2 min-w-[90px]"
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {isSaving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}