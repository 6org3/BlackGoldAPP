// packages/analytics-core/clasificadorContexto.js
// Clasificador de CONTEXTO de una misión: ¿es trabajo de CASA (fuera de cancha/gym:
// hábitos, flexibilidad, recuperación, ver videos, leer, trabajo autónomo) o un
// EJERCICIO DE CANCHA/GYM (requiere aro, material del club, coach, formato grupal)
// que no encaja con el concepto de misión del club?
//
// Función PURA y testeable (regla del paquete: ES modules planos, sin dependencias).
// Da una SUGERENCIA con señales explicables; la decisión final es humana (curaduría
// del coach). La usan la tool `auditar_misiones` del MCP y los tests de la web.
//
// Diseñado genérico: las listas de señales y el motor de puntaje se reutilizan para
// una futura `clasificarContextoPrueba` sobre catalogo_ejercicios (revitalizar pruebas).

// Sub-pilares que, por naturaleza, tienden a un contexto (agente de exploración 2026-07-07):
// casa = hábitos/monitoreo/mental/contenido; cancha = requieren espacio/material/volumen.
const SUBPILAR_SESGO = {
  recuperacion: 'casa',
  resiliencia: 'casa',
  movilidad: 'casa',
  youtube: 'casa',      // contenido de consumo (legacy)
  articulo: 'casa',
  agilidad: 'cancha',
  resistencia: 'cancha',
  // mixtos (sin sesgo): tiro, fuerza, explosividad, tactica
};

const PILARES_CONTENIDO = new Set(['youtube', 'articulo']);

// Señales léxicas de CANCHA "fuertes": material del club, coach o formato grupal.
// Su presencia marca `esCanchaNoMision` (no puede hacerse en casa sin el club).
const CANCHA_FUERTE = [
  'aro', 'canasta', 'tablero', 'barra', 'mancuerna', 'pesa', 'disco', 'rack',
  '1rm', 'cajon', 'drop jump', 'cono', 'escalera', 'lane agility', 't-test', 'ttest',
  'navette', 'course navette', 'yo-yo', 'yoyo', 'bateria', 'baremo', 'cronometr',
  'coach revisa', 'coach valida', 'coach mide', 'el entrenador', 'supervis',
  'media cancha', 'cancha completa', 'gimnasio', 'gym',
];

// Señales de CANCHA "débiles": tienden a cancha pero no lo exigen por sí solas.
const CANCHA_DEBIL = [
  'pliometr', 'multisalto', 'drop', 'sprint', 'hiit', 'intervalos', 'defensa continua',
  '3c3', '4c4', '5c5', '3x3', '5x5', 'contactos de salto',
];

// Señales de CASA: ejecutable sin material del club, en casa, autónomo.
const CASA = [
  'pared', 'silla', 'cama', 'casa', 'patio', 'sala', 'habitacion', 'dormitorio', 'cuarto',
  'autocarga', 'peso corporal', 'sin material', 'sin equipamiento', 'sin canasta', 'sin aro',
  'video', 'clip', 'diario', 'respiracion', 'respira', 'visualiza', 'visualizacion',
  'lectura', 'leer', 'tumbado', 'acostado', 'form shooting', 'higiene', 'sueno', 'dormir',
  'hidrata', 'nutricion', 'desayuno', 'merienda', 'habito', 'estiramiento', 'mochila',
  'toalla', 'en casa',
];

// Negaciones que invierten una señal de cancha en señal de casa: "sin aro",
// "sin material"… Se eliminan del texto ANTES de contar señales de cancha (si no,
// 'aro'/'canasta' matchearían dentro de "sin aro"/"sin canasta"). En la lista CASA
// ya figuran "sin material/equipamiento/canasta/aro", así que cuentan para casa.
const NEGACIONES = [
  'sin aro', 'sin canasta', 'sin tablero', 'sin barra', 'sin pesas', 'sin pesa',
  'sin mancuerna', 'sin material', 'sin equipamiento', 'sin balon', 'sin gimnasio', 'sin gym',
];

const normalizar = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const quitarNegaciones = (texto) => {
  let t = texto;
  for (const neg of NEGACIONES) t = t.split(neg).join(' ');
  return t;
};

const contarSeñales = (texto, lista) => {
  const hits = [];
  for (const kw of lista) {
    if (texto.includes(kw)) hits.push(kw);
  }
  return hits;
};

/**
 * Clasifica el contexto de ejecución de una misión.
 * @param {Object} m - { titulo, descripcion, pilar, quiz, is_ai_generated, justificacion }
 * @returns {{ contextoSugerido: 'casa'|'cancha'|'ambos', esBasura: boolean,
 *            esCanchaNoMision: boolean, señales: string[], confianza: number }}
 */
export function clasificarContextoMision(m = {}) {
  const texto = normalizar(`${m.titulo || ''} ${m.descripcion || ''}`);
  const pilar = m.pilar || '';
  const quizNoVacio = Array.isArray(m.quiz) && m.quiz.length > 0;
  const justificacionVacia = !m.justificacion || String(m.justificacion).trim().length < 10;
  const señales = [];

  // Cancha se cuenta sobre el texto SIN negaciones ("sin aro" no cuenta como aro).
  const textoCancha = quitarNegaciones(texto);
  const hitsCanchaFuerte = contarSeñales(textoCancha, CANCHA_FUERTE);
  const hitsCanchaDebil = contarSeñales(textoCancha, CANCHA_DEBIL);
  const hitsCasa = contarSeñales(texto, CASA);

  // 1. Basura: generada por IA, sin justificación auditable, dice ser contenido
  //    (youtube/articulo) pero describe un ejercicio físico de cancha/gym.
  const esBasura = m.is_ai_generated === true && justificacionVacia &&
    PILARES_CONTENIDO.has(pilar) && hitsCanchaFuerte.length > 0;
  if (esBasura) {
    señales.push(`basura: is_ai_generated + justificación vacía + pilar='${pilar}' pero describe cancha (${hitsCanchaFuerte.join(', ')})`);
  }

  // 2. Ejercicio de cancha "no-misión": tiene señal fuerte de material/coach/formato.
  const esCanchaNoMision = hitsCanchaFuerte.length > 0;
  if (hitsCanchaFuerte.length) señales.push(`cancha (fuerte): ${hitsCanchaFuerte.join(', ')}`);
  if (hitsCanchaDebil.length) señales.push(`cancha (débil): ${hitsCanchaDebil.join(', ')}`);
  if (hitsCasa.length) señales.push(`casa: ${hitsCasa.join(', ')}`);

  // 3. Puntaje: keywords + sesgo del sub-pilar + señales de contenido/estudio.
  const sesgo = SUBPILAR_SESGO[pilar] || null;
  let puntajeCancha = hitsCanchaFuerte.length * 3 + hitsCanchaDebil.length * 1.5;
  let puntajeCasa = hitsCasa.length * 2;
  if (sesgo === 'cancha') { puntajeCancha += 1.5; señales.push(`sub-pilar natural cancha: ${pilar}`); }
  if (sesgo === 'casa') { puntajeCasa += 1.5; señales.push(`sub-pilar natural casa: ${pilar}`); }
  if (PILARES_CONTENIDO.has(pilar)) { puntajeCasa += 3; señales.push(`pilar de contenido → casa`); }
  if (quizNoVacio) { puntajeCasa += 1; señales.push('tiene quiz (estudio) → casa'); }

  // 4. Decisión. La basura y el ejercicio de cancha inequívoco van a 'cancha'
  //    (el ejercicio de cancha se desactiva; la basura se borra tras verificación).
  let contextoSugerido;
  if (esBasura || esCanchaNoMision) {
    contextoSugerido = 'cancha';
  } else if (puntajeCasa > puntajeCancha + 1) {
    contextoSugerido = 'casa';
  } else if (puntajeCancha > puntajeCasa + 1) {
    contextoSugerido = 'cancha';
  } else {
    contextoSugerido = 'ambos';
  }

  // Confianza: separación relativa entre puntajes (0..1). La basura es máxima confianza.
  const total = puntajeCasa + puntajeCancha;
  const confianza = esBasura ? 1
    : total === 0 ? 0.2
    : Math.min(1, Math.round((Math.abs(puntajeCasa - puntajeCancha) / total) * 100) / 100);

  return { contextoSugerido, esBasura, esCanchaNoMision, señales, confianza };
}

// Exportadas para tests y para un futuro clasificador de pruebas.
export const _señales = { CANCHA_FUERTE, CANCHA_DEBIL, CASA, SUBPILAR_SESGO };
