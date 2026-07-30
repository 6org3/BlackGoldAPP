import { useEffect } from 'react';
import { fetchSesionesAtleta } from '../api/sesionesEntrenamientoService';
import { supabase } from '../api/supabaseClient';
import { hoyLocal, claveDiaLocal } from '../lib/fechasLocal';

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
      // lote 3: sesiones_entrenamiento.fecha ya se escribe en día LOCAL
      // (Ecuador UTC-5) desde canchaData.js#startSession y
      // AdminPlanificacion.jsx#sesionPayloadDesdeForm — el INSERT ya no
      // depende del DEFAULT CURRENT_DATE del servidor (evaluado en UTC), así
      // que esta comparación pasa a hoyLocal() para que una sesión de la
      // tarde/noche siga reconociéndose como "de hoy" al revisarla ya entrada
      // la noche en Ecuador (mismo caso que obsDeHoy más abajo).
      const hoy = hoyLocal();

      if (sesiones.length > 0) {
        const sesionDeHoy = sesiones.find(s => s.fecha && s.fecha.startsWith(hoy));
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
        // created_at sí es un timestamp real (siempre `now()`, sin ambigüedad
        // de escritura): el día que importa es el LOCAL de quien lo lee, no el
        // prefijo UTC crudo — una observación de esta mañana dejaba de
        // reconocerse como "de hoy" al revisarla ya entrada la noche en Ecuador.
        const obsDeHoy = observaciones.find(o => o.created_at && claveDiaLocal(o.created_at) === hoyLocal());
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
