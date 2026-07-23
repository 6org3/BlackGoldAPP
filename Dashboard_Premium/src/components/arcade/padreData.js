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
import { fetchEjercicios } from '../../api/sesionesService';
import { getSubPilarScores, RADAR_AXES } from '../../lib/radarCalc';
import { getXPProgress } from '../../lib/xpProgress';
import { linkWhatsApp } from '../../lib/plantillasWhatsApp';
import { resolverNombresEjercicios } from '../../lib/ejerciciosCatalogo';

export { responderRSVP, subirComprobante, linkWhatsApp };

/** Carga base del padre: hijos + sesiones + anuncios + catálogo de ejercicios
 *  (necesario para resolver ejercicios_ids a nombre en "Últimas sesiones"). */
export async function fetchPadrePanel(user) {
  const [data, ejercicios] = await Promise.all([
    fetchPadreData(user.id),
    fetchEjercicios(),
  ]);
  return { hijos: data?.hijos || [], sesiones: data?.sesiones || [], anuncios: data?.anuncios || [], ejercicios };
}

/** Últimas `limite` sesiones del hijo, con sus ejercicios resueltos contra el
 *  catálogo. `sesiones` ya viene ordenada por fecha desc (padreService) y mezcla
 *  INDIVIDUALES del hijo (atleta_id) con GRUPALES (atleta_id null) de su grupo.
 *
 *  Regla de atribución de las grupales: una grupal se muestra a ESTE hijo solo
 *  si `hijo.grupo_id` (caché legacy de la membresía básica) coincide con el
 *  `grupo_id` de la sesión. Si el hijo no tiene grupo_id, no se le atribuye
 *  ninguna grupal — con varios hermanos, evita mostrarle a uno el trabajo de
 *  otro grupo. La RLS v50 ya garantizó que toda grupal recibida pertenece a un
 *  grupo de ALGÚN hijo del padre; esto solo decide a cuál hijo asignarla. */
export function ultimasSesiones(sesiones, hijo, catalogo, limite = 3) {
  const hijoAtletaId = hijo?.atleta_id ?? null;
  const hijoGrupoId = hijo?.grupo_id ?? null;
  return (sesiones || [])
    .filter((s) =>
      s.atleta_id != null ? s.atleta_id === hijoAtletaId : hijoGrupoId != null && s.grupo_id === hijoGrupoId
    )
    .slice(0, limite)
    .map((s) => {
      const esGrupal = s.atleta_id == null;
      return {
        id: s.id,
        fecha: s.fecha,
        objetivoTipo: s.objetivo_tipo,
        objetivo: s.objetivo_descripcion,
        drills: resolverNombresEjercicios(s.ejercicios_ids, catalogo).map((d) => d.nombre || 'Ejercicio eliminado'),
        esGrupal,
        // Embed grupos_entrenamiento(nombre); si la RLS lo dejó null, fallback.
        grupoNombre: esGrupal ? s.grupos_entrenamiento?.nombre || 'Sesión grupal' : null,
      };
    });
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

/** Abreviaturas HUD por sub-pilar (decisión de producto: resistencia = CARDIO). */
const LABEL_ARCADE = {
  fuerza: 'FUERZA',
  explosividad: 'EXPLO',
  resistencia: 'CARDIO',
  movilidad: 'MOVIL',
  tiro: 'TIRO',
  agilidad: 'AGIL',
  tactica: 'TACT',
  resiliencia: 'RESIL',
};

/** Pilares del radar, derivados de la fuente única (taxonomia via RADAR_AXES). */
export const PILARES_RADAR = RADAR_AXES.map(({ key }) => ({ key, label: LABEL_ARCADE[key] || key.slice(0, 6).toUpperCase() }));

export function radarPilares(hijo) {
  const scores = getSubPilarScores(hijo?._evaluaciones || []);
  return PILARES_RADAR.map((p) => ({ ...p, value: Math.max(0, Math.min(100, scores?.[p.key] || 0)) }));
}

/** Ficha física para atleta/padre a partir de la fila de `atletas` (el user
    del atleta y el `hijo` del padre ya la traen mergeada). IMC sin etiqueta
    clínica a propósito: en menores se interpreta por percentiles de edad/sexo
    y clasificarlo aquí induciría a error — el número lo contextualiza el coach.
    Devuelve null si no hay ni peso ni talla (→ la UI muestra el estado vacío). */
export function fichaFisica(f) {
  const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const peso = num(f?.peso_kg);
  const talla = num(f?.talla_cm);
  const envergadura = num(f?.envergadura_cm);
  if (peso == null && talla == null) return null;
  const imc = peso != null && talla != null ? +(peso / (talla / 100) ** 2).toFixed(1) : null;
  const brazada = envergadura != null && talla != null ? +(envergadura - talla).toFixed(1) : null;
  return { peso, talla, imc, envergadura, brazada };
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
  resistencia: 'su resistencia',
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

/** Formato de moneda del widget de pagos: SIEMPRE 2 decimales ($20.40, no $20.4). */
export const fmtUSD = (n) => `$${(Number(n) || 0).toFixed(2)}`;

/** Descuento aplicado a un pago (hermanos, beca…) o null si no hay. La
    etiqueta preferida son las notas que registró el staff ('Desc. hermanos
    15%', 'Beca 50%'); si vienen vacías se genera con el %. `base` = precio
    sin descuento, para mostrar el antes/después. */
export function descuentoPago(pago) {
  const pct = Number(pago?.descuento_pct) || 0;
  if (pct <= 0) return null;
  const etiqueta = (pago?.notas || '').trim() || `Descuento ${pct}%`;
  return { pct, base: Number(pago?.monto_base) || 0, etiqueta };
}

/** Concepto corto para el chip de historial: distingue los cargos que no son
    la mensualidad (dos '✓ Julio Pagado' idénticos no dicen cuál era el grupo
    adicional). 'Grupo adicional: Acondicionamiento Físico' → 'Acondicionamiento
    Físico'. Null para mensualidades (el chip mantiene su 'Pagado'). */
export function conceptoCorto(p) {
  if (!p || p.tipo === 'Mensualidad') return null;
  const c = (p.concepto || '').trim().replace(/^Grupo adicional:\s*/i, '');
  return c || p.tipo || null;
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
