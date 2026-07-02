import { useEffect } from 'react';
import { fetchSesionesAtleta } from '../api/sesionesEntrenamientoService';
import { supabase } from '../api/supabaseClient';

// ── Carga sesión y observación del día ──
export function useMisionesPanelSesionYObservacion(
  atletaId,
  setSesionHoy,
  setEvaValue,
  setIsRpeLocked,
  setObservacionHoy
) {
  useEffect(() => {
    const loadSesion = async () => {
      const { data: ad } = await supabase
        .from('atletas')
        .select('id')
        .eq('usuario_id', atletaId)
        .single();
      if (!ad) return;

      const sesiones = await fetchSesionesAtleta(ad.id);
      const today = new Date().toISOString().split('T')[0];

      if (sesiones.length > 0) {
        const sesionDeHoy = sesiones.find(s => s.fecha && s.fecha.startsWith(today));
        if (sesionDeHoy) {
          setSesionHoy(sesionDeHoy);
          setEvaValue(sesionDeHoy.eva_registro || 0);
          if (sesionDeHoy.eva_registro > 0) setIsRpeLocked(true);
        }
      }

      const { data: observaciones } = await supabase
        .from('observaciones_cancha')
        .select('*')
        .eq('atleta_id', ad.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (observaciones?.length) {
        const obsDeHoy = observaciones.find(o => o.created_at?.startsWith(today));
        if (obsDeHoy) setObservacionHoy(obsDeHoy);
      }
    };
    loadSesion();
  }, [atletaId]);
}

// ── Handler de guardar RPE ──────────────
export async function handleSaveEva({
  sesionHoy,
  isRpeLocked,
  evaValue,
  setEvaSaved,
  setIsRpeLocked,
  setEvaAlert,
}) {
  if (!sesionHoy || isRpeLocked) return;
  await supabase
    .from('sesiones_entrenamiento')
    .update({ eva_registro: evaValue })
    .eq('id', sesionHoy.id);
  setEvaSaved(true);
  setIsRpeLocked(true);
  if (evaValue >= 9) setEvaAlert(true);
  setTimeout(() => setEvaSaved(false), 3000);
}
