/* ============================================================
   View-model puro del panel DUEÑO Arcade (port de buildDuenoCtx del prototipo).
   Recibe (state, data, actions) → `ctx` que consumen los paneles presentacionales.
   SIN estado/efectos/try-catch. `data` viene de duenoData (real overlay) o
   DUENO_MOCK (demo) — misma forma. Las acciones idempotentes (verificar/recordar/
   contactar) solo cambian estilo/etiqueta en esta versión (mutación real = TODO).
   ============================================================ */
import { C, hueBg, hueFg } from './arcadeTokens';

const CIRC = 2 * Math.PI * 58;
const EMPTY = 'rgba(255,255,255,.07)';
const money = (n) => '$' + (Number(n) || 0).toLocaleString('en-US');
const cellsOf = (val, max, color) =>
  Array.from({ length: 10 }, (_, i) => (i < Math.round((10 * val) / max) ? color : EMPTY));

const TITLES = { resumen: 'Black Gold', finanzas: 'Finanzas', asistencia: 'Asistencia', equipo: 'Equipo técnico', retencion: 'Retención' };
const DN = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];

// ---------- D1 · Resumen ----------
function ctxResumen(data, actions) {
  return {
    kpis: data.kpis,
    // Una alerta con `href` navega fuera del HUD (goHref, v33 — p.ej. la bandeja
    // de solicitudes en /admin/atletas); con `goTab` cambia de panel interno.
    alertas: (data.alertas || []).map((a) => ({
      ...a,
      onGo: () => (a.href && actions.goHref ? actions.goHref(a.href) : actions.goTab(a.goTab)),
    })),
    hoy: data.hoy || [],
  };
}

// ---------- D2 · Finanzas ----------
function ctxFinanzas(state, data, actions) {
  const mes = state.dMes || 'jul';
  const d = data.finanzas[mes] || data.finanzas.jul;
  const MESES = [{ k: 'may', label: 'MAYO' }, { k: 'jun', label: 'JUNIO' }, { k: 'jul', label: 'JULIO' }];
  const pct = d.meta ? Math.round((100 * d.recaudado) / d.meta) : 0;

  const verificados = state.dVerificados || {};
  const recordados = state.dRecordados || {};

  return {
    meses: MESES.map((m) => ({ label: m.label, active: mes === m.k, onPick: () => actions.pickMes(m.k) })),
    donutDash: `${((CIRC * pct) / 100).toFixed(0)} ${Math.ceil(CIRC)}`,
    donutPct: `${pct}%`,
    recaudadoLabel: money(d.recaudado),
    porCobrarLabel: money(d.cobrar),
    metaLabel: money(d.meta),
    menVal: money(d.men),
    sesVal: money(d.ses),
    menCells: cellsOf(d.men, 3000, 'rgba(255,215,0,.55)'),
    sesCells: cellsOf(d.ses, 3000, 'rgba(34,211,238,.55)'),
    vencidosLabel: `${d.vencCount} VENCIDOS · $${d.vencMonto}`,
    becadosLabel: `${d.becados} BECADOS`,
    verificarCount: String((data.verificar || []).filter((v) => !verificados[v.id]).length),
    verificar: (data.verificar || []).map((v) => {
      const ok = !!verificados[v.id];
      return {
        initial: v.initial, avatarBg: hueBg(v.hue), avatarFg: hueFg(v.hue), name: v.name,
        sub: ok ? 'Mensualidad · verificado' : v.sub, monto: v.monto,
        border: ok ? 'rgba(52,211,153,.35)' : 'rgba(255,215,0,.3)',
        btnLabel: ok ? '✓ OK' : 'VERIFICAR',
        btnBg: ok ? 'rgba(52,211,153,.12)' : 'rgba(255,215,0,.1)',
        btnFg: ok ? C.ok : C.gold,
        btnBorder: ok ? 'rgba(52,211,153,.4)' : 'rgba(255,215,0,.4)',
        onBtn: () => actions.verificar(v.id),
      };
    }),
    vencidos: (data.vencidos || []).map((v) => {
      const sent = !!recordados[v.id];
      return {
        initial: v.initial, avatarBg: hueBg(v.hue), avatarFg: hueFg(v.hue), name: v.name, sub: v.sub, monto: v.monto,
        border: sent ? 'rgba(52,211,153,.3)' : 'rgba(239,68,68,.25)',
        btnLabel: sent ? '✓ ENVIADO' : 'RECORDAR',
        btnBg: sent ? 'rgba(52,211,153,.12)' : 'rgba(37,211,102,.1)',
        btnFg: sent ? C.ok : C.whatsapp,
        btnBorder: sent ? 'rgba(52,211,153,.4)' : 'rgba(37,211,102,.45)',
        onBtn: () => actions.recordar(v.id),
      };
    }),
  };
}

// ---------- D3 · Asistencia & Ocupación ----------
function ctxAsistencia(state, data, actions) {
  const cat = state.dCat || 'todas';
  const cd = data.asistencia[cat] || data.asistencia.todas;
  const CATS = [{ k: 'todas', label: 'TODAS' }, { k: 's14', label: 'SUB-14' }, { k: 's16', label: 'SUB-16' }, { k: 's18', label: 'SUB-18' }];
  const { days, franjas, HD } = data.heat;
  const selKey = state.dHeat || '0-2';

  const heatRows = franjas.map((t, fi) => ({
    time: t,
    cells: HD[fi].map((c, di) => {
      const key = `${di}-${fi}`;
      const isSel = key === selKey;
      if (!c) return { label: '—', fg: '#374151', bg: 'rgba(255,255,255,.03)', border: 'rgba(255,255,255,.05)', onPick: () => {}, aria: `${DN[di]} ${t} libre` };
      const a = (0.08 + 0.7 * (c.p / 100)).toFixed(2);
      return {
        label: String(c.p),
        fg: c.p > 75 ? C.ink : C.text,
        bg: `rgba(255,215,0,${a})`,
        border: isSel ? C.gold : 'rgba(255,215,0,.15)',
        onPick: () => actions.heatPick(key),
        aria: `${DN[di]} ${t} · ${c.p}%`,
      };
    }),
  }));

  const [sdiStr, sfiStr] = selKey.split('-');
  const sdi = parseInt(sdiStr, 10);
  const sfi = parseInt(sfiStr, 10);
  const sc = (HD[sfi] || [])[sdi];

  return {
    cats: CATS.map((c) => ({ label: c.label, active: cat === c.k, onPick: () => actions.pickCat(c.k) })),
    mediaLabel: `${cd.pct}%`,
    mediaTrend: cd.trend,
    mediaSub: cd.sub,
    mediaCells: Array.from({ length: 10 }, (_, i) => (i < Math.round(cd.pct / 10) ? C.ok : 'rgba(255,255,255,.08)')),
    catRows: (data.catRows || []).map((r) => ({
      label: r.label, sub: r.sub, pctLabel: `${r.pct}%`, color: r.color,
      border: cat === r.k ? 'rgba(255,215,0,.4)' : 'rgba(255,255,255,.07)',
      cells: Array.from({ length: 10 }, (_, i) => (i < Math.round(r.pct / 10) ? r.color : EMPTY)),
    })),
    heatDays: days,
    heatRows,
    heatTitle: `${DN[sdi]} · ${franjas[sfi]}`,
    heatSub: sc ? `${sc.g} · ${Math.round((sc.p * 24) / 100)}/24 cupos` : 'Franja libre · disponible para 1v1',
    heatPct: sc ? `${sc.p}%` : '—',
  };
}

// ---------- D4 · Equipo ----------
function ctxEquipo(state, data, actions) {
  const sort = state.dSort || 'asist';
  const SL = [{ k: 'asist', label: 'ASISTENCIA' }, { k: 'ses', label: 'SESIONES' }, { k: 'xp', label: 'XP' }];
  const ML = { asist: 'ASIST. MEDIA', ses: 'SESIONES 30D', xp: 'XP REPARTIDO' };
  const coaches = data.coaches || [];
  const sorted = coaches.slice().sort((a, b) => b[sort] - a[sort]);
  const max = coaches.length ? Math.max(...coaches.map((c) => c[sort])) : 1;

  return {
    sorts: SL.map((o) => ({ label: o.label, active: sort === o.k, onPick: () => actions.sortBy(o.k) })),
    coaches: sorted.map((c, i) => ({
      rank: '0' + (i + 1),
      rankColor: i === 0 ? C.gold : i === 1 ? C.text2 : C.text3,
      initial: c.initial, hue: c.hue, name: c.name, cats: c.cats,
      asist: `${c.asist}%`, ses: String(c.ses), xp: c.xp.toLocaleString('en-US'),
      metricVal: sort === 'asist' ? `${c.asist}%` : sort === 'xp' ? c.xp.toLocaleString('en-US') : String(c.ses),
      metricLabel: ML[sort],
      border: i === 0 ? 'rgba(255,215,0,.3)' : 'rgba(255,255,255,.08)',
      cells: Array.from({ length: 10 }, (_, j) => (j < Math.round((10 * c[sort]) / (max || 1)) ? (i === 0 ? C.gold : 'rgba(255,215,0,.35)') : EMPTY)),
    })),
  };
}

// ---------- D5 · Retención ----------
function ctxRetencion(state, data, actions) {
  const r = data.retencion;
  const contactados = state.dContactados || {};
  const bajas = state.dBajas || {};
  const armar = state.dBajaArmar || null;
  return {
    retDash: `${((CIRC * r.retPct) / 100).toFixed(0)} ${Math.ceil(CIRC)}`,
    retPct: `${r.retPct}%`,
    activosLine: r.activosLine,
    netoLine: r.netoLine,
    ab: r.ab.map((x) => ({
      m: x.m,
      aCells: Array.from({ length: x.a }, () => C.ok),
      bCells: Array.from({ length: x.b }, () => C.danger),
      neto: (x.a - x.b >= 0 ? '+' : '') + (x.a - x.b),
      netoColor: x.a - x.b > 0 ? C.ok : x.a - x.b < 0 ? C.danger : C.text2,
    })),
    riesgoCount: String(r.riesgo.length),
    riesgo: r.riesgo.map((x) => {
      const done = !!contactados[x.id];
      const dada = !!bajas[x.id]; // ya dado de baja en esta sesión
      const armada = armar === x.id; // baja armada, esperando confirmación
      const name = x.name || 'Atleta';
      // Botones de la acción de baja según el estado de la fila:
      //  · reposo → un único "DAR DE BAJA" (arma la confirmación)
      //  · armada → DOS objetivos táctiles distintos: CANCELAR / ¿CONFIRMAR?
      //    (el CANCELAR da salida sin ejecutar; ya no es un único botón que
      //    se auto-confirma en el mismo sitio)
      //  · dada  → "↩ DESHACER" (reactivar, write real)
      let bajaButtons;
      if (dada) {
        bajaButtons = [{
          key: 'undo', label: '↩ DESHACER',
          bg: 'rgba(239,68,68,.12)', fg: C.danger, border: 'rgba(239,68,68,.45)',
          onClick: () => actions.reactivar(x.id), ariaLabel: `Deshacer la baja de ${name}`,
        }];
      } else if (armada) {
        bajaButtons = [
          { key: 'cancel', label: 'CANCELAR',
            bg: 'transparent', fg: C.text2, border: 'rgba(255,255,255,.14)',
            onClick: () => actions.cancelBaja(), ariaLabel: `Cancelar la baja de ${name}` },
          { key: 'confirm', label: '¿CONFIRMAR?',
            bg: 'rgba(239,68,68,.18)', fg: C.danger, border: 'rgba(239,68,68,.45)',
            onClick: () => actions.darBaja(x.id), ariaLabel: `Confirmar la baja de ${name}` },
        ];
      } else {
        bajaButtons = [{
          key: 'arm', label: 'DAR DE BAJA',
          bg: 'transparent', fg: C.text2, border: 'rgba(255,255,255,.14)',
          onClick: () => actions.armBaja(x.id), ariaLabel: `Dar de baja a ${name}`,
        }];
      }
      return {
        rowKey: x.id, // key estable (UUID real / id de mock), no el índice
        initial: x.initial, avatarBg: hueBg(x.hue), avatarFg: hueFg(x.hue), name,
        motivo: dada ? 'Dado de baja del club' : done ? 'Contactado · seguimiento esta semana' : x.motivo,
        motivoColor: dada ? C.danger : done ? C.ok : x.mc,
        border: dada ? 'rgba(239,68,68,.3)' : done ? 'rgba(52,211,153,.3)' : 'rgba(251,146,60,.25)',
        // CONTACTAR — oculto mientras la baja está armada o ya ejecutada.
        showContactar: !dada && !armada,
        btnLabel: done ? '✓ HECHO' : 'CONTACTAR',
        btnBg: done ? 'rgba(52,211,153,.12)' : 'rgba(255,215,0,.1)',
        btnFg: done ? C.ok : C.gold,
        btnBorder: done ? 'rgba(52,211,153,.4)' : 'rgba(255,215,0,.4)',
        onBtn: () => actions.contactar(x.id),
        bajaButtons,
      };
    }),
  };
}

/** Construye el ctx completo del dueño a partir del estado + datos. */
export function buildDuenoCtx(state, data, actions) {
  const tab = state.dTab || 'resumen';
  const ctx = {
    isResumen: tab === 'resumen',
    isFinanzas: tab === 'finanzas',
    isAsistencia: tab === 'asistencia',
    isEquipo: tab === 'equipo',
    isRetencion: tab === 'retencion',
    panelTitle: TITLES[tab],
    navActive: tab,
    demo: !!data.demo,
  };
  if (ctx.isResumen) Object.assign(ctx, ctxResumen(data, actions));
  if (ctx.isFinanzas) Object.assign(ctx, ctxFinanzas(state, data, actions));
  if (ctx.isAsistencia) Object.assign(ctx, ctxAsistencia(state, data, actions));
  if (ctx.isEquipo) Object.assign(ctx, ctxEquipo(state, data, actions));
  if (ctx.isRetencion) Object.assign(ctx, ctxRetencion(state, data, actions));
  return ctx;
}
