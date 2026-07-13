/* ============================================================
   Capa de datos de la Vista Padre Arcade (fase 5 — Supabase real).

   Reutiliza los servicios/helpers ya probados por PadreDashboard. Trampas
   de identidad (del spec):
     - user.id           = usuarios.id (padre_id)
     - hijo.id           = usuario_id del atleta  → fetchMisiones(hijo.id)
     - hijo.atleta_id    = atletas.id             → convocatorias/pagos/etc.
   Nivel/XP salen de getXPProgress(xp_total) (NO de overall_score, que es el
   otro sistema de rango). El "PWR" numérico del HUD = overall_score.
   ============================================================ */
import { fetchPadreData } from '../../api/padreService';
import { fetchMisiones } from '../../api/misionesService';
import { fetchConvocatoriasAtleta, responderRSVP } from '../../api/eventosService';
import { fetchEstadoCuentaPadre, fetchClubConfig, subirComprobante } from '../../api/pagosService';
import { fetchComunicacionesParaPadre } from '../../api/comunicacionesService';
import { getSubPilarScores } from '../../lib/radarCalc';
import { getXPProgress } from '../../lib/xpProgress';
import { linkWhatsApp } from '../../lib/plantillasWhatsApp';

export { responderRSVP, subirComprobante, linkWhatsApp };

/** Carga base del padre: hijos + anuncios. */
export async function fetchPadrePanel(user) {
  const data = await fetchPadreData(user.id);
  return { hijos: data?.hijos || [], anuncios: data?.anuncios || [] };
}

/** Detalle del hijo seleccionado (misiones/eventos/pagos/config/comunicados). */
export async function fetchHijoDetalle(user, hijo) {
  const [misiones, convocatorias, estadoCuenta, clubConfig, comunicaciones] = await Promise.all([
    fetchMisiones(hijo.id).catch(() => []), // hijo.id = usuario_id
    fetchConvocatoriasAtleta([hijo.atleta_id]).catch(() => []),
    fetchEstadoCuentaPadre(hijo.atleta_id).catch(() => ({ abiertos: [], historial: [] })),
    fetchClubConfig(user.club).catch(() => null),
    fetchComunicacionesParaPadre(user.id, hijo.atleta_id).catch(() => []),
  ]);
  return { misiones, convocatorias, estadoCuenta, clubConfig, comunicaciones };
}

/** 7 pilares del radar (omite `resistencia`, como PadreDashboard). */
export const PILARES_RADAR = [
  { key: 'fuerza', label: 'FUERZA' },
  { key: 'explosividad', label: 'EXPLO' },
  { key: 'movilidad', label: 'MOVIL' },
  { key: 'tiro', label: 'TIRO' },
  { key: 'agilidad', label: 'AGIL' },
  { key: 'tactica', label: 'TACT' },
  { key: 'resiliencia', label: 'RESIL' },
];

export function radar7(hijo) {
  const scores = getSubPilarScores(hijo?._evaluaciones || []);
  return PILARES_RADAR.map((p) => ({ ...p, value: Math.max(0, Math.min(100, scores?.[p.key] || 0)) }));
}

/** Nivel/XP para la cabecera y las celdas (sistema XP, no overall). */
export function xpInfo(hijo) {
  const p = getXPProgress(hijo?.xp_total || 0);
  const esMax = p.nextLevelName === 'MAX';
  return {
    current: p.current,
    required: p.required,
    percentage: p.percentage,
    nextLevelName: p.nextLevelName,
    rangoNombre: p.currentRango?.nombre || 'Rookie',
    emoji: p.currentRango?.emoji || '🟤',
    hex: p.currentRango?.hex || '#9CA3AF',
    faltan: esMax ? 0 : Math.max(0, p.required - p.current),
    esMax,
    filled: Math.max(0, Math.min(10, Math.round((p.percentage / 100) * 10))),
  };
}

/** Frase "en palabras simples": mejor y peor pilar con datos. */
export function palabrasSimples(radar) {
  const conDatos = (radar || []).filter((p) => p.value > 0);
  if (conDatos.length < 2) return null;
  const orden = [...conDatos].sort((a, b) => b.value - a.value);
  return { mejor: orden[0], peor: orden[orden.length - 1] };
}

const NOMBRE_PILAR = {
  fuerza: 'su fuerza',
  explosividad: 'su explosividad',
  movilidad: 'su movilidad',
  tiro: 'el tiro',
  agilidad: 'su agilidad',
  tactica: 'la táctica',
  resiliencia: 'su resiliencia',
};
export const nombrePilar = (key) => NOMBRE_PILAR[key] || key;

/** Próximo evento publicado con fecha futura. */
export function proximoEvento(convocatorias) {
  const hoy = new Date().toISOString().split('T')[0];
  const futuras = (convocatorias || []).filter((c) => c?.eventos?.fecha_evento && c.eventos.fecha_evento >= hoy);
  futuras.sort((a, b) => String(a.eventos.fecha_evento).localeCompare(String(b.eventos.fecha_evento)));
  return futuras[0] || null;
}

/** Pago abierto más relevante (o null = al día). */
export function pagoActual(estadoCuenta) {
  return (estadoCuenta?.abiertos || [])[0] || null;
}

/** Misión "actual" del hijo: la que está en revisión, o la primera sin completar. */
export function misionActual(misiones) {
  const list = misiones || [];
  return (
    list.find((m) => !m.completada && m.estado === 'pendiente') ||
    list.find((m) => !m.completada) ||
    list[0] ||
    null
  );
}

/** Estado de misión → etiqueta del HUD. */
export function estadoMision(m) {
  if (!m) return { label: '—', tone: 'muted' };
  if (m.completada) return { label: 'COMPLETADA', tone: 'ok' };
  if (m.estado === 'pendiente') return { label: 'EN REVISIÓN', tone: 'ai' };
  return { label: 'PENDIENTE', tone: 'muted' };
}
