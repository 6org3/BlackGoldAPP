import { useReducer, useEffect, useMemo, useState } from 'react';
import { ROSTER, SEED_SESSIONS, LEVELS } from './canchaMock';
import {
  fetchRoster,
  fetchActiveSessions,
  fetchPlannedToday,
  fetchSessionAttendance,
  startSession,
  saveSubjectiveEval,
  closeClass,
} from './canchaData';

/**
 * Máquina de estados del flujo Modo Cancha (port del reducer del prototipo).
 * Fase 5: si hay `user` (coach), carga roster + sesiones activas reales y las
 * acciones start/saveEval/finish ESCRIBEN en Supabase (via canchaData). Sin
 * user, corre 100% con mocks (fallback defensivo sin sesión).
 *
 * El flujo Arcade es subjetivo: escribe observaciones_cancha + XP; NO mueve
 * overall_score (eso es el pipeline de pruebas objetivas, fuera de alcance).
 */

const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const initialState = (user) => ({
  step: 'cancha',
  classType: null,
  level: null,
  present: {},
  destacados: {},
  scores: {},
  evalTargetId: null,
  savedIds: {},
  sessions: user ? [] : SEED_SESSIONS.map((s) => ({ ...s })),
  focusedId: null,
  lastElapsed: 0,
  closingSession: null, // sesión que se está cerrando (para el write de cierre)
});

function reducer(state, action) {
  switch (action.type) {
    case 'TICK':
      if (!state.sessions.length) return state;
      return { ...state, sessions: state.sessions.map((x) => ({ ...x, elapsed: x.elapsed + 1 })) };

    case 'HYDRATE_SESSIONS':
      return { ...state, sessions: action.sessions };

    case 'PICK_TYPE': {
      const t = action.tipo;
      return { ...state, classType: t, step: t === '1v1' ? 'buscador' : 'nivel', present: {} };
    }

    case 'PICK_LEVEL':
      return { ...state, level: action.level, step: 'lista', present: {} };

    case 'CHOOSE_TOGGLE': {
      const cur = state.present[action.id];
      return { ...state, present: { ...state.present, [action.id]: cur ? undefined : 'P' } };
    }

    case 'TO_LISTA':
      return { ...state, step: 'lista' };

    case 'MARK':
      return { ...state, present: { ...state.present, [action.id]: action.val } };

    case 'ALL_PRESENT': {
      const list = action.roster;
      const present = { ...state.present };
      list.forEach((a) => {
        present[a.id] = 'P';
      });
      return { ...state, present };
    }

    // Sesión real ya creada en Supabase (payload = sesión mapeada).
    case 'ADD_SESSION':
      return { ...state, sessions: [...state.sessions, action.session], focusedId: action.session.id, step: 'activa' };

    // Sesión local (mock, sin backend).
    case 'START': {
      const sess = {
        id: action.id,
        label: action.label,
        block: state.level || (state.classType === '1v1' ? '1v1' : 'Sesión'),
        start: action.start,
        elapsed: 0,
        present: action.present,
        hue: 'gold',
        evaluable: true,
        notas: `[EN_CURSO] ${action.label}`,
      };
      return { ...state, sessions: [...state.sessions, sess], focusedId: action.id, step: 'activa' };
    }

    case 'OPEN_SESSION':
      return {
        ...state,
        focusedId: action.id,
        step: 'activa',
        // Reanudar: fusiona la asistencia reconstruida de la sesión.
        present: action.present ? { ...state.present, ...action.present } : state.present,
      };

    case 'FOCUS_SESSION':
      return { ...state, focusedId: action.id };

    case 'TERMINATE_EVAL': {
      const f = state.sessions.find((x) => x.id === action.id);
      return {
        ...state,
        sessions: state.sessions.filter((x) => x.id !== action.id),
        lastElapsed: f ? f.elapsed : 0,
        closingSession: f || null,
        step: 'cierre',
      };
    }

    case 'TERMINATE_BG': {
      const rest = state.sessions.filter((x) => x.id !== action.id);
      return { ...state, sessions: rest, focusedId: rest[0] ? rest[0].id : null, step: rest.length ? 'activa' : 'cancha' };
    }

    case 'FINISH':
      return { ...state, step: 'fin' };

    case 'RESET':
      return {
        ...state,
        step: 'cancha',
        classType: null,
        level: null,
        present: {},
        destacados: {},
        scores: {},
        evalTargetId: null,
        savedIds: {},
        focusedId: null,
        closingSession: null,
      };

    case 'BACK':
      switch (state.step) {
        case 'nivel':
        case 'buscador':
          return { ...state, step: 'cancha' };
        case 'lista':
          return { ...state, step: state.classType === '1v1' ? 'buscador' : 'nivel' };
        case 'cierre':
          return { ...state, step: 'cancha' };
        case 'evaluar':
          return { ...state, step: 'cierre' };
        default:
          return state;
      }

    case 'TOGGLE_DESTACADO':
      return { ...state, destacados: { ...state.destacados, [action.id]: !state.destacados[action.id] } };

    case 'OPEN_EVAL':
      return {
        ...state,
        evalTargetId: action.id,
        step: 'evaluar',
        scores: { ...state.scores, [action.id]: state.scores[action.id] || {} },
      };

    case 'SET_STAR': {
      const id = state.evalTargetId;
      const cur = state.scores[id] || {};
      return { ...state, scores: { ...state.scores, [id]: { ...cur, [action.axis]: action.val } } };
    }

    case 'SAVE_EVAL':
      return { ...state, savedIds: { ...state.savedIds, [state.evalTargetId]: true }, step: 'cierre' };

    default:
      return state;
  }
}

export default function useCanchaSession(user) {
  const [state, dispatch] = useReducer(reducer, user, initialState);
  const [roster, setRoster] = useState(() => (user ? [] : ROSTER));
  const [planned, setPlanned] = useState([]);
  const [loading, setLoading] = useState(!!user);
  const isReal = !!user;

  // Carga inicial de datos reales (roster + sesiones activas + agenda de hoy).
  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    Promise.all([fetchRoster(user), fetchActiveSessions(user), fetchPlannedToday(user)])
      .then(([r, sess, pl]) => {
        if (!alive) return;
        setRoster(r);
        setPlanned(pl);
        dispatch({ type: 'HYDRATE_SESSIONS', sessions: sess });
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [user]);

  // Un único ticker para todas las sesiones activas.
  useEffect(() => {
    const t = setInterval(() => dispatch({ type: 'TICK' }), 1000);
    return () => clearInterval(t);
  }, []);

  // Niveles con conteo real por nivel_desarrollo (o estático en mock).
  const levels = useMemo(
    () => LEVELS.map((l) => ({ ...l, count: isReal ? roster.filter((a) => a.nivel === l.name).length : l.count })),
    [roster, isReal],
  );

  const actions = useMemo(
    () => ({
      pickType: (tipo) => dispatch({ type: 'PICK_TYPE', tipo }),
      pickLevel: (level) => dispatch({ type: 'PICK_LEVEL', level }),
      chooseToggle: (id) => dispatch({ type: 'CHOOSE_TOGGLE', id }),
      toLista: () => dispatch({ type: 'TO_LISTA' }),
      mark: (id, val) => dispatch({ type: 'MARK', id, val }),
      allPresent: (list) => dispatch({ type: 'ALL_PRESENT', roster: list || [] }),
      start: async ({ classType, level, present, roster: r }) => {
        if (user) {
          try {
            const focusName = classType === '1v1' ? r.find((a) => present[a.id] === 'P')?.name : null;
            const session = await startSession({ user, classType, level, present, roster: r, focusName });
            dispatch({ type: 'ADD_SESSION', session });
            return;
          } catch {
            /* cae al arranque local para no bloquear la UI */
          }
        }
        const first = r.find((a) => present[a.id] === 'P');
        const label = classType === '1v1' && first ? `1v1 · ${first.name}` : 'Sub-16 · Físico';
        const presentCount = r.filter((a) => present[a.id] === 'P').length;
        dispatch({ type: 'START', id: `main-${Date.now()}`, start: hhmm(new Date()), label, present: presentCount });
      },
      openSession: async (id) => {
        if (user) {
          try {
            const present = await fetchSessionAttendance(id);
            dispatch({ type: 'OPEN_SESSION', id, present });
            return;
          } catch {
            /* sin asistencia reconstruida — se abre igual */
          }
        }
        dispatch({ type: 'OPEN_SESSION', id });
      },
      focusSession: (id) => dispatch({ type: 'FOCUS_SESSION', id }),
      terminateEval: (id) => dispatch({ type: 'TERMINATE_EVAL', id }),
      terminateBg: (id) => dispatch({ type: 'TERMINATE_BG', id }),
      finish: async ({ session, present }) => {
        if (user && session && String(session.id).indexOf('main-') !== 0) {
          // Todos los presentes (incluye los reconstruidos al reanudar), no solo
          // los del roster filtrado por nivel.
          const presentIds = Object.keys(present).filter((id) => present[id] === 'P');
          try {
            await closeClass({ session, presentAtletaIds: presentIds });
          } catch {
            /* la sesión queda en curso; se puede reintentar */
          }
        }
        dispatch({ type: 'FINISH' });
      },
      reset: () => dispatch({ type: 'RESET' }),
      back: () => dispatch({ type: 'BACK' }),
      toggleDestacado: (id) => dispatch({ type: 'TOGGLE_DESTACADO', id }),
      openEval: (id) => dispatch({ type: 'OPEN_EVAL', id }),
      setStar: (axis, val) => dispatch({ type: 'SET_STAR', axis, val }),
      saveEval: async ({ atletaId, scores }) => {
        dispatch({ type: 'SAVE_EVAL' });
        if (user && atletaId) {
          try {
            await saveSubjectiveEval({ user, atletaId, scores: scores || {} });
          } catch {
            /* la UI ya marcó guardado; el write se puede reintentar */
          }
        }
      },
    }),
    [user],
  );

  return { state, actions, roster, levels, isReal, loading, planned };
}
