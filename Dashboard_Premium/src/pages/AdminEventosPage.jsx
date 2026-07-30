import AdminEventos from '../components/AdminEventos';
import AdminShell from '../components/AdminShell';
import { useAuth } from '../AuthContext';
import { fetchTodosLosAtletas } from '../api/atletasService';
import { calcularCategoriaFEB } from '../api/utilsAtletas';
import { useState, useEffect, useCallback } from 'react';

export default function AdminEventosPage() {
  const { user } = useAuth();
  const [atletas, setAtletas] = useState([]);
  const load = useCallback(async () => {
    try {
      const data = await fetchTodosLosAtletas(user);
      const conCat = (data || []).map((a) => ({
        ...a,
        categoria: calcularCategoriaFEB(a.fecha_nacimiento || a.edad) || a.categoria,
      }));
      setAtletas(conCat);
    } catch (e) {
      // rutas-01: fallback explícito — mismo resultado visible que antes
      // (lista vacía) en vez de una excepción sin manejar.
      console.error('AdminEventosPage: fallo al cargar atletas', e);
      setAtletas([]);
    }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  return (
    <AdminShell padding="">
      <AdminEventos user={user} atletas={atletas} />
    </AdminShell>
  );
}
