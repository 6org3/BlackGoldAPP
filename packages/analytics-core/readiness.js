// packages/analytics-core/readiness.js
// Motor de recuperación / readiness (check-in diario del atleta).
//
// Fuente de datos: tabla `atleta_readiness` (una fila por atleta y día):
//   - sueno_calidad  : 1-10 (más es mejor)
//   - fatiga_fisica  : 1-10 (más es mejor → 10 = "al 100%", 1 = "agotado")
//   - color_orina    : 1-8  (menos es mejor, escala de Armstrong de hidratación)
//
// REGLAS DEL PAQUETE: ES modules planos, sin dependencias npm, sin APIs de Node.
// Funciones PURAS y deterministas — mismo input, mismo output, sin acceso a BD.
// Compartido por la web (Vite), blackgold-mcp (Node) y la Edge Function (Deno).
//
// SEMÁNTICA — la recuperación es una señal de DISPONIBILIDAD / RIESGO, no una nota de
// rendimiento. Su score NO debe entrar al overall ni al radar (ver
// recomendaciones.js: 'recuperacion' está excluido de RADAR_AXES a propósito). Sirve
// para recomendar hábitos/recuperación y para modular la carga, no para "subir de nivel".
//
// Estos umbrales/pesos son PROVISIONALES: los de hidratación replican los que ya usaba
// Dashboard_Premium/src/lib/didacticEngine.js (color_orina>=5 = crítico); los de sueño y
// fatiga son un punto de partida a validar con el cuerpo técnico del club.

// Pesos del score compuesto de readiness (suman 1). Sueño y fatiga pesan más que la
// hidratación puntual del día.
export const READINESS_PESOS = { sueno: 0.4, fatiga: 0.4, hidratacion: 0.2 };

// Umbrales de alerta por defecto (configurables por parámetro).
export const READINESS_UMBRALES = {
  color_orina_critico: 5, // >= => deshidratación severa (didacticEngine)
  color_orina_alerta: 4,  // >= => hidratación a vigilar
  sueno_bajo: 3,          // <= => sueño deficiente
  fatiga_alta: 3,         // <= => muy fatigado
};

// 1-10, más es mejor → 0-100 (1→0, 10→100). null si la métrica está ausente
// (null/undefined/''; ojo: Number(null) es 0, no NaN — hay que descartarlo antes).
function norm10(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, ((n - 1) / 9) * 100));
}

// Color de orina 1-8, menos es mejor → 0-100 (1→100, 8→0). null si está ausente.
function normOrina(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, ((8 - n) / 7) * 100));
}

/**
 * Score compuesto de readiness 0-100 a partir de una fila de `atleta_readiness`.
 * Solo pondera las métricas presentes (renormaliza los pesos): una fila con solo
 * sueño devuelve el score del sueño, no un 40% del máximo.
 *
 * @param {Object|null} row - Fila de atleta_readiness ({sueno_calidad, fatiga_fisica, color_orina}).
 * @returns {number|null} 0-100 (más = mejor recuperado), o null si no hay ninguna métrica.
 */
export function calcularReadinessScore(row) {
  if (!row) return null;
  const partes = [
    [norm10(row.sueno_calidad), READINESS_PESOS.sueno],
    [norm10(row.fatiga_fisica), READINESS_PESOS.fatiga],
    [normOrina(row.color_orina), READINESS_PESOS.hidratacion],
  ].filter(([v]) => v != null);

  if (partes.length === 0) return null;
  const pesoTotal = partes.reduce((acc, [, w]) => acc + w, 0);
  const score = partes.reduce((acc, [v, w]) => acc + v * w, 0) / pesoTotal;
  return Math.round(score);
}

/**
 * Alertas de recuperación derivadas de una fila de readiness, ordenadas por severidad
 * (crítica > alta > media). Cada alerta expone `condicion` para poder enlazarla con un
 * `condicion_trigger` de misión (mecanismo de didacticEngine) sin acoplar este módulo a
 * la capa de misiones.
 *
 * @param {Object|null} row - Fila de atleta_readiness.
 * @param {Object} [umbrales=READINESS_UMBRALES] - Overrides parciales de umbrales.
 * @returns {Array<{condicion:string, metrica:string, valor:number, severidad:'critica'|'alta'|'media', mensaje:string}>}
 */
export function detectarAlertasRecuperacion(row, umbrales = READINESS_UMBRALES) {
  if (!row) return [];
  const u = { ...READINESS_UMBRALES, ...(umbrales || {}) };
  const alertas = [];

  const orina = Number(row.color_orina);
  const sueno = Number(row.sueno_calidad);
  const fatiga = Number(row.fatiga_fisica);

  if (Number.isFinite(orina) && orina >= u.color_orina_critico) {
    alertas.push({
      condicion: 'deshidratado_extremo', metrica: 'hidratacion', valor: orina, severidad: 'critica',
      mensaje: `Deshidratación severa (nivel ${orina} en escala de Armstrong). Reponer líquidos y electrolitos antes de entrenar.`,
    });
  } else if (Number.isFinite(orina) && orina >= u.color_orina_alerta) {
    alertas.push({
      condicion: 'hidratacion_baja', metrica: 'hidratacion', valor: orina, severidad: 'media',
      mensaje: `Hidratación a vigilar (nivel ${orina}). Aumentar la ingesta de agua durante el día.`,
    });
  }

  if (Number.isFinite(sueno) && sueno <= u.sueno_bajo) {
    alertas.push({
      condicion: 'sueno_deficiente', metrica: 'sueno', valor: sueno, severidad: 'alta',
      mensaje: `Sueño deficiente (${sueno}/10). Priorizar higiene de sueño y reducir la carga neuromuscular alta de hoy.`,
    });
  }

  if (Number.isFinite(fatiga) && fatiga <= u.fatiga_alta) {
    alertas.push({
      condicion: 'fatiga_alta', metrica: 'fatiga', valor: fatiga, severidad: 'alta',
      mensaje: `Fatiga elevada (${fatiga}/10). Considerar recuperación activa, movilidad y bajar el volumen.`,
    });
  }

  const ordenSeveridad = { critica: 0, alta: 1, media: 2 };
  alertas.sort((a, b) => ordenSeveridad[a.severidad] - ordenSeveridad[b.severidad]);
  return alertas;
}
