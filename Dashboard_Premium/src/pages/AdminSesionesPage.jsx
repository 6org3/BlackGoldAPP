import AdminSesiones from '../components/AdminSesiones';
import AdminShell from '../components/AdminShell';
import { useAuth } from '../AuthContext';
import { fetchTodosLosAtletas } from '../api/atletasService';
import { useState, useEffect, useCallback } from 'react';

export default function AdminSesionesPage() {
  const { user } = useAuth();
  const [atletas, setAtletas] = useState([]);
  const load = useCallback(async () => {
    try {
      const data = await fetchTodosLosAtletas(user);
      setAtletas(data);
    } catch (e) {
      // rutas-01: fallback explícito — mismo resultado visible que antes
      // (lista vacía) en vez de una excepción sin manejar.
      console.error('AdminSesionesPage: fallo al cargar atletas', e);
      setAtletas([]);
    }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  return (
    <AdminShell padding="">
      <AdminSesiones user={user} atletas={atletas} />
    </AdminShell>
  );
}
