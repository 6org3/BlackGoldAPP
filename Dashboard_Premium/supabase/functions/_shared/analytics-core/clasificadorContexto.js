// AUTO-GENERADO desde packages/analytics-core — NO EDITAR. Regenerar con: npm run functions:sync
// packages/analytics-core/clasificadorContexto.js
// Clasificador de CONTEXTO de una misión: ¿es trabajo de CASA (fuera de cancha/gym:
// hábitos, flexibilidad, recuperación, ver videos, leer, trabajo autónomo) o un
// EJERCICIO DE CANCHA/GYM (requiere aro, material del club, formato grupal) que no
// encaja con el concepto de misión del club?
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

// MATERIAL del club / formato / instrumentación: SOLO esto marca `esCanchaNoMision`
// (no puede hacerse en casa sin el club). El matching es por límite de palabra, así
// que 'aro'/'cono' NO matchean dentro de "claro"/"reconocer".
const CANCHA_MATERIAL = [
  'aro', 'canasta', 'tablero', 'barra', 'mancuerna', 'pesa', 'disco', 'rack',
  '1rm', 'cajon', 'drop jump', 'cono', 'escalera', 'lane agility', 't-test', 'ttest',
  'navette', 'course navette', 'yo-yo', 'yoyo', 'bateria', 'baremo', 'cronometr',
  'media cancha', 'cancha completa', 'gimnasio',
];

// COACH / supervisión: suma a cancha pero NO basta por sí sola para desactivar
// (una misión de casa puede pedir que el coach valide un video después).
const CANCHA_COACH = ['coach revisa', 'coach valida', 'coach mide', 'el entrenador', 'supervis'];

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
// "sin material"… Se eliminan del texto ANTES de contar señales de cancha. En la
// lista CASA ya figuran "sin material/equipamiento/canasta/aro", así que cuentan casa.
const NEGACIONES = [
  'sin aro', 'sin canasta', 'sin tablero', 'sin barra', 'sin pesas', 'sin pesa',
  'sin mancuerna', 'sin material', 'sin equipamiento', 'sin balon', 'sin gimnasio', 'sin gym',
];

const normalizar = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Matching por límite de palabra (\b) para no capturar keywords cortas dentro de
// otras palabras ('aro' en "claro", 'cono' en "reconocer"). Los stems ('pliometr',
// 'supervis', 'respira'…) matchean el prefijo y su continuación (sin \b final).
const escaparRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compilar = (lista) => lista.map((kw) => ({ kw, re: new RegExp('\\b' + escaparRe(kw)) }));

const MATERIAL_RE = compilar(CANCHA_MATERIAL);
const COACH_RE = compilar(CANCHA_COACH);
const DEBIL_RE = compilar(CANCHA_DEBIL);
const CASA_RE = compilar(CASA);

const quitarNegaciones = (texto) => {
  let t = texto;
  for (const neg of NEGACIONES) t = t.split(neg).join(' ');
  return t;
};

const contarSeñales = (texto, listaRe) =>
  listaRe.filter(({ re }) => re.test(texto)).map(({ kw }) => kw);

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
  const hitsMaterial = contarSeñales(textoCancha, MATERIAL_RE);
  const hitsCoach = contarSeñales(textoCancha, COACH_RE);
  const hitsDebil = contarSeñales(textoCancha, DEBIL_RE);
  const hitsCasa = contarSeñales(texto, CASA_RE);

  // 1. Basura: generada por IA, sin justificación auditable, dice ser contenido
  //    (youtube/articulo) pero describe un ejercicio físico con material de gym.
  const esBasura = m.is_ai_generated === true && justificacionVacia &&
    PILARES_CONTENIDO.has(pilar) && hitsMaterial.length > 0;
  if (esBasura) {
    señales.push(`basura: is_ai_generated + justificación vacía + pilar='${pilar}' pero describe cancha (${hitsMaterial.join(', ')})`);
  }

  // 2. Ejercicio de cancha "no-misión": SOLO si hay material del club (no basta "coach").
  const esCanchaNoMision = hitsMaterial.length > 0;
  if (hitsMaterial.length) señales.push(`material de cancha: ${hitsMaterial.join(', ')}`);
  if (hitsCoach.length) señales.push(`coach/supervisión: ${hitsCoach.join(', ')}`);
  if (hitsDebil.length) señales.push(`cancha (débil): ${hitsDebil.join(', ')}`);
  if (hitsCasa.length) señales.push(`casa: ${hitsCasa.join(', ')}`);

  // 3. Puntaje: material + coach + débil + sesgo del sub-pilar + contenido/estudio.
  const sesgo = SUBPILAR_SESGO[pilar] || null;
  let puntajeCancha = hitsMaterial.length * 3 + hitsCoach.length * 2 + hitsDebil.length * 1.5;
  let puntajeCasa = hitsCasa.length * 2;
  if (sesgo === 'cancha') { puntajeCancha += 1.5; señales.push(`sub-pilar natural cancha: ${pilar}`); }
  if (sesgo === 'casa') { puntajeCasa += 1.5; señales.push(`sub-pilar natural casa: ${pilar}`); }
  if (PILARES_CONTENIDO.has(pilar)) { puntajeCasa += 3; señales.push(`pilar de contenido → casa`); }
  if (quizNoVacio) { puntajeCasa += 1; señales.push('tiene quiz (estudio) → casa'); }

  // 4. Decisión. La basura y el ejercicio con material inequívoco van a 'cancha'.
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
export const _señales = { CANCHA_MATERIAL, CANCHA_COACH, CANCHA_DEBIL, CASA, SUBPILAR_SESGO };
