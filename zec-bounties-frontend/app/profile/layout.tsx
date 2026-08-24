import { MobileNavShell } from "@/components/layout/mobile-nav-shell";

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MobileNavShell>{children}</MobileNavShell>;
}
