"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useBounty } from "@/lib/bounty-context";
import { Loader2 } from "lucide-react";

export default function BountyRedirectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { currentUser, isLoading } = useBounty();

  useEffect(() => {
    if (isLoading) return; // wait for auth to resolve before deciding

    if (!currentUser) {
      // Not logged in — bounce to login, then back here after
      router.replace(`/login?next=${encodeURIComponent(`/bounties/${id}`)}`);
      return;
    }

    const target = currentUser.role === "ADMIN" ? "/admin" : "/home";
    router.replace(`${target}?bounty=${id}`);
  }, [isLoading, currentUser, id, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );
}
