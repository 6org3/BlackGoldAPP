/* ============================================================
   Capa de datos del portal ATLETA Arcade (fase 5 — Supabase real).

   Reutiliza los servicios/helpers ya probados por Vista Padre y Misiones.
   Trampas de identidad (del spec, iguales que padreData):
     - user.id        = usuarios.id (usuario_id)  → fetchMisiones(user.id)
     - user.atleta_id = atletas.id                → convocatorias / eventos / sesiones
   Nivel/XP salen de xpInfo(getXPProgress(xp_total)); el "PWR" del HUD =
   overall_score. Produce el MISMO objeto `data` que ATLETA_MOCK, para que los
   selectores no ramifiquen demo vs real.
   ============================================================ */
import { supabase } from '../../api/supabaseClient';
import { fetchMisiones, completarMision } from '../../api/misionesService';
import { fetchConvocatoriasAtleta, fetchTableroConvocados, responderRSVP } from '../../api/eventosService';
import { fetchSesionesAtleta } from '../../api/sesionesEntrenamientoService';
import { radar7, xpInfo, fichaFisica } from './padreData';

export { completarMision, responderRSVP };

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const hoyISO = () => new Date().toISOString().slice(0, 10);

/** Línea de fecha corta del evento (sin corrimiento de zona horaria). */
function fechaEventoLine(ev) {
  if (!ev?.fecha_evento) return '';
  const [y, m, d] = String(ev.fecha_evento).slice(0, 10).split('-').map(Number);
  let fecha = '';
  if (y && m && d) {
    const dt = new Date(y, m - 1, d);
    fecha = `${DIAS[dt.getDay()]} ${d} ${MESES[m - 1]}`;
  }
  return [fecha, (ev.hora_inicio || '').slice(0, 5), ev.sede].filter(Boolean).join(' · ');
}

const LUGAR = { cancha: 'CANCHA', casa: 'CASA', ambos: 'TODO LUGAR' };

/** Estado DB de progreso_misiones → estado del diseño Arcade. */
function estadoMisionDesign(m) {
  if (m.estado === 'aprobada') return 'completada';
  if (m.estado === 'pendiente_aprobacion') return m.completada ? 'revision' : 'propuesta';
  return 'activa'; // pendiente
}

/** Misión del servicio → tarjeta del HUD. TODO: no hay progreso por-día real,
    así que las celdas se derivan del estado (completada/revisión = llenas). */
function mapMision(m) {
  const estado = estadoMisionDesign(m);
  const tot = 5;
  const prog = estado === 'completada' || estado === 'revision' ? tot : 0;
  return {
    id: m.id,
    progresoId: m.progreso_id,
    titulo: m.titulo,
    sub: m.descripcion || '',
    lugar: LUGAR[m.contexto] || 'TODO LUGAR',
    pilar: (m.pilar || '').toUpperCase(),
    xp: m.xpRecompensa || 0,
    estado,
    prog,
    tot,
    quiz: Array.isArray(m.quiz) ? m.quiz : [],
    open: estado === 'activa' || estado === 'revision',
  };
}

/** Alerta IA "readiness" ligera derivada del propio `user` (sin gateway).
    TODO: enriquecer con brainService.fetchReadinessAtleta (alertas priorizadas). */
export function alertaReadiness(user) {
  const est = (user?.estado_recuperacion || '').toLowerCase();
  if (est.includes('sobre') || est.includes('agot'))
    return { tone: 'danger', text: 'Tu carga viene alta. Prioriza descanso y cuéntale al coach cómo te sientes.' };
  if (est.includes('fatiga'))
    return { tone: 'warn', text: 'Señales de fatiga silenciosa. Duerme bien y cuida la hidratación hoy.' };
  const r = user?.readiness_hoy || null;
  const orina = r?.color_orina ?? null;
  if (typeof orina === 'number' && orina >= 5)
    return { tone: 'cyan', text: 'Toma 2L de agua hoy — tu readiness lo pide antes del entrenamiento.' };
  return null;
}

/** Sesión de HOY para "hoy entrenas". El log de entrenamiento no tiene hora,
    así que solo mostramos algo si hay una sesión con fecha de hoy. TODO: cablear
    una agenda real del atleta (sesiones_programadas por grupo). */
function hoyEntrenasDe(sesiones) {
  const hoy = hoyISO();
  const s = (sesiones || []).find((x) => String(x.fecha || '').slice(0, 10) === hoy);
  if (!s) return null;
  return {
    time: '',
    titulo: s.pilar_objetivo ? `Entrenamiento · ${s.pilar_objetivo}` : 'Entrenamiento de hoy',
    sub: s.notas || s.volumen_series_reps || 'Registrado por el coach',
    chip: 'HOY',
  };
}

/** XP de las últimas 6 semanas (ledger xp_eventos, v31) para la pantalla de
    Progreso. Ventana móvil de 7 días; S6 = semana actual. Devuelve null (→ el
    selector cae a WEEKS_MOCK) si no hay eventos o la tabla no existe. */
async function fetchXPSemanal(atletaId) {
  if (!atletaId) return null;
  const desde = new Date();
  desde.setDate(desde.getDate() - 7 * 6);
  const { data, error } = await supabase
    .from('xp_eventos')
    .select('delta, created_at')
    .eq('atleta_id', atletaId)
    .gte('created_at', desde.toISOString());
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const WEEK = 7 * 24 * 3600 * 1000;
  const ahora = Date.now();
  const buckets = Array.from({ length: 6 }, () => 0);
  data.forEach((e) => {
    const semAtras = Math.floor((ahora - new Date(e.created_at).getTime()) / WEEK); // 0 = esta semana
    const idx = 5 - semAtras;
    if (idx >= 0 && idx < 6) buckets[idx] += Number(e.delta) || 0;
  });
  return buckets.map((xp, i) => ({ label: `S${i + 1}`, xp }));
}

/** Racha de asistencia: nº de DÍAS con `Presente` consecutivos más recientes
    (RLS `asistencia_select_propio`). Solo `Ausente` (falta sin justificar)
    corta; `Justificada`/`Lesionado` no cuentan ni rompen la racha.
    Devuelve null si no hay asistencia (→ el HUD no muestra el chip 🔥, igual
    que 0). Un 0 real (falta reciente) también oculta el chip por el `ctx.racha ?`
    del render.

    `fecha` es date (sin hora) y desde v22 puede haber >1 fila por día (pase de
    lista con sesion_id NULL + sesión de Modo Cancha), así que se desempata por
    `created_at` desc para que "más reciente primero" sea determinista. */
async function fetchRacha(atletaId) {
  if (!atletaId) return null;
  const { data, error } = await supabase
    .from('asistencia')
    .select('estado, fecha, created_at')
    .eq('atleta_id', atletaId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(90);
  if (error || !Array.isArray(data) || data.length === 0) return null;
  return contarRachaDias(data);
}

/** Cuenta días de racha desde filas de asistencia YA ordenadas por `fecha` desc.
    Deduplica por día: desde v22 puede haber >1 fila por fecha (pase de lista con
    sesion_id NULL + sesión de Modo Cancha), y sumar por fila inflaría la racha.
    Estado del día: alguna 'Ausente' rompe; alguna 'Presente' sin 'Ausente' suma
    1; solo 'Justificada'/'Lesionado' ni suma ni rompe. Pura (exportada para test). */
export function contarRachaDias(filas) {
  const estadosPorDia = new Map(); // Map conserva orden de inserción = fecha desc
  for (const r of filas) {
    if (!estadosPorDia.has(r.fecha)) estadosPorDia.set(r.fecha, new Set());
    estadosPorDia.get(r.fecha).add(r.estado);
  }
  let racha = 0;
  for (const estados of estadosPorDia.values()) {
    if (estados.has('Ausente')) break;
    if (estados.has('Presente')) racha += 1;
  }
  return racha;
}

// Nombres canónicos de insignia (espejo de AXIS_DB en canchaData.js): lo que el
// Modo Cancha guarda en observaciones_cancha.insignia al poner 5★ en un eje.
const INSIGNIA_KEYS = ['Motor Inagotable', 'Mamba Mentality', 'Líder', 'Sangre Fría'];

/** Conteo real de insignias del atleta desde observaciones_cancha.insignia
    (texto con nombres separados por ', '; RLS `observaciones_select_propio`).
    Devuelve { '<nombre>': n } por cada insignia canónica, o null en error (→ el
    selector cae a los conteos de INSIGNIAS_MOCK). Éxito con 0 insignias devuelve
    todo en 0 (grid real: las 4 bloqueadas). */
async function fetchInsignias(atletaId) {
  if (!atletaId) return null;
  const { data, error } = await supabase
    .from('observaciones_cancha')
    .select('insignia')
    .eq('atleta_id', atletaId)
    .not('insignia', 'is', null);
  if (error || !Array.isArray(data)) return null;
  const counts = Object.fromEntries(INSIGNIA_KEYS.map((k) => [k, 0]));
  data.forEach((r) => {
    String(r.insignia || '').split(',').forEach((raw) => {
      const name = raw.trim();
      if (name in counts) counts[name] += 1;
    });
  });
  return counts;
}

/**
 * Carga el panel del atleta. Cada fetch degrada a vacío/null en error para no
 * romper el HUD (patrón padreData). Devuelve el objeto `data` del selector.
 */
export async function fetchAtletaPanel(user) {
  const [misionesRaw, convocatorias, sesiones, weeks, racha, insigniasCounts] = await Promise.all([
    fetchMisiones(user.id).catch(() => []), // user.id = usuario_id
    fetchConvocatoriasAtleta([user.atleta_id]).catch(() => []),
    fetchSesionesAtleta(user.atleta_id).catch(() => []),
    fetchXPSemanal(user.atleta_id).catch(() => null),
    fetchRacha(user.atleta_id).catch(() => null),
    fetchInsignias(user.atleta_id).catch(() => null),
  ]);

  const misiones = (misionesRaw || []).map(mapMision);
  // Misión destacada: primera activa (o cualquiera sin completar).
  const destacadaSrc = misiones.find((m) => m.estado === 'activa') || misiones.find((m) => m.estado !== 'completada') || null;
  const misionDestacada = destacadaSrc
    ? { id: destacadaSrc.id, titulo: destacadaSrc.titulo, sub: `${LUGAR_INV(destacadaSrc.lugar)} · ${destacadaSrc.pilar}`, xp: destacadaSrc.xp, prog: destacadaSrc.prog, tot: destacadaSrc.tot }
    : null;

  // Eventos: futuros → RSVP; pasados con resultado → historial.
  const hoy = hoyISO();
  const eventoIds = (convocatorias || []).map((c) => c.eventos?.id).filter(Boolean);
  const tablero = eventoIds.length ? await fetchTableroConvocados(eventoIds).catch(() => ({})) : {};

  const eventos = [];
  const historial = [];
  (convocatorias || []).forEach((c) => {
    const ev = c.eventos;
    if (!ev) return;
    const fev = String(ev.fecha_evento || '').slice(0, 10);
    if (fev >= hoy) {
      const conteo = tablero[ev.id] || {};
      eventos.push({
        id: c.id, // convocado id — clave del RSVP
        eventoId: ev.id,
        icon: ev.tipo === 'torneo' ? '⚡' : '🏀',
        iconHue: ev.tipo === 'torneo' ? 'gold' : 'green',
        titulo: ev.titulo || (ev.rival ? `vs ${ev.rival}` : 'Evento'),
        sub: fechaEventoLine(ev),
        conf: conteo.asiste || 0,
        tot: conteo.total || 0,
        going: c.estado_rsvp === 'asiste',
      });
    } else if (ev.resultado) {
      const res = ev.resultado === 'ganado' ? 'W' : ev.resultado === 'perdido' ? 'L' : 'E';
      historial.push({
        res,
        resHue: res === 'W' ? 'green' : res === 'L' ? 'red' : 'gold',
        score: ev.marcador_propio != null && ev.marcador_rival != null ? `${ev.marcador_propio}–${ev.marcador_rival}` : '',
        titulo: ev.titulo || (ev.rival ? `vs ${ev.rival}` : 'Partido'),
        sub: fechaEventoLine(ev),
      });
    }
  });

  const xp = xpInfo(user);
  return {
    demo: false,
    profile: {
      nombre: user.nombre || 'Atleta',
      inicial: (user.nombre || '?').charAt(0),
      categoria: (user.categoria || '').toUpperCase(),
      fechaLine: null,
      pwr: user.overall_score || 0,
      nivelDesarrollo: user.nivel_desarrollo || 'Micro',
      racha, // racha de asistencia real (o null → chip 🔥 oculto)
      xp,
    },
    radar: radar7(user),
    // user = usuarios + atletas mergeados (authService), así que peso/talla/
    // envergadura ya vienen ahí — sin fetch extra.
    fisico: fichaFisica(user),
    hoyEntrenas: hoyEntrenasDe(sesiones),
    alertaIA: alertaReadiness(user),
    misionDestacada,
    misiones,
    eventos,
    historial,
    weeks, // XP semanal real (xp_eventos, v31) o null → el selector cae a WEEKS_MOCK.
    insigniasCounts, // conteo real por insignia (observaciones_cancha) o null → INSIGNIAS_MOCK.
  };
}

// Etiqueta lugar → forma legible para el subtítulo de la misión destacada.
function LUGAR_INV(l) {
  return l === 'CANCHA' ? 'Cancha' : l === 'CASA' ? 'Casa' : 'Todo lugar';
}
