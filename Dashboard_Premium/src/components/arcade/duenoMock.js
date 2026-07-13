/* ============================================================
   Datos de ejemplo del panel DUEÑO Arcade (fase 3-4 del handoff).

   Objeto `data` COMPLETO para el modo demo (sin login), con la MISMA forma
   que produce duenoData.fetchDuenoPanel — así los selectores no ramifican
   demo vs real. En modo real, duenoData OVERLAYea los números que sí existen
   en Supabase (KPIs, finanzas por mes, asistencia media/categoría) sobre estas
   constantes; lo demás (heatmap de ocupación, ranking de coaches, retención,
   filas de acción) queda mock con `// TODO` hasta las migraciones SQL.
   ============================================================ */
import { C } from './arcadeTokens';

export const DUENO_MOCK = {
  demo: true,

  // D1 · Resumen
  kpis: [
    { label: 'RECAUDADO · JUL', val: '$2,940', color: C.gold, sub: '86% de la meta', border: 'rgba(255,215,0,.25)' },
    { label: 'ASISTENCIA MEDIA', val: '87%', color: C.ok, sub: '+2 pts vs junio', border: 'rgba(52,211,153,.25)' },
    { label: 'ATLETAS ACTIVOS', val: '47', color: C.info, sub: '+2 este mes', border: 'rgba(96,165,250,.25)' },
    { label: 'EN RIESGO', val: '4', color: C.warn, sub: '3 de baja · 1 pago', border: 'rgba(251,146,60,.3)' },
  ],
  alertas: [
    { icon: '💳', text: '3 pagos vencidos · $140 en mora', cta: 'FINANZAS ►', color: C.danger, border: 'rgba(239,68,68,.3)', goTab: 'finanzas' },
    { icon: '📉', text: '3 atletas en riesgo de baja', cta: 'RETENCIÓN ►', color: C.warn, border: 'rgba(251,146,60,.3)', goTab: 'retencion' },
    { icon: '🧾', text: '1 pago por verificar · Mateo C.', cta: 'VERIFICAR ►', color: C.gold, border: 'rgba(255,215,0,.3)', goTab: 'finanzas' },
  ],
  hoy: [
    { time: '16:00', title: 'Sub-16 · Físico', sub: 'Prof. Andrade · Cancha Central', chip: 'EN CURSO', chipColor: C.ok, live: true },
    { time: '18:00', title: 'Sub-14 · Técnico', sub: 'Coach Rivas · Cancha Central', chip: 'PROGRAMADA', chipColor: C.text3, live: false },
    { time: '19:30', title: 'Evaluación · CMJ + Sprint', sub: 'Coach Peña · 12 atletas', chip: 'PROGRAMADA', chipColor: C.text3, live: false },
  ],

  // D2 · Finanzas (por mes)
  finanzas: {
    may: { recaudado: 3010, meta: 3390, cobrar: 380, men: 2590, ses: 420, vencCount: 2, vencMonto: 70, becados: 2 },
    jun: { recaudado: 2875, meta: 3420, cobrar: 545, men: 2455, ses: 420, vencCount: 4, vencMonto: 175, becados: 2 },
    jul: { recaudado: 2940, meta: 3420, cobrar: 480, men: 2520, ses: 420, vencCount: 3, vencMonto: 140, becados: 2 },
  },
  verificar: [
    { id: 'mateo', initial: 'M', hue: 'gold', name: 'Mateo Chávez', sub: 'Mensualidad julio · transferencia', monto: '$35' },
  ],
  vencidos: [
    { id: 'thiago', initial: 'T', hue: 'red', name: 'Thiago Vera', sub: 'Sub-16 · 8 días de mora', monto: '$35' },
    { id: 'diego', initial: 'D', hue: 'orange', name: 'Diego Paredes', sub: 'Sub-16 · 12 días de mora', monto: '$35' },
    { id: 'nayeli', initial: 'N', hue: 'red', name: 'Nayeli Ríos', sub: 'Sub-14 · 2 meses', monto: '$70' },
  ],

  // D3 · Asistencia & Ocupación
  asistencia: {
    todas: { pct: 87, trend: '+2 VS JUN', sub: 'Promedio de 47 atletas en 32 sesiones.' },
    s14: { pct: 84, trend: '+1 VS JUN', sub: '18 atletas · mejor franja: sábado.' },
    s16: { pct: 91, trend: '+3 VS JUN', sub: '21 atletas · la más constante del club.' },
    s18: { pct: 79, trend: '-2 VS JUN', sub: '8 atletas · refuerza los jueves.' },
  },
  catRows: [
    { k: 's14', label: 'SUB-14', sub: '18 atletas', pct: 84, color: C.cyan },
    { k: 's16', label: 'SUB-16', sub: '21 atletas', pct: 91, color: C.gold },
    { k: 's18', label: 'SUB-18', sub: '8 atletas', pct: 79, color: C.ok },
  ],
  heat: {
    days: ['L', 'M', 'X', 'J', 'V', 'S'],
    franjas: ['16:00', '17:00', '18:00', '19:30'],
    // 4 franjas × 6 días; null = franja libre.
    HD: [
      [{ p: 78, g: 'Sub-14 · Técnico' }, null, { p: 84, g: 'Sub-14 · Técnico' }, null, { p: 72, g: 'Sub-14 · Físico' }, { p: 95, g: 'Academia libre' }],
      [{ p: 85, g: '1v1 · reservas' }, { p: 62, g: '1v1 · reservas' }, null, { p: 70, g: '1v1 · reservas' }, null, { p: 88, g: 'Sub-16 · Tiro' }],
      [{ p: 92, g: 'Sub-16 · Físico' }, { p: 88, g: 'Sub-16 · Técnico' }, { p: 90, g: 'Sub-16 · Físico' }, { p: 86, g: 'Sub-16 · Táctico' }, { p: 81, g: 'Sub-16 · Scrimmage' }, null],
      [{ p: 64, g: 'Sub-18 · Físico' }, { p: 70, g: 'Sub-18 · Técnico' }, { p: 75, g: 'Evaluación CMJ' }, { p: 58, g: 'Sub-18 · Táctico' }, { p: 66, g: 'Sub-18 · Scrimmage' }, null],
    ],
  },

  // D4 · Equipo (coaches)
  coaches: [
    { id: 'andrade', initial: 'A', hue: 'gold', name: 'Prof. Andrade', cats: 'Sub-16 · Sub-14', asist: 91, ses: 26, xp: 1240 },
    { id: 'rivas', initial: 'R', hue: 'blue', name: 'Coach Rivas', cats: 'Sub-14', asist: 84, ses: 19, xp: 860 },
    { id: 'pena', initial: 'P', hue: 'green', name: 'Coach Peña', cats: 'Sub-18 · 1v1', asist: 79, ses: 15, xp: 610 },
  ],

  // D5 · Retención
  retencion: {
    retPct: 92,
    activosLine: '44 de 48 atletas siguen activos.',
    netoLine: '+10 NETO EN 2026',
    ab: [
      { m: 'MAR', a: 4, b: 1 },
      { m: 'ABR', a: 2, b: 2 },
      { m: 'MAY', a: 5, b: 1 },
      { m: 'JUN', a: 3, b: 3 },
      { m: 'JUL', a: 2, b: 1 },
    ],
    riesgo: [
      { id: 'nayeli', initial: 'N', hue: 'red', name: 'Nayeli Ríos', motivo: '3 faltas seguidas · fatiga silenciosa', mc: C.danger },
      { id: 'thiago', initial: 'T', hue: 'red', name: 'Thiago Vera', motivo: 'Pago vencido + sobreentrenamiento', mc: C.danger },
      { id: 'oscar', initial: 'O', hue: 'orange', name: 'Óscar Ramos', motivo: 'Asistencia 61% el último mes', mc: C.warn },
    ],
  },
};
