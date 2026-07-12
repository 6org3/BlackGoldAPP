import AdminPagos from '../components/AdminPagos';
import AdminShell from '../components/AdminShell';
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
    <AdminShell padding="">
      <AdminPagos user={user} atletas={atletas} />
    </AdminShell>
  );
}
