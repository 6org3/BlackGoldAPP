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
    const data = await fetchTodosLosAtletas(user);
    const conCat = (data || []).map((a) => ({
      ...a,
      categoria: calcularCategoriaFEB(a.fecha_nacimiento || a.edad) || a.categoria,
    }));
    setAtletas(conCat);
  }, [user]);
  useEffect(() => { load(); }, [load]);

  return (
    <AdminShell padding="">
      <AdminEventos user={user} atletas={atletas} />
    </AdminShell>
  );
}
