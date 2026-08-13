import { ProtectedRoute } from "@/components/auth/protected-route";
import { Navbar } from "@/components/layout/navbar";

export default function TeamLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProtectedRoute requireTeam>{children}</ProtectedRoute>;
}
