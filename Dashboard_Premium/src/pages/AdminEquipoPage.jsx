import AdminShell from '../components/AdminShell';
import AdminEquipo from '../components/AdminEquipo';
import { useAuth } from '../AuthContext';

export default function AdminEquipoPage() {
  const { user } = useAuth();
  return (
    <AdminShell>
      <AdminEquipo user={user} />
    </AdminShell>
  );
}
