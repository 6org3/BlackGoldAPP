import { useEffect } from 'react';
import { fetchMisiones } from '../api/misionesService';

// ── Carga misiones ──────────────────────
export function useMisionesPanelMisiones(atletaId, setMisiones, setLoading) {
  useEffect(() => {
    // Flag de cancelación: una respuesta tardía no debe pisar el estado
    // de un componente desmontado ni los datos de otro atleta.
    let alive = true;
    setLoading(true);
    fetchMisiones(atletaId).then(data => {
      if (alive) {
        setMisiones(data);
        setLoading(false);
      }
    });
    return () => { alive = false; };
  }, [atletaId, setMisiones, setLoading]);
}
