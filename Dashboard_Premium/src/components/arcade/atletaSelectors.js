/* ============================================================
   View-model puro del portal ATLETA Arcade (port de buildAtletaCtx del
   prototipo). Recibe (state, data, actions) y deriva el `ctx` que consumen
   las pantallas presentacionales. SIN estado propio, SIN efectos, SIN
   try/catch: los writes async viven en useAtleta/atletaData.

   `data` es el objeto que produce atletaData.fetchAtletaPanel (real) o
   ATLETA_MOCK (demo) — misma forma, así que aquí no se ramifica demo vs real.
   El contenido que hoy no tiene datos (quiz, pasos, tips, insignias, semanas)
   se toma de las constantes mock; ver los `// TODO` de atletaData.
   ============================================================ */
import { C, GRAD } from './arcadeTokens';
import { MINI_QUIZ, PASOS_DETALLE, PILAR_TIPS, INSIGNIAS_MOCK, WEEKS_MOCK } from './atletaMock';

const DIAS_UP = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MESES_UP = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

const EMPTY = 'rgba(255,255,255,.08)';
const GOLD_CELL = C.gold;

// Estilo por estado de misión (colores del prototipo).
const ESTA = {
  activa: { label: 'ACTIVA', color: C.gold, border: 'rgba(255,215,0,.35)' },
  propuesta: { label: 'PROPUESTA', color: C.cyan, border: 'rgba(34,211,238,.4)' },
  revision: { label: 'EN REVISIÓN', color: C.ai, border: 'rgba(168,85,247,.45)' },
  completada: { label: 'COMPLETADA ✓', color: C.ok, border: 'rgba(52,211,153,.4)' },
};
const cellColor = (estado) => (estado === 'revision' ? C.ai : estado === 'completada' ? C.ok : GOLD_CELL);

// Identidad visual del nivel de desarrollo (fase de periodización del club).
const NIVEL_UI = {
  Micro: { emoji: '🔷', color: C.cyan },
  Desarrollo: { emoji: '🔵', color: C.info },
  Elite: { emoji: '⭐', color: C.gold },
};
const NIVELES = ['Micro', 'Desarrollo', 'Elite'];

const FILTRO_LUGAR = { cancha: 'CANCHA', casa: 'CASA', lugar: 'TODO LUGAR' };

/** Estado efectivo de una misión: override local (tras aceptar/enviar) o el de datos. */
const effEstado = (state, m) => (m && (state.aMisionEstados?.[m.id] || m.estado)) || 'activa';
const misionById = (data, id) => (data.misiones || []).find((m) => m.id === id) || null;

function fechaHoyLine(categoria) {
  const d = new Date();
  const base = `${DIAS_UP[d.getDay()]} ${d.getDate()} ${MESES_UP[d.getMonth()]}`;
  return categoria ? `${base} · ${categoria}` : base;
}

/** Tarjeta del check-in de readiness en la Base. Devuelve null mientras la
    consulta del día está en vuelo (state.aReadiness === undefined) para no
    parpadear "pendiente" antes de saber si ya lo hizo. */
function ctxCheckin(state, actions) {
  const r = state.aReadiness;
  if (r === undefined) return null;

  if (r) {
    const score = Number(r.readiness_score);
    return {
      hecho: true,
      titulo: 'CHECK-IN HECHO',
      scoreLabel: Number.isFinite(score) ? `READINESS ${score.toFixed(1)}` : null,
      resumen: `SUEÑO ${r.sueno_calidad} · FATIGA ${r.fatiga_fisica} · HIDRATACIÓN ${r.color_orina}/8`,
    };
  }

  if (!state.aReadinessDisponible) {
    return {
      hecho: false,
      bloqueado: true,
      titulo: 'CHECK-IN DIARIO',
      texto: 'Se habilita a las 06:00 — mide tu primera orina de la mañana.',
    };
  }

  return {
    hecho: false,
    bloqueado: false,
    titulo: 'CHECK-IN DIARIO',
    texto: 'Antes de entrenar, cuéntanos cómo llegas hoy.',
    ctaLabel: 'HACER CHECK-IN ►',
    onOpen: () => actions.abrirReadiness(),
  };
}

// ---------- Pantalla INICIO / BASE ----------
function ctxInicio(state, data, actions) {
  const p = data.profile;
  const nivel = NIVEL_UI[p.nivelDesarrollo] || NIVEL_UI.Micro;
  const destacada = data.misionDestacada;
  const destEstado = destacada ? effEstado(state, misionById(data, destacada.id) || destacada) : null;

  const evento = (data.eventos || [])[0] || null;
  const voy = evento ? (state.aVoy?.[evento.id] ?? evento.going) : false;

  return {
    fechaLine: p.fechaLine || fechaHoyLine(p.categoria),
    racha: p.racha,
    heroInicial: p.inicial,
    heroNombre: p.nombre,
    heroAccent: nivel.color,
    nivelLine: `${(p.nivelDesarrollo || '').toUpperCase()} ${nivel.emoji}`,
    pwr: p.pwr,
    xp: p.xp,
    checkin: ctxCheckin(state, actions),
    hoyEntrenas: data.hoyEntrenas,
    alertaIA: data.alertaIA,
    misionDestacada: destacada
      ? {
          titulo: destacada.titulo,
          sub: destacada.sub,
          xpLabel: `+${destacada.xp} XP`,
          cells: Array.from({ length: destacada.tot || 5 }, (_, i) =>
            i < (destEstado === 'revision' ? destacada.tot : destacada.prog) ? cellColor(destEstado) : EMPTY,
          ),
          ctaLabel: destEstado === 'revision' ? 'VER · EN REVISIÓN ►' : 'ABRIR MISIÓN · QUIZ ►',
          onOpen: () => actions.openDetalle(destacada.id),
        }
      : null,
    evento: evento
      ? {
          titulo: evento.titulo,
          sub: evento.sub,
          voyLabel: voy ? 'VOY ✓' : '¿VAS?',
          voyOn: voy,
          onVoy: () => actions.voyToggle(evento.id),
        }
      : null,
  };
}

// ---------- Pantalla MISIONES ----------
function ctxMisiones(state, data, actions) {
  const filtro = state.aFiltro || 'todas';
  const FILTROS = [
    { key: 'todas', label: 'TODAS' },
    { key: 'cancha', label: 'CANCHA' },
    { key: 'casa', label: 'CASA' },
    { key: 'lugar', label: 'TODO LUGAR' },
  ];
  const match = (m) => filtro === 'todas' || m.lugar === FILTRO_LUGAR[filtro];

  const lista = (data.misiones || []).filter(match).map((m) => {
    const estado = effEstado(state, m);
    const es = ESTA[estado];
    const isProp = estado === 'propuesta';
    const filled = estado === 'completada' || estado === 'revision' ? m.tot : m.prog;
    const showBtn = estado !== 'completada';
    return {
      id: m.id,
      titulo: m.titulo,
      sub: m.sub,
      xpLabel: `+${m.xp} XP`,
      lugarLabel: m.lugar,
      pilarLabel: m.pilar,
      estadoLabel: es.label,
      estadoColor: es.color,
      estadoBorder: es.border,
      border: es.border,
      cells: Array.from({ length: m.tot || 5 }, (_, i) => (i < filled ? cellColor(estado) : EMPTY)),
      showBtn,
      btnLabel: isProp ? `ACEPTAR MISIÓN · +${m.xp} XP` : estado === 'revision' ? 'VER · EN REVISIÓN ►' : 'ABRIR · QUIZ ►',
      btnPrimary: !isProp,
      onBtn: isProp ? () => actions.aceptar(m.id) : () => actions.openDetalle(m.id),
    };
  });

  const estados = (data.misiones || []).map((m) => effEstado(state, m));
  const nAct = estados.filter((e) => e === 'activa').length;
  const nRev = estados.filter((e) => e === 'revision').length;
  const nProp = estados.filter((e) => e === 'propuesta').length;

  return {
    misiones: lista,
    filtros: FILTROS.map((f) => ({ label: f.label, active: filtro === f.key, onPick: () => actions.filtrar(f.key) })),
    resumen: `${nAct} ACTIVAS · ${nRev} EN REVISIÓN${nProp ? ` · ${nProp} PROPUESTA` : ''}`,
  };
}

// ---------- Pantalla DETALLE + mini-quiz ----------
function ctxDetalle(state, data, actions) {
  const m = misionById(data, state.detalleId) || data.misionDestacada || null;
  const estado = m ? effEstado(state, m) : 'activa';
  const sent = estado === 'revision';
  const q = state.aQuiz || {};
  const nAns = Object.keys(q).length;
  const totalQ = MINI_QUIZ.length;
  const xp = m?.xp ?? data.misionDestacada?.xp ?? 40;

  const footer = sent
    ? { label: '✓ ENVIADA · EN REVISIÓN', enabled: false, tone: 'ai' }
    : nAns >= totalQ
      ? { label: `ENVIAR A REVISIÓN · +${xp} XP`, enabled: true, tone: 'gold', onClick: () => actions.enviar(m?.id) }
      : { label: `RESPONDE EL QUIZ · ${nAns}/${totalQ}`, enabled: false, tone: 'muted' };

  return {
    flowStepLabel: `MISIÓN · ${(m?.lugar || 'CASA')} · PILAR ${m?.pilar || '—'}`,
    flowTitle: m?.titulo || 'Misión',
    headerRight: `+${xp} XP`,
    pasos: PASOS_DETALLE,
    progCells: Array.from({ length: 5 }, (_, i) => (i < 3 ? C.gold : EMPTY)), // 3/5 mock — TODO
    enviada: sent,
    quiz: MINI_QUIZ.map((qq, qi) => ({
      q: qq.q,
      opts: qq.opts.map((o, oi) => ({
        label: o,
        selected: q[qi] === oi,
        onPick: sent ? undefined : () => actions.answer(qi, oi),
      })),
    })),
    footer,
  };
}

// ---------- Pantalla PROGRESO ----------
function ctxProgreso(state, data, actions) {
  const p = data.profile;
  const radar = data.radar || [];
  const sel = state.aPilar || 'explosividad';
  const selAxis = radar.find((a) => a.key === sel) || radar[0] || { key: sel, label: '', value: 0 };
  const nivelIdx = Math.max(0, NIVELES.indexOf(p.nivelDesarrollo));
  // XP semanal real (data.weeks, v31) o mock si el atleta aún no tiene ledger.
  const weeksSrc = (data.weeks && data.weeks.length) ? data.weeks : WEEKS_MOCK;
  // Conteo real de insignias (data.insigniasCounts) o los conteos de INSIGNIAS_MOCK.
  const insCounts = data.insigniasCounts || null;

  return {
    resumenLine: `${(p.nivelDesarrollo || '').toUpperCase()} · ${p.xp.current.toLocaleString()} XP TOTAL · PWR ${p.pwr}`,
    // Ficha física (peso/talla/IMC/brazada) de la fila de atletas; null → la
    // card muestra el estado vacío.
    fisico: data.fisico || null,
    rangos: NIVELES.map((n, i) => ({
      tier: ['I', 'II', 'III'][i],
      label: n.toUpperCase(),
      state: i < nivelIdx ? 'done' : i === nivelIdx ? 'current' : 'locked',
    })),
    radar,
    selKey: sel,
    onPilarPick: (k) => actions.pilarPick(k),
    pilarTipTitle: `${selAxis.label || sel.toUpperCase()} · ${Math.round(selAxis.value || 0)}`,
    pilarTipText: PILAR_TIPS[sel] || 'Sigue trabajando este pilar en tus misiones.',
    pilarRows: radar.map((pl) => {
      const isSel = pl.key === sel;
      const filled = Math.round((pl.value || 0) / 10);
      return {
        key: pl.key,
        label: pl.label,
        valLabel: String(Math.round(pl.value || 0)),
        isSel,
        cells: Array.from({ length: 10 }, (_, i) => (i < filled ? (isSel ? C.gold : 'rgba(255,215,0,.45)') : 'rgba(255,255,255,.07)')),
        onPick: () => actions.pilarPick(pl.key),
      };
    }),
    insignias: INSIGNIAS_MOCK.map((b) => {
      // Sin conteos reales: en demo usa el conteo mock; para un atleta real (la
      // lectura de observaciones_cancha falló) muestra 0 = insignia bloqueada, no
      // un mock falso (coherente con la racha, que se oculta ante el mismo error).
      const n = insCounts ? (insCounts[b.key] || 0) : (data.demo ? b.n : 0);
      return {
        icon: b.icon,
        name: b.name,
        unlocked: n > 0,
        countLabel: n > 0 ? `×${n}` : '—',
      };
    }),
    weeks: weeksSrc.map((w, i) => {
      const last = i === weeksSrc.length - 1;
      const nCells = Math.max(1, Math.round(w.xp / 25));
      return {
        xp: String(w.xp),
        label: w.label,
        last,
        cells: Array.from({ length: nCells }, () => (last ? GRAD.goldText : 'rgba(255,215,0,.4)')),
      };
    }),
  };
}

// ---------- Pantalla EVENTOS ----------
function ctxEventos(state, data, actions) {
  return {
    eventos: (data.eventos || []).map((e) => {
      const voy = state.aVoy?.[e.id] ?? e.going;
      return {
        icon: e.icon,
        iconHue: e.iconHue,
        titulo: e.titulo,
        sub: e.sub,
        confLabel: `${(e.conf || 0) + (voy && !e.going ? 1 : 0)}/${e.tot || 0} VAN`,
        voy,
        voyLabel: voy ? '✓ CONFIRMADO · ¡NOS VEMOS!' : 'CONFIRMAR · VOY',
        onVoy: () => actions.voyToggle(e.id),
      };
    }),
    historial: (data.historial || []).map((h) => ({
      res: h.res,
      resHue: h.resHue,
      score: h.score,
      titulo: h.titulo,
      sub: h.sub,
    })),
  };
}

/** Construye el ctx completo del atleta a partir del estado + datos. */
export function buildAtletaCtx(state, data, actions) {
  const tab = state.aDetalle ? 'detalle' : state.aTab || 'inicio';
  const ctx = {
    isInicio: tab === 'inicio',
    isMisiones: tab === 'misiones',
    isDetalle: tab === 'detalle',
    isProgreso: tab === 'progreso',
    isEventos: tab === 'eventos',
    showFlowHeader: tab === 'detalle',
    showFooter: tab === 'detalle',
    showNav: tab !== 'detalle',
    navActive: state.aTab || 'inicio',
    onBack: () => actions.back(),
    demo: !!data.demo,
    // Modal del check-in: lo monta el shell (VistaAtletaArcade) para que siga
    // abierto sobre cualquier pestaña, no solo sobre la Base.
    readiness: {
      open: !!state.aReadinessOpen,
      onClose: () => actions.cerrarReadiness(),
      onComplete: (registro) => actions.readinessCompletado(registro),
    },
  };
  if (ctx.isInicio) Object.assign(ctx, ctxInicio(state, data, actions));
  if (ctx.isMisiones) Object.assign(ctx, ctxMisiones(state, data, actions));
  if (ctx.isDetalle) Object.assign(ctx, ctxDetalle(state, data, actions));
  if (ctx.isProgreso) Object.assign(ctx, ctxProgreso(state, data, actions));
  if (ctx.isEventos) Object.assign(ctx, ctxEventos(state, data, actions));
  return ctx;
}
