import AdminPagos from './AdminPagos';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../AuthContext';
import { fetchTodosLosAtletas } from '../api/sheetsService';
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
    <div className="flex h-screen bg-[#09090b] overflow-hidden text-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <AdminPagos user={user} atletas={atletas} />
      </main>
    </div>
  );
}
