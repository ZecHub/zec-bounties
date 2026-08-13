"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function BountyRedirectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    let target = "/home"; // default: guests and clients both land here

    try {
      const cached = localStorage.getItem("currentUser");
      if (cached) {
        const user = JSON.parse(cached);
        if (user?.role === "ADMIN") target = "/admin/bounties";
      }
    } catch {
      // malformed/missing cache — fall back to /home
    }

    router.replace(`${target}?bounty=${id}`);
  }, [id, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );
}
