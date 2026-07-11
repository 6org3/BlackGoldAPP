import AdminAsistencia from '../components/AdminAsistencia';
import AdminShell from '../components/AdminShell';
import { useAuth } from '../AuthContext';
import { fetchTodosLosAtletas } from '../api/atletasService';
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
    <AdminShell padding="" fabElevado>
      <AdminAsistencia user={user} atletas={atletas} />
    </AdminShell>
  );
}
