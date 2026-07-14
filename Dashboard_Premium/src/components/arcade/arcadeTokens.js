/* ============================================================
   ARCADE HUD — tokens del lenguaje visual de Modo Cancha / Vista Padre.

   Espejo JS de los valores del HUD (colores, gradientes, clip-paths,
   hues, helpers), consumido por las primitivas y pantallas `arcade/*`
   vía estilos inline — el mismo patrón que src/lib/designTokens.js usa
   para Recharts/Framer. Aquí viven los hex/rgba: los componentes de
   pantalla NO escriben color arbitrario, componen con primitivas y con
   estas constantes.

   Fuente de verdad visual: design_handoff_modo_cancha (Screen.dc.html
   + README). Al tocar un valor, contrástalo contra ese prototipo.
   ============================================================ */

/* ---- Paleta ---- */
export const C = {
  // Fondos
  bgApp: '#050506',
  bgPhone: '#050507',
  card: 'rgba(13,13,16,.92)',
  cardAlt1: '#0D0D0F',
  cardAlt2: '#13131A',

  // Oro
  gold: '#FFD700',
  goldDeep: '#D4AF37',
  goldLight: '#FFEB66',

  // Texto
  text: '#EDEDED',
  text2: '#9CA3AF',
  text3: '#828997', // muted ACCESIBLE: AA 4.5:1 (4.67:1) en toda superficie del HUD; espejo de --color-fg-muted (design_system_arcade.md §2.7)
  text4: '#4B5563',
  ink: '#0A0A0C', // texto sobre superficies doradas
  inkGreen: '#04110B', // texto sobre verde sólido

  // Semánticos (base + soft)
  ok: '#34D399',
  okDeep: '#10B981',
  warn: '#FB923C',
  warnDeep: '#F59E0B',
  danger: '#F87171',
  dangerDeep: '#EF4444',
  info: '#60A5FA',
  infoDeep: '#3B82F6',
  ai: '#C084FC',
  aiDeep: '#A855F7',
  cyan: '#22D3EE',
  whatsapp: '#25D366',
};

/* ---- Bordes de uso frecuente ---- */
export const BORDER = {
  neutral: 'rgba(255,255,255,.08)',
  neutralSoft: 'rgba(255,255,255,.1)',
  neutralFaint: 'rgba(255,255,255,.05)',
  neutral06: 'rgba(255,255,255,.06)',
  gold: 'rgba(255,215,0,.14)',
  gold16: 'rgba(255,215,0,.16)',
  goldMid: 'rgba(255,215,0,.22)',
  goldStrong: 'rgba(255,215,0,.4)',
  ok: 'rgba(16,185,129,.4)',
  okSoft: 'rgba(52,211,153,.4)',
  okStrong: 'rgba(52,211,153,.45)',
  danger: 'rgba(239,68,68,.3)',
  info: 'rgba(96,165,250,.35)',
  ai: 'rgba(168,85,247,.3)',
  warn: 'rgba(251,146,60,.35)',
};

/* ---- Gradientes ---- */
export const GRAD = {
  goldCTA: 'linear-gradient(135deg,#FFEB66,#FFD700 45%,#D4AF37)',
  goldCTA150: 'linear-gradient(150deg,#FFEB66,#FFD700 45%,#D4AF37)', // botón hex central de la nav
  greenCTA: 'linear-gradient(135deg,#34D399,#10B981)',
  goldText: 'linear-gradient(135deg,#FFEB66,#D4AF37)',
  goldHex: 'linear-gradient(150deg,#FFEB66,#D4AF37)',
  heroGoldTile: 'linear-gradient(150deg, rgba(255,215,0,.12), rgba(13,13,16,.95))', // tile "GRUPAL NIVELES"
  infoAvatar: 'linear-gradient(150deg,#60A5FA,#3B82F6)',
  heroGold: 'linear-gradient(150deg, rgba(255,215,0,.16), rgba(212,175,55,.05) 45%, rgba(13,13,16,.95))',
  heroGoldSoft: 'linear-gradient(150deg, rgba(255,215,0,.14), rgba(13,13,16,.96) 60%)',
  activeGreen: 'linear-gradient(150deg, rgba(16,185,129,.16), rgba(13,13,16,.95))',
  activeGreenSoft: 'linear-gradient(150deg, rgba(16,185,129,.1), rgba(13,13,16,.95))',
  heroInfo: 'linear-gradient(150deg, rgba(96,165,250,.16), rgba(13,13,16,.96) 60%)',
};

/* ---- Formas firma (clip-path) ----
   cut(n): esquina cortada (top-right + bottom-left). n = 8/10/12/14.
   HEX:    hexágono de avatares/badges/botón central de nav.
   CELL:   mini-corte 3px de las celdas de XP. */
export const cut = (n = 10) =>
  `polygon(0 0, calc(100% - ${n}px) 0, 100% ${n}px, 100% 100%, ${n}px 100%, 0 calc(100% - ${n}px))`;
export const HEX = 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)';
export const CELL = cut(3);

/* ---- Glow / sombras ---- */
export const GLOW = {
  hexGold: 'drop-shadow(0 0 12px rgba(255,215,0,.4))',
  hexGoldStrong: '0 0 20px rgba(255,215,0,.55)',
  timer: '0 0 22px rgba(16,185,129,.5)',
  star: '0 0 8px rgba(255,215,0,.5)',
  trophy: '0 0 34px rgba(255,215,0,.5)',
  phone: '0 34px 70px -22px rgba(0,0,0,.9), 0 0 40px -18px rgba(255,215,0,.35)',
  minBar: '0 -8px 26px rgba(0,0,0,.6)',
};

/* ---- Fondo con retícula dorada del lienzo (app móvil-primero) ---- */
export const gridBackground = {
  backgroundColor: C.bgPhone,
  backgroundImage:
    'linear-gradient(rgba(255,215,0,.028) 1px, transparent 1px),' +
    'linear-gradient(90deg, rgba(255,215,0,.028) 1px, transparent 1px),' +
    'radial-gradient(900px 480px at 50% -8%, rgba(255,215,0,.07), transparent 60%)',
  backgroundSize: '36px 36px, 36px 36px, 100% 100%',
};

/* ---- Hue del atleta (color por estado/perfil) ---- */
const HUE_FG = { green: C.ok, gold: C.gold, red: C.danger, blue: C.info, orange: C.warn };
const HUE_BG = {
  green: 'rgba(52,211,153,.2)',
  gold: 'rgba(255,215,0,.2)',
  red: 'rgba(239,68,68,.2)',
  blue: 'rgba(96,165,250,.2)',
  orange: 'rgba(249,115,22,.2)',
};
export const hueFg = (hue) => HUE_FG[hue] || C.text2;
export const hueBg = (hue) => HUE_BG[hue] || 'rgba(255,255,255,.1)';

/* ---- Helpers ---- */
/** Segundos → "MM:SS" (cronómetros de sesión). */
export const fmtClock = (sec = 0) => {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Fuente pixel (Silkscreen) — vía token CSS para respetar el fallback. */
export const PIXEL = "var(--font-pixel, 'Silkscreen', monospace)";

/* ---- Densidad / desktop (Ola 0 · design_system_arcade.md §6) ----
   El HUD nació móvil-first a 480px; para tablas/formularios/paneles de ancho
   completo se conservan los átomos (retícula, cortes, hexágonos, oro, pixel
   para labels/números) y solo cambian densidad y piso de cuerpo. Estos son
   los valores normativos del §6.1/§6.5. */
export const GRID_STEP_DESKTOP = 44; // retícula 40–48px a ancho completo (no 36)
export const ROW_H = 44; // fila/control táctil — móvil y por defecto (atleta/padre)
export const ROW_H_DENSE = 36; // fila/control denso — coach/owner/staff en desktop
export const BODY_MIN = 9; // piso de cuerpo fuera del marco 480px (px)

/** Retícula dorada a ancho completo (paneles/tablas desktop): paso 44px y halo
 *  superior más ancho que el marco de teléfono; mismos alfas tenues que
 *  `gridBackground`. Es el "campo de juego" de las superficies data-densas. */
export const gridBackgroundDesktop = {
  backgroundColor: C.bgApp,
  backgroundImage:
    'linear-gradient(rgba(255,215,0,.024) 1px, transparent 1px),' +
    'linear-gradient(90deg, rgba(255,215,0,.024) 1px, transparent 1px),' +
    'radial-gradient(1200px 520px at 50% -10%, rgba(255,215,0,.06), transparent 60%)',
  backgroundSize: `${GRID_STEP_DESKTOP}px ${GRID_STEP_DESKTOP}px, ${GRID_STEP_DESKTOP}px ${GRID_STEP_DESKTOP}px, 100% 100%`,
};
