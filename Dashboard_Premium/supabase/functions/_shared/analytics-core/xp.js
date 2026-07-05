// AUTO-GENERADO desde packages/analytics-core — NO EDITAR. Regenerar con: npm run functions:sync
// packages/analytics-core/xp.js
// XP base por tipo de clase/sesión — FUENTE ÚNICA.
//
// Antes esta tabla estaba hardcodeada en DOS lugares que podían divergir:
//   - Dashboard_Premium/src/components/ModoCanchaModal.jsx (handleCerrarClase)
//   - Dashboard_Premium/src/api/sesionesService.js (evaluarSesion)
//
// REGLAS DEL PAQUETE: ES modules planos, sin dependencias, funciones puras.
// (El XP por completar MISIONES es otra escala y vive en calcularXPMision —
// recomendaciones.js; no confundir con este XP base por asistir/dar la clase.)

export const XP_BASE_SESION = {
  privada_1v1: 50,
  grupal_individualizada: 35,
  micro: 20,
  desarrollo: 30,
  elite: 40,
  default: 20, // Micro / desconocido
};

/**
 * XP base de una sesión a partir de su string de tipo o notas. Reconoce las etiquetas
 * que produce el flujo ("Privada 1v1", "Grupal Individualizada", "Grupal (Niveles)"
 * combinado con "Micro"/"Desarrollo"/"Elite"). Default: Micro (20).
 *
 * @param {string} tipo - p.ej. data.tipo de sesiones_control, o activeSession.notas.
 * @returns {number}
 */
export function xpBaseSesion(tipo) {
  const t = String(tipo || '');
  if (t.includes('Privada 1v1')) return XP_BASE_SESION.privada_1v1;
  if (t.includes('Grupal Individualizada')) return XP_BASE_SESION.grupal_individualizada;
  if (t.includes('Grupal')) {
    if (t.includes('Elite')) return XP_BASE_SESION.elite;
    if (t.includes('Desarrollo')) return XP_BASE_SESION.desarrollo;
    return XP_BASE_SESION.micro; // Grupal sin nivel explícito → Micro
  }
  return XP_BASE_SESION.default;
}
