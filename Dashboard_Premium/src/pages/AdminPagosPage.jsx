import AdminPagos from '../components/AdminPagos';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../AuthContext';
import { fetchTodosLosAtletas } from '../api/atletasService';
import { useState, useEffect, useCallback } from 'react';

export default function AdminPagosPage() {
  const { user } = useAuth();
  const [atletas, setAtletas] = useState([]);
  const load = useCallback(async () => {
    const data = await fetchTodosLosAtletas(user);
    setAtletas(data);
  }, [user]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex h-dvh bg-[#09090b] overflow-hidden text-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden pb-[env(safe-area-inset-bottom)]">
        <AdminPagos user={user} atletas={atletas} />
      </main>
    </div>
  );
}
