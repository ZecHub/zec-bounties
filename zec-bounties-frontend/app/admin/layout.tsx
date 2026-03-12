import { ProtectedRoute } from "@/components/auth/protected-route";
import { WalletGuard } from "@/components/settings/wallet-guard";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute requireAdmin={true}>
      <WalletGuard>{children}</WalletGuard>
    </ProtectedRoute>
  );
}
