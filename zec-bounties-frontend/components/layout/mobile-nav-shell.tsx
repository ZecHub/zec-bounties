"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { useBounty } from "@/lib/bounty-context";
import { BottomTabBar } from "@/components/layout/bottom-tab-bar";
import { NewBountyModal } from "@/components/new-bounty-modal";
import { FavoriteTeamsSidebar } from "@/components/favorite-teams-sidebar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useTaskCreationBlocked } from "@/hooks/use-task-creation-blocked";

interface MobileNavShellProps {
  children: React.ReactNode;
  onOpenTeams?: () => void;
  teamsActive?: boolean;
}

export function MobileNavShell({
  children,
  onOpenTeams,
  teamsActive,
}: MobileNavShellProps) {
  const { currentUser, activeTeamId, setActiveTeamId } = useBounty();
  const router = useRouter();
  const pathname = usePathname();
  const [isNewBountyModalOpen, setIsNewBountyModalOpen] = useState(false);
  const [isTeamsSheetOpen, setIsTeamsSheetOpen] = useState(false);
  const taskCreationBlocked = useTaskCreationBlocked();

  const handleNewBounty = () => {
    if (taskCreationBlocked) {
      toast.error("Task creation disabled", {
        description: "An admin has blocked your account from creating tasks.",
      });
      return;
    }
    if (!currentUser?.UA_address) {
      toast.warning("Unified Address required", {
        description: "Add a UA to your profile before creating a bounty.",
        action: {
          label: "Go to profile",
          onClick: () => router.push("/profile"),
        },
        duration: 5000,
      });
      return;
    }
    setIsNewBountyModalOpen(true);
  };

  const handleOpenTeams = onOpenTeams ?? (() => setIsTeamsSheetOpen(true));
  const isTeamsActive =
    teamsActive !== undefined ? teamsActive : !!activeTeamId;

  return (
    <div className="pb-20 md:pb-0">
      {children}

      <Sheet open={isTeamsSheetOpen} onOpenChange={setIsTeamsSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[70vh] overflow-y-auto p-4 py-6"
        >
          <SheetHeader>
            <SheetTitle>Favorite Teams</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <FavoriteTeamsSidebar
              activeTeamId={activeTeamId}
              onSelectTeam={(id) => {
                setActiveTeamId(id);
                setIsTeamsSheetOpen(false);
                if (pathname !== "/home") {
                  router.push("/home");
                }
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      <NewBountyModal
        open={isNewBountyModalOpen}
        onOpenChange={setIsNewBountyModalOpen}
        onSuccess={() => setIsNewBountyModalOpen(false)}
        onCancel={() => setIsNewBountyModalOpen(false)}
      />

      <BottomTabBar
        onNewBounty={handleNewBounty}
        newBountyBlocked={taskCreationBlocked}
        onOpenTeams={handleOpenTeams}
        teamsActive={isTeamsActive}
      />
    </div>
  );
}
