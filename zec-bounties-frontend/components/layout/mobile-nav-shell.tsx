"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useBounty } from "@/lib/bounty-context";
import { BottomTabBar } from "@/components/layout/bottom-tab-bar";
import { NewBountyModal } from "@/components/new-bounty-modal";

export function MobileNavShell({ children }: { children: React.ReactNode }) {
  const { currentUser } = useBounty();
  const router = useRouter();
  const [isNewBountyModalOpen, setIsNewBountyModalOpen] = useState(false);

  const handleNewBounty = () => {
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

  return (
    <div className="pb-20 md:pb-0">
      {children}

      <NewBountyModal
        open={isNewBountyModalOpen}
        onOpenChange={setIsNewBountyModalOpen}
        onSuccess={() => setIsNewBountyModalOpen(false)}
        onCancel={() => setIsNewBountyModalOpen(false)}
      />

      <BottomTabBar onNewBounty={handleNewBounty} />
    </div>
  );
}
