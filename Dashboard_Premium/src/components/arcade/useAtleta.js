import { useReducer, useEffect, useMemo, useRef, useState } from 'react';
import { ATLETA_MOCK, MINI_QUIZ } from './atletaMock';
import { fetchAtletaPanel, completarMision, responderRSVP } from './atletaData';

/**
 * Máquina de estado del portal Atleta (port del reducer del prototipo).
 * Fase 5: con `user` atleta carga el panel real (misiones/eventos/pilares/XP) y
 * las acciones enviar/RSVP ESCRIBEN en Supabase. Sin user (o rol ≠ atleta) corre
 * 100% con ATLETA_MOCK para preview aislada.
 */

const initialState = {
  aTab: 'inicio', // 'inicio'|'misiones'|'progreso'|'eventos'
  aDetalle: false,
  detalleId: null,
  aQuiz: {}, // { [preguntaIdx]: opcionIdx }
  aMisionEstados: {}, // overrides tras aceptar/enviar: { [misionId]: estado }
  aFiltro: 'todas', // 'todas'|'cancha'|'casa'|'lugar'
  aVoy: {}, // overrides de RSVP: { [convocadoId]: boolean }
  aPilar: 'explosividad',
};

function reducer(state, action) {
  switch (action.type) {
    case 'GO_TAB':
      return { ...state, aTab: action.tab, aDetalle: false };
    case 'OPEN_DETALLE':
      return { ...state, aTab: 'misiones', aDetalle: true, detalleId: action.id, aQuiz: {} };
    case 'BACK':
      return { ...state, aDetalle: false };
    case 'ANSWER':
      return { ...state, aQuiz: { ...state.aQuiz, [action.q]: action.i } };
    case 'ENVIAR':
      return { ...state, aMisionEstados: { ...state.aMisionEstados, [action.id]: 'revision' } };
    case 'ACEPTAR':
      return { ...state, aMisionEstados: { ...state.aMisionEstados, [action.id]: 'activa' } };
    case 'FILTRAR':
      return { ...state, aFiltro: action.f };
    case 'SET_VOY':
      return { ...state, aVoy: { ...state.aVoy, [action.id]: action.val } };
    case 'PILAR_PICK':
      return { ...state, aPilar: action.k };
    default:
      return state;
  }
}

export default function useAtleta(user) {
  const isReal = !!(user && user.rol === 'atleta');
  const [state, dispatch] = useReducer(reducer, initialState);
  const [data, setData] = useState(() => (isReal ? null : ATLETA_MOCK));
  const [loading, setLoading] = useState(isReal);

  // Refs con el último estado/datos para leerlos dentro de acciones async
  // (guards de envío/RSVP) sin recrear el objeto de acciones en cada cambio.
  const stateRef = useRef(state);
  const dataRef = useRef(data);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Solo el modo real hidrata (el demo ya nace con ATLETA_MOCK/loading=false en
  // el init). El estado se escribe únicamente tras el await, nunca de forma
  // síncrona dentro del efecto (regla react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!isReal) return undefined;
    let alive = true;
    fetchAtletaPanel(user)
      .then((d) => {
        if (alive) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) {
          setData(ATLETA_MOCK); // degradación defensiva
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [isReal, user]);

  const goingDe = (id) => (dataRef.current?.eventos || []).find((e) => e.id === id)?.going || false;

  const actions = useMemo(
    () => ({
      goTab: (tab) => dispatch({ type: 'GO_TAB', tab }),
      openDetalle: (id) => dispatch({ type: 'OPEN_DETALLE', id }),
      back: () => dispatch({ type: 'BACK' }),
      answer: (q, i) => dispatch({ type: 'ANSWER', q, i }),
      aceptar: (id) => dispatch({ type: 'ACEPTAR', id }),
      filtrar: (f) => dispatch({ type: 'FILTRAR', f }),
      pilarPick: (k) => dispatch({ type: 'PILAR_PICK', k }),
      enviar: async (id) => {
        const s = stateRef.current;
        if (!id) return;
        if (Object.keys(s.aQuiz).length < MINI_QUIZ.length) return; // quiz incompleto
        if (s.aMisionEstados[id] === 'revision') return; // ya enviada en esta sesión
        dispatch({ type: 'ENVIAR', id });
        if (isReal) {
          try {
            await completarMision(user.id, id); // marca completada + pendiente_aprobacion
          } catch {
            /* la UI ya marcó enviada; el write se puede reintentar */
          }
        }
      },
      voyToggle: async (id) => {
        const s = stateRef.current;
        const cur = s.aVoy[id] ?? goingDe(id);
        const next = !cur;
        dispatch({ type: 'SET_VOY', id, val: next });
        if (isReal) {
          try {
            await responderRSVP(id, next ? 'asiste' : 'pendiente', user.id);
          } catch {
            dispatch({ type: 'SET_VOY', id, val: cur }); // revertir en error
          }
        }
      },
    }),
    [isReal, user],
  );

  return { state, data, actions, loading, isReal };
}
