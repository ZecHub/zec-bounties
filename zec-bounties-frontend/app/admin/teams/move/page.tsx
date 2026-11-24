"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBounty } from "@/lib/bounty-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { toast } from "sonner"; // swap for your existing toast lib if different

export function formatMovedBountiesMessage(movedCount: number): string {
  return `Moved ${movedCount} ${movedCount === 1 ? "bounty" : "bounties"}`;
}

export function getSelectAllCheckboxState(
  selectedCount: number,
  totalCount: number,
): boolean | "indeterminate" {
  if (totalCount > 0 && selectedCount === totalCount) return true;
  if (selectedCount > 0) return "indeterminate";
  return false;
}

export default function AssignUnteamedBountiesPage() {
  const router = useRouter();
  const {
    currentUser,
    isLoading,
    teams,
    fetchTeams,
    unassignedBounties,
    unassignedBountiesLoading,
    fetchUnassignedBounties,
    assignUnassignedBountiesToTeam,
  } = useBounty();

  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState(false);

  // Admin-only guard — isLoading from context is the source of truth.
  useEffect(() => {
    if (!isLoading && (!currentUser || currentUser.role !== "ADMIN")) {
      router.replace("/");
    }
  }, [isLoading, currentUser, router]);

  useEffect(() => {
    if (isLoading || !currentUser || currentUser.role !== "ADMIN") return;
    fetchUnassignedBounties();
    if (teams.length === 0) fetchTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, currentUser]);

  // Drop any selected ids that no longer exist in the list (e.g. after a move)
  useEffect(() => {
    setSelectedIds((prev) => {
      const validIds = new Set(unassignedBounties.map((b) => b.id));
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [unassignedBounties]);

  const selectAllState = getSelectAllCheckboxState(
    selectedIds.size,
    unassignedBounties.length,
  );
  const allSelected = selectAllState === true;

  function toggleAll() {
    setSelectedIds(
      allSelected ? new Set() : new Set(unassignedBounties.map((b) => b.id)),
    );
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleMove() {
    if (moving || !selectedTeamId || selectedIds.size === 0) return;
    setMoving(true);
    try {
      const { movedCount } = await assignUnassignedBountiesToTeam(
        selectedTeamId,
        [...selectedIds],
      );
      setSelectedIds(new Set());
      toast.success(formatMovedBountiesMessage(movedCount));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not move bounties",
      );
    } finally {
      setMoving(false);
    }
  }

  if (isLoading || !currentUser || currentUser.role !== "ADMIN") return null;

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-foreground">
        Assign unteamed bounties
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Select the bounties to move, pick a team, and move them. This also
        updates each moved bounty's privacy to match the team's.
      </p>

      {unassignedBountiesLoading ? (
        <div className="mt-8 h-40 animate-pulse rounded-md bg-muted" />
      ) : unassignedBounties.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          No unassigned bounties right now.
        </p>
      ) : (
        <div className="mt-8 space-y-5">
          <div className="rounded-md border border-border">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Checkbox
                checked={selectAllState}
                onCheckedChange={toggleAll}
                aria-label="Select all unassigned bounties"
              />
              <span className="text-sm font-medium text-foreground">
                {selectedIds.size > 0
                  ? `${selectedIds.size} of ${unassignedBounties.length} selected`
                  : `Select all (${unassignedBounties.length})`}
              </span>
            </div>

            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {unassignedBounties.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-4 py-3">
                  <Checkbox
                    checked={selectedIds.has(b.id)}
                    onCheckedChange={() => toggleOne(b.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">
                      {b.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {b.bountyAmount} ZEC ·{" "}
                      {new Date(b.dateCreated).toLocaleDateString()}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-3">
            <Select
              value={selectedTeamId}
              onValueChange={setSelectedTeamId}
              disabled={moving}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a team" />
              </SelectTrigger>
              <SelectContent>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              onClick={handleMove}
              disabled={!selectedTeamId || selectedIds.size === 0 || moving}
              className="shrink-0"
            >
              {moving ? "Moving…" : `Move ${selectedIds.size || ""}`.trim()}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
