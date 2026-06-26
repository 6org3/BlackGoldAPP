import AdminEventos from './AdminEventos';
import Sidebar from '../components/Sidebar';
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
    <div className="flex h-screen bg-[#09090b] overflow-hidden text-white">
      <Sidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <AdminEventos user={user} atletas={atletas} />
      </main>
    </div>
  );
}
