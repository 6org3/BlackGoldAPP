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
import { fetchMisiones, completarMision } from '../../api/misionesService';
import { fetchConvocatoriasAtleta, fetchTableroConvocados, responderRSVP } from '../../api/eventosService';
import { fetchSesionesAtleta } from '../../api/sesionesEntrenamientoService';
import { radar7, xpInfo } from './padreData';

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
function alertaReadiness(user) {
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

/**
 * Carga el panel del atleta. Cada fetch degrada a vacío/null en error para no
 * romper el HUD (patrón padreData). Devuelve el objeto `data` del selector.
 */
export async function fetchAtletaPanel(user) {
  const [misionesRaw, convocatorias, sesiones] = await Promise.all([
    fetchMisiones(user.id).catch(() => []), // user.id = usuario_id
    fetchConvocatoriasAtleta([user.atleta_id]).catch(() => []),
    fetchSesionesAtleta(user.atleta_id).catch(() => []),
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
      racha: null, // TODO: no hay racha en datos
      xp,
    },
    radar: radar7(user),
    hoyEntrenas: hoyEntrenasDe(sesiones),
    alertaIA: alertaReadiness(user),
    misionDestacada,
    misiones,
    eventos,
    historial,
  };
}

// Etiqueta lugar → forma legible para el subtítulo de la misión destacada.
function LUGAR_INV(l) {
  return l === 'CANCHA' ? 'Cancha' : l === 'CASA' ? 'Casa' : 'Todo lugar';
}
