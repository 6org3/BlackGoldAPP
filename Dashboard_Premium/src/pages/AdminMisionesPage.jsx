import AdminShell from '../components/AdminShell';
import AdminMisiones from '../components/AdminMisiones';

export default function AdminMisionesPage() {
  return (
    <AdminShell conGlow padding="p-6 md:p-12">
      <AdminMisiones />
    </AdminShell>
  );
}
