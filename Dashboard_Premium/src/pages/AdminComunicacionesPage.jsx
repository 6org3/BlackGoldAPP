import AdminComunicaciones from '../components/AdminComunicaciones';
import AdminShell from '../components/AdminShell';
import { useAuth } from '../AuthContext';
import { fetchTodosLosAtletas } from '../api/atletasService';
import { useState, useEffect, useCallback } from 'react';

export default function AdminComunicacionesPage() {
  const { user } = useAuth();
  const [atletas, setAtletas] = useState([]);
  const load = useCallback(async () => {
    const data = await fetchTodosLosAtletas(user);
    setAtletas(data);
  }, [user]);
  useEffect(() => { load(); }, [load]);

  return (
    <AdminShell padding="">
      <AdminComunicaciones user={user} atletas={atletas} />
    </AdminShell>
  );
}
