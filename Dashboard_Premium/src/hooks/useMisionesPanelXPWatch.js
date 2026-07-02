import { useEffect, useRef } from 'react';
import { supabase } from '../api/supabaseClient';
import { fetchMisiones } from '../api/misionesService';
import { getXPProgress } from '../lib/xpProgress';

// ── Realtime: detectar subida de XP / level-up ──
export function useMisionesPanelXPWatch(atletaId, atletaData, setAtletaData, setLevelUpRango, setMisiones) {
  const lastXPRef = useRef(null);

  useEffect(() => {
    let channel;

    const subscribe = async () => {
      const { data: atletaRow } = await supabase
        .from('atletas')
        .select('id')
        .eq('usuario_id', atletaId)
        .single();

      if (!atletaRow) return;

      channel = supabase
        .channel(`xp-watch-${atletaRow.id}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'atletas',
          filter: `id=eq.${atletaRow.id}`,
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
    };

    subscribe();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [atletaId]);

  // Inicializar ref cuando carguen los datos
  useEffect(() => {
    if (atletaData && lastXPRef.current === null) {
      lastXPRef.current = atletaData.xp_total || 0;
    }
  }, [atletaData]);
}
