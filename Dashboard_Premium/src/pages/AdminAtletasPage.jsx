import { useCallback, useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import AdminAtletas from '../components/AdminAtletas';
import { fetchTodosLosAtletas } from '../api/atletasService';
import { useAuth } from '../AuthContext';

export default function AdminAtletasPage() {
  const { user } = useAuth();
  const [atletas, setAtletas] = useState([]);

  const loadAtletas = useCallback(async () => {
    const data = await fetchTodosLosAtletas(user);
    setAtletas(data);
  }, [user]);

  useEffect(() => { loadAtletas(); }, [loadAtletas]);

  return (
    <div className="flex h-dvh bg-surface-base overflow-hidden text-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-10 pb-[calc(env(safe-area-inset-bottom)+24px)] relative z-0">
        {/* Premium ambient glow */}
        <div className="absolute top-[-20%] left-[10%] w-[800px] h-[600px] bg-brand/5 blur-[150px] pointer-events-none rounded-full mix-blend-screen"></div>
        <AdminAtletas atletas={atletas} onRefresh={loadAtletas} user={user} />
      </main>
    </div>
  );
}
