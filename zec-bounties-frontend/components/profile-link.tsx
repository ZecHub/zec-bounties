"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { profileHref } from "@/lib/profileHref";

type ProfileUser = {
  id?: string | null;
  name?: string | null;
  nickname?: string | null;
};

export function ProfileLink({
  user,
  className,
  children,
}: {
  user?: ProfileUser | null;
  className?: string;
  children: ReactNode;
}) {
  if (!user?.id) {
    return <>{children}</>;
  }

  return (
    <Link
      href={profileHref({
        id: user.id,
        name: user.name,
        nickname: user.nickname,
      })}
      title="View profile"
      className={className ?? "hover:underline hover:text-primary"}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </Link>
  );
}
