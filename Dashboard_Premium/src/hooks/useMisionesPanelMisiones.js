import { useEffect } from 'react';
import { fetchMisiones } from '../api/misionesService';

// ── Carga misiones ──────────────────────
export function useMisionesPanelMisiones(atletaId, setMisiones, setLoading) {
  useEffect(() => {
    const load = async () => {
      const data = await fetchMisiones(atletaId);
      setMisiones(data);
      setLoading(false);
    };
    load();
  }, [atletaId]);
}
