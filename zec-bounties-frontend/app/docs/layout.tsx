"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";
import { cn } from "@/lib/utils";
import { BookOpen } from "lucide-react";

const NAV = [
  { href: "/docs", label: "Overview", exact: true },
  { href: "/docs/getting-started", label: "Getting started" },
  { href: "/docs/addresses", label: "Addresses" },
  { href: "/docs/hunters", label: "Hunters" },
  { href: "/docs/teams", label: "Teams" },
  { href: "/docs/contributors", label: "Contributors" },
  { href: "/docs/creators", label: "Creators" },
  { href: "/docs/privacy-payments", label: "Privacy & payments" },
  { href: "/docs/badges", label: "Badges" },
  { href: "/docs/faq", label: "FAQ" },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 py-8 flex gap-10">
        <aside className="hidden md:block w-52 shrink-0">
          <div className="sticky top-20 space-y-1">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 px-2">
              <BookOpen className="h-3.5 w-3.5" />
              Docs
            </p>
            {NAV.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "block rounded-md px-2 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-accent text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </aside>

        <div className="min-w-0 flex-1 max-w-2xl">{children}</div>
      </div>
    </main>
  );
}
