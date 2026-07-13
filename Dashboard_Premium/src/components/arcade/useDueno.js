import { useReducer, useEffect, useMemo, useState } from 'react';
import { DUENO_MOCK } from './duenoMock';
import { fetchDuenoPanel } from './duenoData';
import { marcarBaja } from '../../api/retencionService';

/**
 * Máquina de estado del panel Dueño (port del reducer del prototipo). Con `user`
 * owner/superadmin carga el panel real (KPIs/finanzas/asistencia reales sobre
 * mock); sin ese rol corre 100% con DUENO_MOCK para preview aislada.
 *
 * Las acciones idempotentes (verificar/recordar/contactar) por ahora SOLO cambian
 * el estado local (feedback visual del prototipo). TODO fase siguiente: cablear la
 * mutación real (resolverComprobante / WhatsApp recordatorio / contacto en riesgo).
 */
const initialState = {
  dTab: 'resumen', // 'resumen'|'finanzas'|'asistencia'|'equipo'|'retencion'
  dMes: 'jul', // 'may'|'jun'|'jul'
  dCat: 'todas', // 'todas'|'s14'|'s16'|'s18'
  dSort: 'asist', // 'asist'|'ses'|'xp'
  dHeat: '0-2', // "díaIdx-franjaIdx"
  dRecordados: {},
  dVerificados: {},
  dContactados: {},
  dBajaArmar: null, // id de atleta con la baja "armada" (esperando confirmación)
  dBajas: {}, // atletas dados de baja en esta sesión (feedback optimista)
};

function reducer(state, action) {
  switch (action.type) {
    case 'GO_TAB':
      return { ...state, dTab: action.tab };
    case 'PICK_MES':
      return { ...state, dMes: action.mes };
    case 'PICK_CAT':
      return { ...state, dCat: action.cat };
    case 'SORT_BY':
      return { ...state, dSort: action.key };
    case 'HEAT_PICK':
      return { ...state, dHeat: action.key };
    case 'RECORDAR':
      return { ...state, dRecordados: { ...state.dRecordados, [action.id]: true } };
    case 'VERIFICAR':
      return { ...state, dVerificados: { ...state.dVerificados, [action.id]: true } };
    case 'CONTACTAR':
      return { ...state, dContactados: { ...state.dContactados, [action.id]: true } };
    case 'ARM_BAJA':
      // Toca "dar de baja" una vez → arma la confirmación de ESA fila (desarma otras).
      return { ...state, dBajaArmar: action.id };
    case 'DAR_BAJA':
      return { ...state, dBajas: { ...state.dBajas, [action.id]: true }, dBajaArmar: null };
    case 'REVERT_BAJA': {
      const nb = { ...state.dBajas };
      delete nb[action.id];
      return { ...state, dBajas: nb };
    }
    default:
      return state;
  }
}

export default function useDueno(user) {
  const isReal = !!(user && (user.rol === 'owner' || user.rol === 'superadmin'));
  const [state, dispatch] = useReducer(reducer, initialState);
  const [data, setData] = useState(() => (isReal ? null : DUENO_MOCK));
  const [loading, setLoading] = useState(isReal);
  // `version` fuerza un refetch tras una acción que muta datos (dar de baja):
  // no se toca `loading` para no mostrar "CARGANDO…" en un refresco puntual.
  const [version, setVersion] = useState(0);

  // Solo el modo real hidrata (el demo nace con DUENO_MOCK/loading=false en el
  // init). El estado se escribe únicamente tras el await (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!isReal) return undefined;
    let alive = true;
    fetchDuenoPanel(user)
      .then((d) => {
        if (alive) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setData(DUENO_MOCK);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [isReal, user, version]);

  const actions = useMemo(
    () => ({
      goTab: (tab) => dispatch({ type: 'GO_TAB', tab }),
      pickMes: (mes) => dispatch({ type: 'PICK_MES', mes }),
      pickCat: (cat) => dispatch({ type: 'PICK_CAT', cat }),
      sortBy: (key) => dispatch({ type: 'SORT_BY', key }),
      heatPick: (key) => dispatch({ type: 'HEAT_PICK', key }),
      // Idempotentes: cambio de estilo/etiqueta. TODO: mutación real en Supabase.
      verificar: (id) => dispatch({ type: 'VERIFICAR', id }),
      recordar: (id) => dispatch({ type: 'RECORDAR', id }),
      contactar: (id) => dispatch({ type: 'CONTACTAR', id }),
      // Dar de baja (dos toques): 1º arma la confirmación, 2º ejecuta.
      armBaja: (id) => dispatch({ type: 'ARM_BAJA', id }),
      darBaja: async (id) => {
        dispatch({ type: 'DAR_BAJA', id }); // optimista: la fila pasa a "dado de baja"
        if (isReal) {
          try {
            await marcarBaja(id, true); // UPDATE estado_membresia='baja' + fecha_baja
            setVersion((v) => v + 1); // refetch → gauge/activos/altas-bajas reales
          } catch {
            dispatch({ type: 'REVERT_BAJA', id }); // revertir el feedback si el write falla
          }
        }
      },
    }),
    [isReal],
  );

  return { state, data, actions, loading, isReal };
}
