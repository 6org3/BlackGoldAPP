/* ============================================================
   Datos de ejemplo del flujo Modo Cancha (fase 3-4 del handoff).

   ▲ FASE 5 (Supabase): reemplazar estos mocks por queries reales:
     - ROSTER        → atletasService.fetchTodosLosAtletas(user) + atleta_grupo
     - SEED_SESSIONS → sesionesService.fetchSesionesEnCurso(coachId)
                        (derivar `elapsed` de now() - started_at, con realtime)
     - guardado      → asistenciaService.upsertAsistencia,
                        evaluacionesService.guardarEvaluacionesLote,
                        xpService.otorgarXP
   La forma de los datos aquí ya calza con esas firmas para minimizar el
   recableado. Mantener los mismos campos (id, name, pos, pwr, hue, alert).
   ============================================================ */

/** Roster de ejemplo — Sub-16 (brief §13). `hue` = color por estado/perfil. */
export const ROSTER = [
  { id: 'dylan', name: 'Dylan Suárez', pos: 'Alero', pwr: 81, hue: 'green' },
  { id: 'mateo', name: 'Mateo Chávez', pos: 'Base', pwr: 64, hue: 'gold', alert: '💧 Hidratación' },
  { id: 'thiago', name: 'Thiago Vera', pos: 'Pívot', pwr: 48, hue: 'red', alert: '▲▲ Sobreent.' },
  { id: 'bruno', name: 'Bruno Ferreira', pos: 'Escolta', pwr: 58, hue: 'blue' },
  { id: 'kevin', name: 'Kevin Ortiz', pos: 'Base', pwr: 55, hue: 'blue' },
  { id: 'ivan', name: 'Iván Molina', pos: 'Ala-Pívot', pwr: 61, hue: 'green' },
  { id: 'samuel', name: 'Samuel Reyes', pos: 'Alero', pwr: 53, hue: 'blue' },
  { id: 'diego', name: 'Diego Paredes', pos: 'Escolta', pwr: 49, hue: 'orange' },
  { id: 'oscar', name: 'Óscar Ramos', pos: 'Pívot', pwr: 57, hue: 'blue' },
  { id: 'lucas', name: 'Lucas Ibáñez', pos: 'Base', pwr: 62, hue: 'green' },
];

/** 4 ejes de la evaluación subjetiva; cada uno desbloquea una insignia a 5★. */
export const AXES = [
  { key: 'fisico', label: 'Esfuerzo Físico', hint: 'INTENSIDAD Y ENTREGA', badge: 'motor' },
  { key: 'actitud', label: 'Actitud', hint: 'ENERGÍA Y DISCIPLINA', badge: 'mamba' },
  { key: 'foco', label: 'Foco / Atención', hint: 'CONCENTRACIÓN', badge: 'sangre' },
  { key: 'equipo', label: 'Trabajo en Equipo', hint: 'COMUNICACIÓN Y APOYO', badge: 'lider' },
];

/** Insignias automáticas (icono + nombre en dos renglones). */
export const BADGE_DEFS = [
  { key: 'motor', icon: '🔋', name: 'MOTOR\nINAGOTABLE' },
  { key: 'mamba', icon: '🐍', name: 'MAMBA\nMENTALITY' },
  { key: 'lider', icon: '👑', name: 'LÍDER' },
  { key: 'sangre', icon: '🧊', name: 'SANGRE\nFRÍA' },
];

/** Niveles del bloque grupal (paso 1). */
export const LEVELS = [
  { tier: 'I', name: 'Micro', desc: 'Base formativa · fundamentos', count: 6, hue: 'cyan' },
  { tier: 'II', name: 'Desarrollo', desc: 'Competitivo · carga media', count: 10, hue: 'gold' },
  { tier: 'III', name: 'Elite', desc: 'Alto rendimiento', count: 5, hue: 'green' },
];

/** Sesiones activas seed (demo de múltiples sesiones simultáneas). */
export const SEED_SESSIONS = [
  { id: 's14', label: 'Sub-14 · Técnico', block: 'Manejo de balón N2', start: '15:30', elapsed: 2730, present: 9, hue: 'blue', evaluable: false },
  { id: 'p1', label: '1v1 · Dylan Suárez', block: 'Tiro exterior', start: '16:10', elapsed: 305, present: 1, hue: 'green', evaluable: false },
];

export const XP_POR_DESTACADO = 50;
