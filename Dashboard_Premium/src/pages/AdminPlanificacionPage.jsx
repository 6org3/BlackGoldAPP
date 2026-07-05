import AdminPlanificacion from '../components/AdminPlanificacion';
import Sidebar from '../components/Sidebar';

export default function AdminPlanificacionPage() {
  return (
    <div className="flex h-dvh bg-surface-base overflow-hidden text-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-12">
        <AdminPlanificacion />
      </main>
    </div>
  );
}
