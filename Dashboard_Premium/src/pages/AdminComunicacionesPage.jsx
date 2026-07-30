import AdminComunicaciones from '../components/AdminComunicaciones';
import AdminShell from '../components/AdminShell';
import { useAuth } from '../AuthContext';
import { fetchTodosLosAtletas } from '../api/atletasService';
import { useState, useEffect, useCallback } from 'react';

export default function AdminComunicacionesPage() {
  const { user } = useAuth();
  const [atletas, setAtletas] = useState([]);
  const load = useCallback(async () => {
    try {
      const data = await fetchTodosLosAtletas(user);
      setAtletas(data);
    } catch (e) {
      // rutas-01: fetchTodosLosAtletas ya no traga sus propios errores de
      // Supabase; sin este catch, un fallo de red/RLS quedaría como una
      // excepción sin manejar. Fallback explícito, mismo resultado visible
      // que antes (lista vacía) — sin banner propio en esta página.
      console.error('AdminComunicacionesPage: fallo al cargar atletas', e);
      setAtletas([]);
    }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  return (
    <AdminShell padding="">
      <AdminComunicaciones user={user} atletas={atletas} />
    </AdminShell>
  );
}
