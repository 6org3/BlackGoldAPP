import { useCallback, useEffect, useState } from 'react';
import AdminShell from '../components/AdminShell';
import AdminAtletas from '../components/AdminAtletas';
import { fetchTodosLosAtletas } from '../api/atletasService';
import { useAuth } from '../AuthContext';

export default function AdminAtletasPage() {
  const { user } = useAuth();
  const [atletas, setAtletas] = useState([]);
  const [errorCarga, setErrorCarga] = useState('');

  const loadAtletas = useCallback(async () => {
    // 'Todos': esta es la pantalla de GESTIÓN — cuenta y compara también a los
    // dados de baja (el resto de la app ve solo el plantel activo, v34).
    try {
      const data = await fetchTodosLosAtletas(user, { estadoMembresia: 'Todos' });
      setAtletas(data);
      setErrorCarga('');
    } catch (e) {
      // rutas-01: fetchTodosLosAtletas ya no traga un error de Supabase como
      // si el club tuviera 0 atletas — sin este catch, un fallo de red/RLS
      // se pintaría igual de vacío que antes, solo que ahora como una
      // excepción sin manejar. Reintentar reintenta la misma carga.
      console.error('AdminAtletasPage: fallo al cargar el plantel', e);
      setErrorCarga('No pudimos cargar el plantel. Puede ser un problema de conexión.');
    }
  }, [user]);

  useEffect(() => { loadAtletas(); }, [loadAtletas]);

  return (
    <AdminShell conGlow>
      <AdminAtletas atletas={atletas} onRefresh={loadAtletas} user={user} errorCarga={errorCarga} />
    </AdminShell>
  );
}
