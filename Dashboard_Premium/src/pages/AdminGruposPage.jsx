import AdminShell from '../components/AdminShell';
import AdminGrupos from '../components/AdminGrupos';
import { useAuth } from '../AuthContext';

export default function AdminGruposPage() {
  const { user } = useAuth();
  return (
    <AdminShell>
      <AdminGrupos user={user} />
    </AdminShell>
  );
}
