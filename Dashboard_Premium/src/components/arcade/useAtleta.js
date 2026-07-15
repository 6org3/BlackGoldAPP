import { useReducer, useEffect, useMemo, useRef, useState } from 'react';
import { fetchReadinessHoy, checkinDisponible } from '../../api/readinessService';
import { ATLETA_MOCK, MINI_QUIZ } from './atletaMock';
import { fetchAtletaPanel, completarMision, responderRSVP, alertaReadiness } from './atletaData';

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
  // Check-in de readiness del día. `aReadiness`: undefined = aún sin consultar
  // (la tarjeta no se pinta), null = sin registro hoy, objeto = ya lo hizo.
  aReadiness: undefined,
  aReadinessDisponible: false, // gate horario resuelto al consultar (>= 6:00)
  aReadinessOpen: false,
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
    case 'READINESS_HOY':
      // `abrir` solo llega true desde la consulta inicial (sin registro + gate
      // horario abierto); al completar el check-in llega sin él → deja cerrado.
      return {
        ...state,
        aReadiness: action.data,
        aReadinessDisponible: action.disponible ?? state.aReadinessDisponible,
        aReadinessOpen: !!action.abrir,
      };
    case 'READINESS_OPEN':
      return { ...state, aReadinessOpen: true };
    case 'READINESS_CLOSE':
      return { ...state, aReadinessOpen: false };
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

  // Check-in de readiness del día. Se consulta fresco (no se usa
  // user.readiness_hoy, que se resolvió al hacer login y quedaría de ayer en una
  // sesión que cruza la medianoche). Sin registro y pasadas las 6:00 el modal se
  // auto-abre, como hacía el shell legacy: mientras no haya check-in, cada
  // entrada al portal lo vuelve a pedir.
  useEffect(() => {
    if (!isReal || !user.atleta_id) return undefined;
    let alive = true;
    const disponible = checkinDisponible();
    fetchReadinessHoy(user.atleta_id)
      .then((r) => {
        if (alive) dispatch({ type: 'READINESS_HOY', data: r || null, disponible, abrir: !r && disponible });
      })
      .catch(() => {
        // Sin lectura no se interrumpe al atleta con el modal, pero la tarjeta
        // sigue ofreciendo el check-in: si ya existe, el UNIQUE (atleta_id,
        // fecha) lo rechaza con "Ya realizaste tu Check-in de Readiness hoy".
        if (alive) dispatch({ type: 'READINESS_HOY', data: null, disponible });
      });
    return () => {
      alive = false;
    };
  }, [isReal, user?.atleta_id]);

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
      abrirReadiness: () => dispatch({ type: 'READINESS_OPEN' }),
      cerrarReadiness: () => dispatch({ type: 'READINESS_CLOSE' }),
      readinessCompletado: (registro) => {
        dispatch({ type: 'READINESS_HOY', data: registro || null });
        // La alerta IA de la Base se deriva del readiness del día: recalcularla
        // aquí la actualiza al instante (p.ej. orina >= 5 → "toma 2L"), sin
        // esperar al próximo login, que es de donde sale user.readiness_hoy.
        if (isReal) {
          setData((d) => (d ? { ...d, alertaIA: alertaReadiness({ ...user, readiness_hoy: registro }) } : d));
        }
      },
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
