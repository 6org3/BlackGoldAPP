/* ============================================================
   Capa de datos del panel DUEÑO Arcade (fase 5 — Supabase real, parcial).

   Estrategia: OVERLAY. Parte de DUENO_MOCK y reemplaza los números que SÍ
   existen hoy en Supabase — KPIs del resumen, alertas accionables (vencidos/
   por verificar/riesgo/solicitudes), agenda "hoy en el club" (sesiones_control),
   finanzas por mes (recaudado/por cobrar/vencidos/becados/mensualidades/1v1),
   filas de acción verificar/recordar (pagos del mes), asistencia media y por
   categoría, el heatmap de ocupación de cancha (v32, fn_ocupacion_cancha), el
   ranking de coaches (v31, fn_coach_stats), la retención/altas-bajas (v31,
   fn_retencion_club) y la meta de recaudación (v31, club_config) — reutilizando
   los servicios y la derivación exacta de ClubHomePage. Las capas sin dato real
   degradan a estado VACÍO honesto (alertas [], agenda [], heatmap sin datos),
   nunca a mock disfrazado de real; coaches/retención aún caen a mock (TODO);
   ante excepción total, al DUENO_MOCK completo (badge DEMO).

   Nota de meses: el prototipo asume may/jun/jul. Como hoy es julio 2026 eso
   calza con los últimos 3 meses; TODO: etiquetas de mes dinámicas fuera de julio.
   ============================================================ */
import { supabase } from '../../api/supabaseClient';
import { fetchTodosLosAtletas } from '../../api/atletasService';
import { fetchAsistenciaPct } from '../../api/asistenciaService';
import { fetchPagosMes, fetchClubConfig } from '../../api/pagosService';
import { fetchCoachStats } from '../../api/coachesService';
import { fetchRetencionClub } from '../../api/retencionService';
import { fetchOcupacionCancha } from '../../api/ocupacionService';
import { contarSolicitudesPendientes } from '../../api/solicitudesService';
import { tieneSenal } from '../../lib/senalesAtleta';
import { C } from './arcadeTokens';
import { DUENO_MOCK } from './duenoMock';

const money = (n) => '$' + (Math.round(Number(n) || 0)).toLocaleString('en-US');
// Membresía activa (v31). Estado ausente = activo (columna NOT NULL DEFAULT
// 'activo'; robusto si el select aún no trajera la columna). 'baja'/'inactivo'
// quedan fuera, para cuadrar con el gauge de fn_retencion_club (WHERE 'activo').
const esActivo = (a) => (a.estado_membresia ?? 'activo') === 'activo';
const MESES_UP = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const ymLabel = (ym) => MESES_UP[(Number(String(ym).slice(5, 7)) || 0) - 1] || String(ym);
const idsCat = (list, digits) => list.filter((a) => String(a.categoria || '').includes(digits)).map((a) => a.atleta_id).filter(Boolean);
const countCat = (list, digits) => list.filter((a) => String(a.categoria || '').includes(digits)).length;

// Derivación de un mes de pagos → bucket de finanzas (misma lógica que AdminPagos/
// ClubHomePage: recaudado = Pagado + parte cobrada de Abonado/Vencido). El split
// mensualidades vs 1v1 sale de pagos.tipo (v39: fetchPagosMes ya trae
// 'Mensualidad' + 'Adicional'), no de un monto inventado.
function derivePagos(pagos, metaReal = null) {
  let recaudado = 0, cobrar = 0, vencCount = 0, vencMonto = 0, becados = 0, men = 0, ses = 0;
  (pagos || []).forEach((p) => {
    const monto = p.monto_final || 0;
    const pagado = p.monto_pagado || 0;
    let cobradoFila = 0;
    if (p.estado === 'Pagado') cobradoFila = monto;
    else if (p.estado === 'Pendiente' || p.estado === 'Por Verificar') cobrar += monto - pagado;
    else if (p.estado === 'Abonado' || p.estado === 'Vencido') { cobradoFila = pagado; cobrar += monto - pagado; }
    recaudado += cobradoFila;
    if (p.tipo === 'Adicional') ses += cobradoFila; else men += cobradoFila;
    if (p.estado === 'Vencido') { vencCount += 1; vencMonto += monto - pagado; }
    if (p.estado === 'Becado') becados += 1;
  });
  return {
    recaudado: Math.round(recaudado),
    cobrar: Math.round(cobrar),
    meta: metaReal || Math.round(recaudado + cobrar), // meta real (club_config, v31) o derivada
    men: Math.round(men), // mensualidades cobradas del mes
    ses: Math.round(ses), // 1v1 / cargos adicionales cobrados del mes
    vencCount,
    vencMonto: Math.round(vencMonto),
    becados,
  };
}

// Mes/año N meses atrás (1..).
function mesAtras(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return { m: d.getMonth() + 1, y: d.getFullYear() };
}

const hhmm = (t) => (t ? String(t).slice(0, 5) : '');
// 'Nayeli Ríos Vargas' → 'Nayeli R.' (formato corto de las alertas del resumen).
const nombreCorto = (n) => {
  const [a, b] = String(n || '').trim().split(/\s+/);
  return b ? `${a} ${b.charAt(0).toUpperCase()}.` : a || 'Atleta';
};

// Estado vacío del heatmap de ocupación: rejilla de franjas habituales toda
// libre + flag `vacio` para que el selector rotule "sin datos" en vez de
// enseñar el mock con ocupaciones inventadas en un club sin sesiones (v32).
const HEAT_VACIO = {
  days: ['L', 'M', 'X', 'J', 'V', 'S'],
  franjas: ['16:00', '17:00', '18:00', '19:30'],
  HD: Array.from({ length: 4 }, () => Array(6).fill(null)),
  vacio: true,
};

// Agenda "HOY EN EL CLUB" club-wide: sesiones_control de HOY (la agenda que
// crea AdminSesiones). No hay service club-wide (fetchSesionesPlanificadasHoy
// es por coach), así que la query vive aquí como en atletaData/canchaData. La
// RLS (v29) ya scopea al staff por club; se filtra también client-side como
// defensa en profundidad (un superadmin vería todos los clubes mezclados).
// La hora y el estado EN CURSO salen del horario del grupo (sesiones_control
// no guarda hora propia). Error o día sin sesiones → [] (estado vacío).
async function fetchAgendaHoy(club) {
  const hoyISO = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('sesiones_control')
    .select(`
      id, tipo, objetivo_tipo, se_logro,
      grupos_entrenamiento (nombre, club, hora_inicio, hora_fin),
      atletas (usuarios!atletas_usuario_id_fkey (nombre, club)),
      usuarios!sesiones_control_coach_id_fkey (nombre)
    `)
    .eq('fecha', hoyISO)
    .order('created_at', { ascending: true });
  if (error) { console.error('[duenoData] agenda de hoy:', error); return []; }

  const d = new Date();
  const ahora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return (data || [])
    .filter((s) => {
      const clubSesion = s.grupos_entrenamiento?.club || s.atletas?.usuarios?.club;
      return !club || !clubSesion || clubSesion === club;
    })
    .map((s) => {
      const g = s.grupos_entrenamiento;
      const quien = s.tipo === 'Individual' ? (s.atletas?.usuarios?.nombre || '1v1') : (g?.nombre || 'Grupo');
      const ini = hhmm(g?.hora_inicio);
      const fin = hhmm(g?.hora_fin);
      let chip = 'PROGRAMADA', chipColor = C.text3, live = false;
      if (s.se_logro) { chip = 'EVALUADA'; chipColor = C.ok; }
      else if (ini && fin && ahora >= ini && ahora <= fin) { chip = 'EN CURSO'; chipColor = C.ok; live = true; }
      else if (fin && ahora > fin) { chip = 'REALIZADA'; chipColor = C.text3; }
      return {
        time: ini || '—',
        title: `${quien} · ${s.objetivo_tipo || s.tipo}`,
        sub: [s.usuarios?.nombre, s.tipo === 'Individual' ? 'Sesión 1v1' : null].filter(Boolean).join(' · ') || 'Sesión del club',
        chip,
        chipColor,
        live,
      };
    })
    .sort((a, b) => (a.time === '—' ? '99' : a.time).localeCompare(b.time === '—' ? '99' : b.time))
    .slice(0, 6);
}

// Motivo corto + colores de una fila "en riesgo", derivado de las MISMAS señales
// que tieneSenal (estado de recuperación / hidratación del readiness diario).
function motivoRiesgo(a) {
  const est = (a.estado_recuperacion || '').toLowerCase();
  if (est.includes('sobre') || est.includes('agot')) return { motivo: 'Sobreentrenamiento · carga alta', mc: C.danger, hue: 'red' };
  if (est.includes('fatiga')) return { motivo: 'Fatiga silenciosa', mc: C.danger, hue: 'red' };
  if (a.readiness_hoy && a.readiness_hoy.color_orina >= 5) return { motivo: 'Hidratación baja (readiness)', mc: C.warn, hue: 'orange' };
  if (a.estado_recuperacion && a.estado_recuperacion !== 'Óptimo') return { motivo: `Estado: ${a.estado_recuperacion}`, mc: C.warn, hue: 'orange' };
  return { motivo: 'En seguimiento', mc: C.warn, hue: 'orange' };
}

// jsonb de fn_retencion_club (v31) + lista de atletas → forma que consume
// ctxRetencion. `riesgo` sale del proxy de señales (tieneSenal), no de la RPC.
// Sin datos reales (RPC null o club vacío/total 0) → DUENO_MOCK.retencion completo.
function mapRetencion(ret, list) {
  const total = Number(ret?.total) || 0;
  if (!ret || total === 0) return DUENO_MOCK.retencion;
  const activos = Number(ret.activos) || 0;
  const ab = (ret.altas_bajas || []).map((x) => ({ m: ymLabel(x.ym), a: Number(x.altas) || 0, b: Number(x.bajas) || 0 }));
  const neto = ab.reduce((s, x) => s + x.a - x.b, 0);
  // Solo atletas con membresía activa entran en "en riesgo": un atleta ya dado de
  // baja no debe reaparecer aquí (el gauge server-side ya lo descontó). El estado
  // ausente se trata como activo (columna v31 NOT NULL DEFAULT 'activo').
  const riesgo = (list || []).filter((a) => esActivo(a) && tieneSenal(a)).slice(0, 6).map((a) => {
    const r = motivoRiesgo(a);
    return { id: a.atleta_id, initial: (a.nombre || '?').charAt(0).toUpperCase(), hue: r.hue, name: a.nombre || 'Atleta', motivo: r.motivo, mc: r.mc };
  });
  return {
    retPct: Number(ret.ret_pct) || 0,
    activosLine: `${activos} de ${total} atletas siguen activos.`,
    netoLine: `${neto >= 0 ? '+' : ''}${neto} NETO · ÚLT. ${ab.length} MESES`,
    ab,
    riesgo,
  };
}

/**
 * Panel del dueño con datos reales donde existen, sobre DUENO_MOCK. Degrada a
 * mock completo en cualquier error.
 */
export async function fetchDuenoPanel(user) {
  try {
    const res = await fetchTodosLosAtletas(user);
    const list = Array.isArray(res) ? res : res?.data || [];
    const allIds = list.map((a) => a.atleta_id).filter(Boolean);

    const now = new Date();
    const p1 = mesAtras(1);
    const p2 = mesAtras(2);

    const [asisAll, asis14, asis16, asis18, pJul, pJun, pMay, clubConfig, coachRows, retClub, realHeat, nSolicitudes, agendaHoy] = await Promise.all([
      fetchAsistenciaPct(allIds, 30),
      fetchAsistenciaPct(idsCat(list, '14'), 30),
      fetchAsistenciaPct(idsCat(list, '16'), 30),
      fetchAsistenciaPct(idsCat(list, '18'), 30),
      fetchPagosMes(now.getMonth() + 1, now.getFullYear()).catch(() => []),
      fetchPagosMes(p1.m, p1.y).catch(() => []),
      fetchPagosMes(p2.m, p2.y).catch(() => []),
      fetchClubConfig(user.club).catch(() => null),
      fetchCoachStats(30).catch(() => []),
      fetchRetencionClub(5).catch(() => null),
      fetchOcupacionCancha(60).catch(() => null),
      contarSolicitudesPendientes().catch(() => 0),
      fetchAgendaHoy(user.club).catch(() => []),
    ]);

    // Meta real del donut de Finanzas (club_config.meta_recaudacion_mensual, v31);
    // null (columna ausente / sin config) → meta derivada (recaudado + por cobrar).
    const metaReal = Number(clubConfig?.meta_recaudacion_mensual) || null;
    const finanzas = { may: derivePagos(pMay, metaReal), jun: derivePagos(pJun, metaReal), jul: derivePagos(pJul, metaReal) };
    const julF = finanzas.jul;
    const pctMeta = julF.meta ? Math.round((100 * julF.recaudado) / julF.meta) : 0;
    // "Atletas activos" y "en riesgo" cuentan solo membresías activas, para no
    // seguir sumando a quien ya fue dado de baja (cuadra con el gauge de Retención).
    const activos = list.filter(esActivo);
    const enRiesgo = activos.filter(tieneSenal).length;

    // KPIs: colores/bordes del molde mock, pero label/val/sub SIEMPRE reales o
    // neutros — jamás heredar un sub del mock ('+2 pts vs junio', '3 de baja')
    // con un val real, que inventaría tendencias idénticas en todos los clubes.
    const ymNow = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const abNow = (retClub?.altas_bajas || []).find((x) => String(x.ym).startsWith(ymNow));
    const netoMes = abNow ? (Number(abNow.altas) || 0) - (Number(abNow.bajas) || 0) : null;
    const base = DUENO_MOCK.kpis;
    const kpis = [
      { ...base[0], label: `RECAUDADO · ${MESES_UP[now.getMonth()]}`, val: money(julF.recaudado), sub: `${pctMeta}% de la meta` },
      { ...base[1], val: `${asisAll}%`, sub: 'Promedio 30 días' },
      { ...base[2], val: String(activos.length), sub: netoMes == null ? 'membresías activas' : `${netoMes >= 0 ? '+' : ''}${netoMes} este mes` },
      { ...base[3], val: String(enRiesgo), sub: enRiesgo > 0 ? 'con señales de recuperación' : 'sin señales hoy' },
    ];

    // Asistencia: pct/sub reales y trend NEUTRO ('30 DÍAS') — sin tendencia
    // histórica real todavía, no se hereda el '+2 VS JUN' inventado del mock.
    // Categoría sin atletas → 0% y sub honesto, no el pct del mock.
    const n14 = countCat(list, '14');
    const n16 = countCat(list, '16');
    const n18 = countCat(list, '18');
    const catReal = (n, pct) => ({
      pct: n ? pct : 0,
      trend: '30 DÍAS',
      sub: n ? `${n} ${n === 1 ? 'atleta' : 'atletas'} en la categoría.` : 'Sin atletas en la categoría.',
    });
    const asistencia = {
      todas: { pct: asisAll, trend: '30 DÍAS', sub: `Promedio de ${list.length} atletas (30 días).` },
      s14: catReal(n14, asis14),
      s16: catReal(n16, asis16),
      s18: catReal(n18, asis18),
    };
    const asisByCat = { s14: asis14, s16: asis16, s18: asis18 };
    const catCount = { s14: n14, s16: n16, s18: n18 };
    const catRows = DUENO_MOCK.catRows.map((r) => ({
      ...r,
      pct: catCount[r.k] ? asisByCat[r.k] : 0,
      sub: catCount[r.k] ? `${catCount[r.k]} atletas` : 'Sin atletas',
    }));

    // D4 · Equipo — ranking real de coaches (fn_coach_stats, v31); [] → mock.
    const coaches = (coachRows && coachRows.length) ? coachRows : DUENO_MOCK.coaches;
    // D5 · Retención — total/activos/altas-bajas reales (fn_retencion_club, v31)
    // + `riesgo` del proxy de señales; sin datos reales → DUENO_MOCK.retencion.
    const retencion = mapRetencion(retClub, list);
    // D3 · Heatmap de ocupación real (v32). null (DB vacía / sin permiso /
    // error) → HEAT_VACIO: rejilla libre rotulada "sin datos", no el mock.
    const heat = realHeat || HEAT_VACIO;

    // D2 · Filas de acción reales del mes en curso: comprobantes por verificar
    // y vencidos/mora, desde los mismos pagos ya traídos (fetchPagosMes).
    const pagosVerificar = (pJul || []).filter((p) => p.estado === 'Por Verificar');
    const verificar = pagosVerificar.map((p) => {
      const nombre = p.atletas?.usuarios?.nombre || 'Atleta';
      return {
        id: p.id,
        initial: nombre.charAt(0).toUpperCase(),
        hue: 'gold',
        name: nombre,
        sub: `${p.tipo === 'Adicional' ? 'Cargo adicional' : 'Mensualidad'} · comprobante por revisar`,
        monto: money((p.monto_final || 0) - (p.monto_pagado || 0)),
      };
    }).slice(0, 6);
    const vencidos = (pJul || []).filter((p) => p.estado === 'Vencido').map((p) => {
      const nombre = p.atletas?.usuarios?.nombre || 'Atleta';
      const dias = p.fecha_vencimiento ? Math.max(Math.ceil((now - new Date(p.fecha_vencimiento)) / 86400000), 1) : null;
      return {
        id: p.id,
        initial: nombre.charAt(0).toUpperCase(),
        hue: dias != null && dias >= 15 ? 'red' : 'orange',
        name: nombre,
        sub: [p.grupos_entrenamiento?.nombre, dias != null ? `${dias} ${dias === 1 ? 'día' : 'días'} de mora` : null].filter(Boolean).join(' · ') || 'Pago vencido',
        monto: money((p.monto_final || 0) - (p.monto_pagado || 0)),
        dias: dias || 0,
      };
    }).sort((a, b) => b.dias - a.dias).slice(0, 6);

    // D1 · Alertas accionables 100% reales: cada una existe solo si hay señal
    // (solicitudes v33, vencidos/por verificar del mes, riesgo por señales).
    // Sin señal real → lista vacía, nunca las alertas inventadas del mock.
    const alertas = [];
    if (nSolicitudes > 0) {
      alertas.push({
        icon: '📥',
        text: `${nSolicitudes} ${nSolicitudes === 1 ? 'solicitud de registro pendiente' : 'solicitudes de registro pendientes'}`,
        cta: 'REVISAR ►',
        color: C.info,
        border: 'rgba(96,165,250,.3)',
        href: '/admin/atletas',
      });
    }
    if (julF.vencCount > 0) {
      alertas.push({
        icon: '💳',
        text: `${julF.vencCount} ${julF.vencCount === 1 ? 'pago vencido' : 'pagos vencidos'} · $${julF.vencMonto} en mora`,
        cta: 'FINANZAS ►',
        color: C.danger,
        border: 'rgba(239,68,68,.3)',
        goTab: 'finanzas',
      });
    }
    if (enRiesgo > 0) {
      alertas.push({
        icon: '📉',
        text: `${enRiesgo} ${enRiesgo === 1 ? 'atleta con señales' : 'atletas con señales'} de riesgo`,
        cta: 'RETENCIÓN ►',
        color: C.warn,
        border: 'rgba(251,146,60,.3)',
        goTab: 'retencion',
      });
    }
    if (pagosVerificar.length > 0) {
      alertas.push({
        icon: '🧾',
        text: pagosVerificar.length === 1
          ? `1 pago por verificar · ${nombreCorto(pagosVerificar[0].atletas?.usuarios?.nombre)}`
          : `${pagosVerificar.length} pagos por verificar`,
        cta: 'VERIFICAR ►',
        color: C.gold,
        border: 'rgba(255,215,0,.3)',
        goTab: 'finanzas',
      });
    }

    return {
      ...DUENO_MOCK,
      demo: false,
      clubNombre: user.club || '', // título del RESUMEN (club real, no 'Black Gold')
      kpis,
      finanzas,
      asistencia,
      catRows,
      coaches,
      retencion,
      heat,
      alertas,
      hoy: agendaHoy,
      verificar,
      vencidos,
    };
  } catch {
    return DUENO_MOCK; // degradación defensiva
  }
}
