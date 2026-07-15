import { useCallback, useEffect, useState } from 'react';
import AdminShell from '../components/AdminShell';
import AdminAtletas from '../components/AdminAtletas';
import { fetchTodosLosAtletas } from '../api/atletasService';
import { useAuth } from '../AuthContext';

export default function AdminAtletasPage() {
  const { user } = useAuth();
  const [atletas, setAtletas] = useState([]);

  const loadAtletas = useCallback(async () => {
    // 'Todos': esta es la pantalla de GESTIÓN — cuenta y compara también a los
    // dados de baja (el resto de la app ve solo el plantel activo, v34).
    const data = await fetchTodosLosAtletas(user, { estadoMembresia: 'Todos' });
    setAtletas(data);
  }, [user]);

  useEffect(() => { loadAtletas(); }, [loadAtletas]);

  return (
    <AdminShell conGlow>
      <AdminAtletas atletas={atletas} onRefresh={loadAtletas} user={user} />
    </AdminShell>
  );
}
