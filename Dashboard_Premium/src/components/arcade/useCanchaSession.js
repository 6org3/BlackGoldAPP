import { useReducer, useEffect, useMemo } from 'react';
import { ROSTER, SEED_SESSIONS } from './canchaMock';

/**
 * Máquina de estados del flujo Modo Cancha (port del reducer del prototipo
 * "Arcade HUD"). Un solo cronómetro (setInterval 1s) hace avanzar el
 * `elapsed` de TODAS las sesiones activas, corran o no en foco.
 *
 * Estado:
 *   step        cancha|nivel|buscador|lista|activa|cierre|evaluar|fin
 *   classType   grupal|indiv|1v1|eval | null
 *   level       Micro|Desarrollo|Elite | null
 *   present     { [atletaId]: 'P'|'A'|undefined }
 *   sessions    Session[]  (simultáneas)
 *   focusedId   sesión en foco en 'activa'
 *   lastElapsed seg de la última sesión terminada (para 'cierre')
 *   destacados  { [id]: bool }
 *   scores      { [id]: { fisico?, actitud?, foco?, equipo? } }  (1..5)
 *   evalTargetId / savedIds
 */

const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const initialState = () => ({
  step: 'cancha',
  classType: null,
  level: null,
  present: {},
  destacados: {},
  scores: {},
  evalTargetId: null,
  savedIds: {},
  sessions: SEED_SESSIONS.map((s) => ({ ...s })),
  focusedId: null,
  lastElapsed: 0,
});

function reducer(state, action) {
  switch (action.type) {
    case 'TICK':
      if (!state.sessions.length) return state;
      return { ...state, sessions: state.sessions.map((x) => ({ ...x, elapsed: x.elapsed + 1 })) };

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
      const list = state.classType === '1v1' ? ROSTER.filter((a) => state.present[a.id]) : ROSTER;
      const present = { ...state.present };
      list.forEach((a) => {
        present[a.id] = 'P';
      });
      return { ...state, present };
    }

    case 'START': {
      const presentCount = ROSTER.filter((a) => state.present[a.id] === 'P').length;
      let label;
      if (state.classType === '1v1') {
        const first = ROSTER.find((a) => state.present[a.id] === 'P');
        label = `1v1 · ${first ? first.name : 'Atleta'}`;
      } else {
        label = 'Sub-16 · Físico';
      }
      const sess = {
        id: action.id,
        label,
        block: state.level || (state.classType === '1v1' ? '1v1' : 'Sesión'),
        start: action.start,
        elapsed: 0,
        present: presentCount,
        hue: 'gold',
        evaluable: true,
      };
      return { ...state, sessions: [...state.sessions, sess], focusedId: action.id, step: 'activa' };
    }

    case 'OPEN_SESSION':
      return { ...state, focusedId: action.id, step: 'activa' };

    case 'FOCUS_SESSION':
      return { ...state, focusedId: action.id };

    case 'TERMINATE_EVAL': {
      const f = state.sessions.find((x) => x.id === action.id);
      return {
        ...state,
        sessions: state.sessions.filter((x) => x.id !== action.id),
        lastElapsed: f ? f.elapsed : 0,
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

export default function useCanchaSession() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  // Un único ticker para todas las sesiones activas (el `elapsed` de cada
  // sesión avanza aunque no esté en foco). En fase 5 se deriva de started_at.
  useEffect(() => {
    const t = setInterval(() => dispatch({ type: 'TICK' }), 1000);
    return () => clearInterval(t);
  }, []);

  const actions = useMemo(
    () => ({
      pickType: (tipo) => dispatch({ type: 'PICK_TYPE', tipo }),
      pickLevel: (level) => dispatch({ type: 'PICK_LEVEL', level }),
      chooseToggle: (id) => dispatch({ type: 'CHOOSE_TOGGLE', id }),
      toLista: () => dispatch({ type: 'TO_LISTA' }),
      mark: (id, val) => dispatch({ type: 'MARK', id, val }),
      allPresent: () => dispatch({ type: 'ALL_PRESENT' }),
      start: () => dispatch({ type: 'START', id: `main-${Date.now()}`, start: hhmm(new Date()) }),
      openSession: (id) => dispatch({ type: 'OPEN_SESSION', id }),
      focusSession: (id) => dispatch({ type: 'FOCUS_SESSION', id }),
      terminateEval: (id) => dispatch({ type: 'TERMINATE_EVAL', id }),
      terminateBg: (id) => dispatch({ type: 'TERMINATE_BG', id }),
      finish: () => dispatch({ type: 'FINISH' }),
      reset: () => dispatch({ type: 'RESET' }),
      back: () => dispatch({ type: 'BACK' }),
      toggleDestacado: (id) => dispatch({ type: 'TOGGLE_DESTACADO', id }),
      openEval: (id) => dispatch({ type: 'OPEN_EVAL', id }),
      setStar: (axis, val) => dispatch({ type: 'SET_STAR', axis, val }),
      saveEval: () => dispatch({ type: 'SAVE_EVAL' }),
    }),
    [],
  );

  return { state, actions };
}
