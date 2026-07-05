import { useEffect } from 'react';
import { fetchSesionesAtleta } from '../api/sesionesEntrenamientoService';
import { supabase } from '../api/supabaseClient';

// ── Carga sesión y observación del día ──
// Recibe el id de la fila en `atletas` ya resuelto por
// useMisionesPanelAtletaData (evita repetir el lookup usuario→atleta).
export function useMisionesPanelSesionYObservacion(
  atletaRowId,
  setSesionHoy,
  setEvaValue,
  setIsRpeLocked,
  setObservacionHoy
) {
  useEffect(() => {
    if (!atletaRowId) return;

    const loadSesion = async () => {
      const sesiones = await fetchSesionesAtleta(atletaRowId);
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
        .eq('atleta_id', atletaRowId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (observaciones?.length) {
        const obsDeHoy = observaciones.find(o => o.created_at?.startsWith(today));
        if (obsDeHoy) setObservacionHoy(obsDeHoy);
      }
    };
    loadSesion();
  }, [atletaRowId, setSesionHoy, setEvaValue, setIsRpeLocked, setObservacionHoy]);
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
