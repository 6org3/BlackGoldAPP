import { useReducer, useEffect, useMemo, useState } from 'react';
import { ROSTER, SEED_SESSIONS, LEVELS } from './canchaMock';
import {
  fetchRoster,
  fetchActiveSessions,
  fetchPlannedToday,
  fetchSessionAttendance,
  fetchPlantillasCancha,
  fetchEjerciciosMap,
  reconstruirPlantillaSesion,
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

export const initialState = (user) => ({
  step: 'cancha',
  classType: null,
  level: null,
  plantilla: null, // plantilla de sesión elegida (con drills resueltos) o null
  hasPlantillas: false, // hay plantillas cargadas → el paso 'objetivo' se muestra
  present: {},
  destacados: {},
  scores: {},
  evalTargetId: null,
  savedIds: {},
  savedScores: {}, // snapshot de scores al GUARDAR — para que lo mostrado = lo otorgado (#7)
  sessions: user ? [] : SEED_SESSIONS.map((s) => ({ ...s })),
  focusedId: null,
  lastElapsed: 0,
  closingSession: null, // sesión que se está cerrando (para el write de cierre)
});

export function reducer(state, action) {
  switch (action.type) {
    case 'TICK':
      if (!state.sessions.length) return state;
      return { ...state, sessions: state.sessions.map((x) => ({ ...x, elapsed: x.elapsed + 1 })) };

    case 'HYDRATE_SESSIONS':
      return { ...state, sessions: action.sessions };

    // Hay plantillas en el catálogo → se habilita el paso 'objetivo'. Sin ellas,
    // el flujo lo auto-omite (nivel/buscador → lista directo).
    case 'SET_PLANTILLAS':
      return { ...state, hasPlantillas: action.has };

    case 'PICK_TYPE': {
      const t = action.tipo;
      return { ...state, classType: t, step: t === '1v1' ? 'buscador' : 'nivel', present: {} };
    }

    case 'PICK_LEVEL':
      return { ...state, level: action.level, step: state.hasPlantillas ? 'objetivo' : 'lista', present: {} };

    // 1v1: selección exclusiva — elegir un atleta reemplaza al anterior (#8).
    case 'CHOOSE_TOGGLE': {
      const cur = state.present[action.id];
      return { ...state, present: cur ? {} : { [action.id]: 'P' } };
    }

    case 'TO_LISTA':
      return { ...state, step: 'lista' };

    // Avance desde buscador/nivel al paso 'objetivo' (o directo a 'lista' si no
    // hay plantillas que elegir).
    case 'TO_OBJETIVO':
      return { ...state, step: state.hasPlantillas ? 'objetivo' : 'lista' };

    // Selección exclusiva de plantilla con toggle: reelegir la misma la quita.
    // `action.plantilla` llega ya con sus drills resueltos (los resuelve la
    // pantalla, que tiene el ejerciciosMap vivo).
    case 'PICK_PLANTILLA':
      return { ...state, plantilla: state.plantilla?.id === action.plantilla.id ? null : action.plantilla };

    case 'OBJETIVO_DONE':
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

    // Sesión real ya creada en Supabase (payload = sesión mapeada). Se le adjunta
    // el contexto del flujo (asistencia/tipo/nivel) para que el cierre de ESTA
    // sesión use SUS datos aunque haya otras sesiones evaluables activas (#2).
    case 'ADD_SESSION':
      return {
        ...state,
        sessions: [
          ...state.sessions,
          { ...action.session, attendance: state.present, classType: state.classType, level: state.level, plantilla: state.plantilla },
        ],
        focusedId: action.session.id,
        step: 'activa',
      };

    // Sesión local (mock, sin backend).
    case 'START': {
      const sess = {
        id: action.id,
        label: action.label,
        block: state.level || (state.classType === '1v1' ? '1v1' : 'Sesión'),
        start: action.start,
        elapsed: 0,
        present: action.present, // conteo para display
        attendance: state.present, // asistencia por-atleta para el cierre (#2)
        classType: state.classType,
        level: state.level,
        hue: 'gold',
        evaluable: true,
        notas: `[EN_CURSO] ${action.label}`,
        plantilla: state.plantilla, // plantilla elegida (o null) — la consume PantallaActiva
      };
      return { ...state, sessions: [...state.sessions, sess], focusedId: action.id, step: 'activa' };
    }

    case 'OPEN_SESSION':
      return {
        ...state,
        focusedId: action.id,
        step: 'activa',
        // Reanudar: fusiona la asistencia reconstruida en el present de trabajo Y
        // en la propia sesión, para que su cierre otorgue XP a SUS presentes (#2).
        present: action.present ? { ...state.present, ...action.present } : state.present,
        sessions: action.present
          ? state.sessions.map((x) =>
              x.id === action.id ? { ...x, attendance: { ...(x.attendance || {}), ...action.present } } : x,
            )
          : state.sessions,
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
        // Restaura el contexto de la sesión que se cierra (no el del último flujo)
        // y arranca el cierre con destacados/scores/guardados limpios (#2). Si su
        // asistencia no se pudo reconstruir (f.attendance undefined tras un fetch
        // fallido), arranca vacío en vez de heredar el present de otro flujo (#2b).
        classType: f ? f.classType || null : state.classType,
        level: f ? f.level || null : state.level,
        present: f && f.attendance ? f.attendance : {},
        destacados: {},
        scores: {},
        savedIds: {},
        savedScores: {},
        evalTargetId: null,
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
        plantilla: null, // hasPlantillas se conserva (el catálogo no cambia entre sesiones)
        present: {},
        destacados: {},
        scores: {},
        evalTargetId: null,
        savedIds: {},
        savedScores: {},
        focusedId: null,
        closingSession: null,
      };

    case 'BACK':
      switch (state.step) {
        case 'nivel':
        case 'buscador':
        case 'activa': // salir a la cancha sin cerrar la sesión (queda activa) (#1)
          return { ...state, step: 'cancha' };
        case 'objetivo':
          return { ...state, step: state.classType === '1v1' ? 'buscador' : 'nivel' };
        case 'lista':
          return {
            ...state,
            step: state.hasPlantillas ? 'objetivo' : state.classType === '1v1' ? 'buscador' : 'nivel',
          };
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
      return {
        ...state,
        savedIds: { ...state.savedIds, [state.evalTargetId]: true },
        // Congela los scores otorgados: editar estrellas luego no cambia el XP
        // mostrado (GUARDAR queda deshabilitado, así que tampoco se re-otorga) (#7).
        savedScores: { ...state.savedScores, [state.evalTargetId]: state.scores[state.evalTargetId] || {} },
        step: 'cierre',
      };

    default:
      return state;
  }
}

export default function useCanchaSession(user) {
  const [state, dispatch] = useReducer(reducer, user, initialState);
  const [roster, setRoster] = useState(() => (user ? [] : ROSTER));
  const [planned, setPlanned] = useState([]);
  const [plantillas, setPlantillas] = useState([]);
  const [ejerciciosMap, setEjerciciosMap] = useState(() => new Map());
  const [loading, setLoading] = useState(!!user);
  const isReal = !!user;

  // Carga inicial de datos reales (roster + sesiones activas + agenda de hoy).
  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    Promise.all([
      fetchRoster(user),
      fetchActiveSessions(user),
      fetchPlannedToday(user),
      fetchPlantillasCancha(),
      fetchEjerciciosMap(),
    ])
      .then(([r, sess, pl, plt, em]) => {
        if (!alive) return;
        setRoster(r);
        setPlanned(pl);
        setPlantillas(plt);
        setEjerciciosMap(em);
        // Reanudar: cada sesión activa recupera su plantilla persistida (v49)
        // resolviendo su snapshot de drills contra el catálogo ya cargado, para
        // que el panel PLAN DE SESIÓN reaparezca sin re-elegir la plantilla.
        const plantillasIndex = new Map(plt.map((p) => [p.id, p]));
        const sessConPlan = sess.map((s) => ({ ...s, plantilla: reconstruirPlantillaSesion(s, plantillasIndex, em) }));
        dispatch({ type: 'HYDRATE_SESSIONS', sessions: sessConPlan });
        dispatch({ type: 'SET_PLANTILLAS', has: plt.length > 0 });
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
  // Conteo por nivel derivado siempre del roster (mock y real ya traen `nivel`) (#4).
  const levels = useMemo(
    () => LEVELS.map((l) => ({ ...l, count: roster.filter((a) => a.nivel === l.name).length })),
    [roster],
  );

  const actions = useMemo(
    () => ({
      pickType: (tipo) => dispatch({ type: 'PICK_TYPE', tipo }),
      pickLevel: (level) => dispatch({ type: 'PICK_LEVEL', level }),
      chooseToggle: (id) => dispatch({ type: 'CHOOSE_TOGGLE', id }),
      toLista: () => dispatch({ type: 'TO_LISTA' }),
      toObjetivo: () => dispatch({ type: 'TO_OBJETIVO' }),
      pickPlantilla: (p) => dispatch({ type: 'PICK_PLANTILLA', plantilla: p }),
      objetivoDone: () => dispatch({ type: 'OBJETIVO_DONE' }),
      mark: (id, val) => dispatch({ type: 'MARK', id, val }),
      allPresent: (list) => dispatch({ type: 'ALL_PRESENT', roster: list || [] }),
      start: async ({ classType, level, present, roster: r, plantilla }) => {
        if (user) {
          try {
            const focusName = classType === '1v1' ? r.find((a) => present[a.id] === 'P')?.name : null;
            const session = await startSession({ user, classType, level, present, roster: r, focusName, plantilla });
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
            await closeClass({ user, session, presentAtletaIds: presentIds });
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

  return { state, actions, roster, levels, isReal, loading, planned, plantillas, ejerciciosMap };
}
