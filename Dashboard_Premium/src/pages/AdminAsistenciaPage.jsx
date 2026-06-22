import AdminAsistencia from '../pages/AdminAsistencia';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../AuthContext';
import { fetchTodosLosAtletas } from '../api/sheetsService';
import { useState, useEffect, useCallback } from 'react';

export default function AdminAsistenciaPage() {
  const { user } = useAuth();
  const [atletas, setAtletas] = useState([]);

  const loadData = useCallback(async () => {
    const data = await fetchTodosLosAtletas(user);
    setAtletas(data);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="flex h-screen bg-[#09090b] overflow-hidden text-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto relative z-0">
        <AdminAsistencia user={user} atletas={atletas} />
      </main>
    </div>
  );
}
