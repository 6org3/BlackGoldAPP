import { useEffect, useRef } from 'react';
import { supabase } from '../api/supabaseClient';
import { fetchMisiones } from '../api/misionesService';
import { getXPProgress } from '../lib/xpProgress';

// ── Realtime: detectar subida de XP / level-up ──
// Usa el id de fila que ya trae atletaData (resuelto por useMisionesPanelAtletaData)
// en vez de re-consultar `atletas`; al ser la suscripción síncrona, el cleanup
// siempre ve el canal creado y no se fugan suscripciones al cambiar de pestaña.
export function useMisionesPanelXPWatch(atletaId, atletaData, setAtletaData, setLevelUpRango, setMisiones) {
  const lastXPRef = useRef(null);
  const atletaRowId = atletaData?.id;

  useEffect(() => {
    if (!atletaRowId) return;

    const channel = supabase
      .channel(`xp-watch-${atletaRowId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'atletas',
        filter: `id=eq.${atletaRowId}`,
      }, (payload) => {
        const newXP = payload.new?.xp_total ?? 0;
        const oldXP = lastXPRef.current ?? 0;

        if (newXP > oldXP) {
          const oldRango = getXPProgress(oldXP).currentRango;
          const newRango = getXPProgress(newXP).currentRango;

          if (newRango.id !== oldRango.id) {
            setLevelUpRango(newRango);
          }

          // Actualizar XP local + recargar misiones (pueden haber pasado a 'aprobada')
          setAtletaData(prev => prev ? { ...prev, xp_total: newXP } : prev);
          fetchMisiones(atletaId).then(setMisiones);
        }

        lastXPRef.current = newXP;
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [atletaId, atletaRowId, setAtletaData, setLevelUpRango, setMisiones]);

  // Inicializar ref cuando carguen los datos
  useEffect(() => {
    if (atletaData && lastXPRef.current === null) {
      lastXPRef.current = atletaData.xp_total || 0;
    }
  }, [atletaData]);
}
