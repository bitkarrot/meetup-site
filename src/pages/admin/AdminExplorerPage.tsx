import { Navigate } from 'react-router-dom';
import AdminExplorer from "@/components/admin/AdminExplorer";
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAdminAuth } from '@/hooks/useRemoteNostrJson';
import { RefreshCw } from 'lucide-react';

export default function AdminExplorerPage() {
  const { user } = useCurrentUser();
  const { isMaster, isLoading } = useAdminAuth(user?.pubkey);

  // Explorer is restricted to the relay owner only (isMaster).
  // See AdminLayout for the rationale on why adminRoles is not used.
  const canAccessExplorer = isMaster;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canAccessExplorer) {
    return <Navigate to="/admin" replace />;
  }

  return <AdminExplorer />;
}
