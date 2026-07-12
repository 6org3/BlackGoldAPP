import { useCallback, useEffect, useState } from 'react';
import AdminShell from '../components/AdminShell';
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
    <AdminShell conGlow>
      <AdminAtletas atletas={atletas} onRefresh={loadAtletas} user={user} />
    </AdminShell>
  );
}
