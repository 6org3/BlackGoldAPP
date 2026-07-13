/* ============================================================
   Capa de datos del panel DUEÑO Arcade (fase 5 — Supabase real, parcial).

   Estrategia: OVERLAY. Parte de DUENO_MOCK y reemplaza los números que SÍ
   existen hoy en Supabase — KPIs del resumen, finanzas por mes (recaudado/por
   cobrar/vencidos/becados), asistencia media y por categoría, el heatmap de
   ocupación de cancha (v32, fn_ocupacion_cancha), el ranking de coaches (v31,
   fn_coach_stats), la retención/altas-bajas (v31, fn_retencion_club) y la meta
   de recaudación (v31, club_config) — reutilizando los servicios y la derivación
   exacta de ClubHomePage. Lo que aún no tiene fuente (filas de acción verificar/
   recordar, "hoy en el club" club-wide) queda mock, marcado `// TODO`. Cada capa
   degrada a mock por separado (heat → DUENO_MOCK.heat, coaches/retención → mock);
   ante excepción, al DUENO_MOCK completo.

   Nota de meses: el prototipo asume may/jun/jul. Como hoy es julio 2026 eso
   calza con los últimos 3 meses; TODO: etiquetas de mes dinámicas fuera de julio.
   ============================================================ */
import { fetchTodosLosAtletas } from '../../api/atletasService';
import { fetchAsistenciaPct } from '../../api/asistenciaService';
import { fetchPagosMes, fetchClubConfig } from '../../api/pagosService';
import { fetchCoachStats } from '../../api/coachesService';
import { fetchRetencionClub } from '../../api/retencionService';
import { fetchOcupacionCancha } from '../../api/ocupacionService';
import { tieneSenal } from '../../lib/senalesAtleta';
import { C } from './arcadeTokens';
import { DUENO_MOCK } from './duenoMock';

const money = (n) => '$' + (Math.round(Number(n) || 0)).toLocaleString('en-US');
const MESES_UP = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const ymLabel = (ym) => MESES_UP[(Number(String(ym).slice(5, 7)) || 0) - 1] || String(ym);
const idsCat = (list, digits) => list.filter((a) => String(a.categoria || '').includes(digits)).map((a) => a.atleta_id).filter(Boolean);
const countCat = (list, digits) => list.filter((a) => String(a.categoria || '').includes(digits)).length;

// Derivación de un mes de pagos → bucket de finanzas (misma lógica que AdminPagos/
// ClubHomePage: recaudado = Pagado + parte cobrada de Abonado/Vencido).
function derivePagos(pagos, metaReal = null) {
  let recaudado = 0, cobrar = 0, vencCount = 0, vencMonto = 0, becados = 0;
  (pagos || []).forEach((p) => {
    const monto = p.monto_final || 0;
    const pagado = p.monto_pagado || 0;
    if (p.estado === 'Pagado') recaudado += monto;
    else if (p.estado === 'Pendiente' || p.estado === 'Por Verificar') cobrar += monto - pagado;
    else if (p.estado === 'Abonado' || p.estado === 'Vencido') { recaudado += pagado; cobrar += monto - pagado; }
    if (p.estado === 'Vencido') { vencCount += 1; vencMonto += monto - pagado; }
    if (p.estado === 'Becado') becados += 1;
  });
  return {
    recaudado: Math.round(recaudado),
    cobrar: Math.round(cobrar),
    meta: metaReal || Math.round(recaudado + cobrar), // meta real (club_config, v31) o derivada
    men: Math.round(recaudado), // mensualidades ≈ recaudado del mes
    ses: DUENO_MOCK.finanzas.jul.ses, // TODO: 1v1 real (fetchCargosExtra)
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
  const riesgo = (list || []).filter(tieneSenal).slice(0, 6).map((a) => {
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

    const [asisAll, asis14, asis16, asis18, pJul, pJun, pMay, clubConfig, coachRows, retClub, realHeat] = await Promise.all([
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
    ]);

    // Meta real del donut de Finanzas (club_config.meta_recaudacion_mensual, v31);
    // null (columna ausente / sin config) → meta derivada (recaudado + por cobrar).
    const metaReal = Number(clubConfig?.meta_recaudacion_mensual) || null;
    const finanzas = { may: derivePagos(pMay, metaReal), jun: derivePagos(pJun, metaReal), jul: derivePagos(pJul, metaReal) };
    const julF = finanzas.jul;
    const pctMeta = julF.meta ? Math.round((100 * julF.recaudado) / julF.meta) : 0;
    const enRiesgo = list.filter(tieneSenal).length;

    const base = DUENO_MOCK.kpis;
    const kpis = [
      { ...base[0], val: money(julF.recaudado), sub: `${pctMeta}% de la meta` },
      { ...base[1], val: `${asisAll}%` },
      { ...base[2], val: String(list.length) },
      { ...base[3], val: String(enRiesgo) },
    ];

    const n14 = countCat(list, '14');
    const n16 = countCat(list, '16');
    const n18 = countCat(list, '18');
    const asistencia = {
      todas: { ...DUENO_MOCK.asistencia.todas, pct: asisAll, sub: `Promedio de ${list.length} atletas (30 días).` },
      s14: { ...DUENO_MOCK.asistencia.s14, pct: n14 ? asis14 : DUENO_MOCK.asistencia.s14.pct },
      s16: { ...DUENO_MOCK.asistencia.s16, pct: n16 ? asis16 : DUENO_MOCK.asistencia.s16.pct },
      s18: { ...DUENO_MOCK.asistencia.s18, pct: n18 ? asis18 : DUENO_MOCK.asistencia.s18.pct },
    };
    const asisByCat = { s14: asis14, s16: asis16, s18: asis18 };
    const catCount = { s14: n14, s16: n16, s18: n18 };
    const catRows = DUENO_MOCK.catRows.map((r) => ({
      ...r,
      pct: catCount[r.k] ? asisByCat[r.k] : r.pct,
      sub: catCount[r.k] ? `${catCount[r.k]} atletas` : r.sub,
    }));

    // D4 · Equipo — ranking real de coaches (fn_coach_stats, v31); [] → mock.
    const coaches = (coachRows && coachRows.length) ? coachRows : DUENO_MOCK.coaches;
    // D5 · Retención — total/activos/altas-bajas reales (fn_retencion_club, v31)
    // + `riesgo` del proxy de señales; sin datos reales → DUENO_MOCK.retencion.
    const retencion = mapRetencion(retClub, list);
    // D3 · Heatmap de ocupación real (v32). null (DB vacía / sin permiso / error) →
    // conserva DUENO_MOCK.heat, que ya viene por el spread de arriba.
    const heat = realHeat || DUENO_MOCK.heat;

    return { ...DUENO_MOCK, demo: false, kpis, finanzas, asistencia, catRows, coaches, retencion, heat };
  } catch {
    return DUENO_MOCK; // degradación defensiva
  }
}
