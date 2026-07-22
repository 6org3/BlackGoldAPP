/* ============================================================
   Datos de ejemplo del portal ATLETA Arcade (fase 3-4 del handoff).

   Dos cosas viven aquí:
   1. ATLETA_MOCK — un objeto `data` COMPLETO para el modo demo (preview sin
      login). Tiene la MISMA forma que produce atletaData.fetchAtletaPanel, así
      que los selectores no ramifican demo vs real.
   2. Constantes de contenido que HOY son siempre mock (no hay fuente de datos):
      el mini-quiz educativo, los pasos del detalle, los tips por pilar, las
      insignias y el XP semanal. El modo real reutiliza estas mismas mientras
      no exista el agregado en Supabase (ver `// TODO` en atletaData/selectors).

   Perfil demo (brief §ATLETA): Mateo Chávez · Sub-16 · Desarrollo · PWR 64.
   ============================================================ */

/** Mini-quiz educativo del detalle de misión (3 preguntas, opción única). */
export const MINI_QUIZ = [
  { q: '1 · ¿Dónde fijas la mirada al lanzar?', opts: ['Al aro (parte trasera)', 'Al balón mientras sube', 'A la defensa'], correcta: 0 },
  { q: '2 · ¿Cómo va el codo de tiro?', opts: ['Alineado al aro', 'Abierto hacia afuera', 'Pegado al cuerpo'], correcta: 0 },
  { q: '3 · ¿Cómo haces las 50 repeticiones?', opts: ['50 seguidas sin parar', 'En series de 10 con pausa', 'Las que salgan'], correcta: 1 },
];

/** Pasos numerados del detalle de misión (guía de práctica). */
export const PASOS_DETALLE = [
  'Series de 10 tiros · descansa 60 s entre series.',
  'Misma rutina siempre: bota 2 veces, respira, lanza.',
  'Apunta tus aciertos por serie en la libreta del club.',
];

/** Tip en lenguaje simple por pilar (el valor es real; el texto es copy mock). */
export const PILAR_TIPS = {
  fuerza: 'Dentro de la media de tu categoría. Las misiones de fuerza en casa la suben rápido.',
  explosividad: 'Tu mejor arma 🔥. La pliometría está funcionando — sigue así.',
  resistencia: 'Tu motor para el último cuarto 🔋. Juego continuo y carrera suave lo suben — muévete sin parar.',
  movilidad: 'Bien. Cuida los tobillos con la rutina de movilidad.',
  tiro: 'Tu gran oportunidad. La misión de tiro libre apunta justo aquí.',
  agilidad: 'Buena base para defender el perímetro.',
  tactica: 'Mira los videos de lectura de juego para subirla.',
  resiliencia: 'Constancia sólida. Hidrátate mejor y sube aún más.',
};

/** Insignias del atleta (grid de 4). `key` = nombre canónico guardado en
    observaciones_cancha.insignia (espejo de AXIS_DB); en modo real el conteo `n`
    se sustituye por data.insigniasCounts[key]. */
export const INSIGNIAS_MOCK = [
  { icon: '🔋', key: 'Motor Inagotable', name: 'MOTOR\nINAGOTABLE', n: 2 },
  { icon: '🐍', key: 'Mamba Mentality', name: 'MAMBA\nMENTALITY', n: 1 },
  { icon: '👑', key: 'Líder', name: 'LÍDER', n: 0 },
  { icon: '🧊', key: 'Sangre Fría', name: 'SANGRE\nFRÍA', n: 0 },
];

/** XP de las últimas 6 semanas (columnas apiladas). Mock — TODO: agregado real. */
export const WEEKS_MOCK = [
  { label: 'S1', xp: 80 },
  { label: 'S2', xp: 120 },
  { label: 'S3', xp: 90 },
  { label: 'S4', xp: 150 },
  { label: 'S5', xp: 110 },
  { label: 'S6', xp: 140 },
];

/** Objeto `data` completo para el modo demo (sin login). */
export const ATLETA_MOCK = {
  demo: true,
  profile: {
    nombre: 'Mateo Chávez',
    inicial: 'M',
    categoria: 'SUB-16',
    fechaLine: null, // el selector arma la fecha de hoy
    pwr: 64,
    nivelDesarrollo: 'Desarrollo',
    racha: 4,
    xp: { current: 1340, required: 1500, percentage: 89, filled: 9, faltan: 160, nextLevelName: 'Élite', esMax: false },
  },
  radar: [
    { key: 'fuerza', label: 'FUERZA', value: 55 },
    { key: 'explosividad', label: 'EXPLO', value: 78 },
    { key: 'resistencia', label: 'CARDIO', value: 52 },
    { key: 'movilidad', label: 'MOVIL', value: 60 },
    { key: 'tiro', label: 'TIRO', value: 42 },
    { key: 'agilidad', label: 'AGIL', value: 65 },
    { key: 'tactica', label: 'TACT', value: 58 },
    { key: 'resiliencia', label: 'RESIL', value: 70 },
  ],
  // Mismo shape que fichaFisica() (padreData) sobre la fila de atletas.
  fisico: { peso: 58.4, talla: 168, imc: 20.7, envergadura: 172, brazada: 4 },
  hoyEntrenas: { time: '16:00', titulo: 'Sub-16 · Físico', sub: 'Cancha Central · Prof. Andrade', chip: 'EN 2 H' },
  alertaIA: { tone: 'cyan', text: 'Toma 2L de agua hoy — tu readiness lo pide antes del físico.' },
  misionDestacada: { id: 'm2', titulo: 'Tiro libre · 50 repeticiones', sub: 'Cancha · pilar Tiro · 5 días', xp: 40, prog: 3, tot: 5 },
  misiones: [
    { id: 'm2', progresoId: null, titulo: 'Tiro libre · 50 repeticiones', sub: 'Técnica de muñeca · 5 días', lugar: 'CANCHA', pilar: 'TIRO', xp: 40, estado: 'activa', prog: 3, tot: 5, open: true },
    { id: 'm3', progresoId: null, titulo: 'Hidratación diaria', sub: '2L de agua · marca tu día', lugar: 'TODO LUGAR', pilar: 'RESILIENCIA', xp: 20, estado: 'activa', prog: 4, tot: 7 },
    { id: 'm1', progresoId: null, titulo: 'Pliometría progresiva · N1', sub: '3×6 saltos al cajón', lugar: 'CASA', pilar: 'EXPLOSIVIDAD', xp: 50, estado: 'activa', prog: 10, tot: 10 },
    { id: 'm4', progresoId: null, titulo: 'Video: lectura de pick & roll', sub: 'Mini-quiz de 3 preguntas', lugar: 'CASA', pilar: 'TÁCTICA', xp: 30, estado: 'propuesta', prog: 0, tot: 1 },
    { id: 'm5', progresoId: null, titulo: 'Movilidad de tobillo · N1', sub: 'Aprobada por el coach', lugar: 'CASA', pilar: 'MOVILIDAD', xp: 30, estado: 'completada', prog: 1, tot: 1 },
  ],
  eventos: [
    { id: 'e1', icon: '🏀', iconHue: 'green', titulo: 'Amistoso vs Aurora', sub: 'Sáb 18 jul · 10:00 · Cancha Central', conf: 9, tot: 14 },
    { id: 'e2', icon: '⚡', iconHue: 'gold', titulo: 'Torneo Relámpago', sub: 'Dom 26 jul · 09:00 · Polideportivo Norte', conf: 4, tot: 14 },
  ],
  historial: [
    { res: 'W', resHue: 'green', score: '54–48', titulo: 'vs Cóndores', sub: 'Sáb 5 jul · Mateo: 8 pts · 4 reb' },
    { res: 'L', resHue: 'red', score: '39–51', titulo: 'vs Halcones', sub: 'Dom 22 jun · Mateo: 6 pts · 2 ast' },
  ],
  weeks: WEEKS_MOCK, // paridad de forma con fetchAtletaPanel (XP semanal, v31).
  insigniasCounts: null, // null → el selector usa los conteos `n` de INSIGNIAS_MOCK (demo).
};
