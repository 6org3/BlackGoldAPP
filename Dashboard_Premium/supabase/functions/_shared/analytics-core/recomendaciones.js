// AUTO-GENERADO desde packages/analytics-core — NO EDITAR. Regenerar con: npm run functions:sync
// packages/analytics-core/recomendaciones.js
// Motor de recomendación de misiones — Fase 1 del spec Loop Evaluación → Misión → XP
// (ver docs/spec_loop_misiones_baremo.md §Fase 1).
//
// REGLAS DEL PAQUETE: ES modules planos, sin dependencias npm, sin APIs de Node,
// imports internos con extensión .js explícita — este código corre en la web (Vite),
// en blackgold-mcp (Node) y próximamente en una Edge Function (Deno).
//
// Todas las funciones son PURAS y deterministas: mismo input → mismo output, sin
// acceso a base de datos ni efectos secundarios. La capa de datos (servicios web /
// Edge Function) es quien carga las filas y persiste los resultados.

import { RADAR_AXES } from './radar.js';

// ===================================================================
// CONSTANTES
// ===================================================================

// Tabla estándar de XP por nivel de desarrollo (fuente única para calcularXPMision).
const XP_POR_NIVEL = { Micro: 25, Desarrollo: 50, Elite: 75 };

// XP por defecto cuando no hay ningún dato de nivel disponible.
const XP_FALLBACK = 50;

// Nivel asumido cuando el atleta no tiene nivel definido (ver seleccionarMisiones).
const NIVEL_POR_DEFECTO = 'Desarrollo';

// ===================================================================
// HELPERS INTERNOS
// ===================================================================

/**
 * Timestamp numérico de una evaluación para comparar recencia.
 * created_at ausente o no parseable → -Infinity (siempre pierde ante una fecha válida).
 */
function timestampDe(evaluacion) {
  const t = new Date(evaluacion?.created_at).getTime();
  return Number.isNaN(t) ? -Infinity : t;
}

// ===================================================================
// FUNCIONES EXPORTADAS
// ===================================================================

/**
 * Última evaluación por prueba_tipo.
 *
 * FUENTE ÚNICA de la lógica "quedarse con la última evaluación de cada prueba",
 * hoy duplicada ad-hoc en `recalcularOverall` (Dashboard_Premium/src/api/
 * evaluacionesService.js, que además depende de que la query venga ordenada por
 * created_at DESC) y en la Edge Function `generar-misiones-ia`. Ambas deben migrar
 * a esta función (requisito P1 de la Fase 1 del spec).
 *
 * A diferencia de esas copias, aquí NO se asume ningún orden de entrada: para cada
 * prueba_tipo gana la fila con created_at más reciente. Ante empate exacto de
 * created_at se conserva la primera vista (solo gana una fila estrictamente más nueva).
 *
 * @param {Array|null} evaluaciones - Filas de evaluaciones_pruebas
 *   ({prueba_tipo, sub_pilar, puntuacion_normalizada, tier, created_at, ...}).
 * @returns {Object} { [prueba_tipo]: evaluacion } — {} si la entrada es null/vacía.
 */
export function ultimasPorPrueba(evaluaciones) {
  const ultimas = {};
  if (!evaluaciones || evaluaciones.length === 0) return ultimas;

  evaluaciones.forEach(e => {
    if (!e || !e.prueba_tipo) return; // fila corrupta: se ignora en silencio
    const actual = ultimas[e.prueba_tipo];
    if (!actual || timestampDe(e) > timestampDe(actual)) {
      ultimas[e.prueba_tipo] = e;
    }
  });

  return ultimas;
}

/**
 * Convierte una puntuación 0-100 en su tier.
 *
 * Los bordes son los puntos medios entre los scores canónicos de TIER_CONFIG
 * (poor=15, below_avg=35, average=55, above_avg=75, excellent=95):
 * <25 poor · <45 below_avg · <65 average · <85 above_avg · ≥85 excellent.
 *
 * @param {number} score - Puntuación normalizada 0-100.
 * @returns {'poor'|'below_avg'|'average'|'above_avg'|'excellent'}
 */
export function scoreATier(score) {
  if (score < 25) return 'poor';
  if (score < 45) return 'below_avg';
  if (score < 65) return 'average';
  if (score < 85) return 'above_avg';
  return 'excellent';
}

/**
 * Debilidades medidas del atleta, ordenadas de peor a mejor.
 *
 * Pipeline: ultimasPorPrueba → agregación por sub-pilar → filtro de tiers débiles.
 *
 * - Solo agrega los sub-pilares presentes en RADAR_AXES (8 desde 2026-07-05). Esto excluye de forma
 *   natural 'recuperacion' y 'composicion_corporal', que también existen en la tabla
 *   evaluaciones_pruebas pero no forman parte del radar ni tienen misiones asociadas.
 * - El promedio por sub-pilar replica la agregación de getSubPilarScores (radar.js):
 *   promedio simple de puntuacion_normalizada (|| 0) y Math.round.
 * - Un sub-pilar SIN ninguna evaluación NO es debilidad: no hay medición, no se
 *   inventa un 0 (ese comportamiento es solo del radar, que necesita dibujar el eje).
 * - Determinismo total: orden por score ascendente (peor primero) y, ante empate de
 *   score, desempate por la posición del sub-pilar en RADAR_AXES. La lista `pruebas`
 *   se ordena alfabéticamente para que el output no dependa del orden de entrada.
 *
 * @param {Array|null} evaluaciones - Filas de evaluaciones_pruebas.
 * @param {Object} [opciones]
 * @param {number} [opciones.maxDebilidades=3] - Corte de la lista (D6 del spec).
 * @param {string[]} [opciones.tiersDebiles=['poor','below_avg']] - Tiers considerados débiles.
 * @returns {Array<{ sub_pilar: string, score: number, tier: string, pruebas: string[] }>}
 */
export function detectarDebilidades(
  evaluaciones,
  { maxDebilidades = 3, tiersDebiles = ['poor', 'below_avg'] } = {}
) {
  const ultimas = ultimasPorPrueba(evaluaciones);

  // Agrupar las últimas evaluaciones por sub-pilar.
  const porSubPilar = {};
  Object.values(ultimas).forEach(e => {
    const key = e.sub_pilar;
    if (!porSubPilar[key]) porSubPilar[key] = [];
    porSubPilar[key].push(e);
  });

  const debilidades = [];
  RADAR_AXES.forEach((axis, indice) => {
    const filas = porSubPilar[axis.key];
    if (!filas || filas.length === 0) return; // sin medición → no es debilidad

    // Misma agregación que getSubPilarScores: promedio simple + Math.round.
    const suma = filas.reduce((acc, e) => acc + (e.puntuacion_normalizada || 0), 0);
    const score = Math.round(suma / filas.length);
    const tier = scoreATier(score);

    if (tiersDebiles.includes(tier)) {
      debilidades.push({
        sub_pilar: axis.key,
        score,
        tier,
        pruebas: filas.map(e => e.prueba_tipo).sort(),
        _indiceEje: indice, // solo para el desempate; se elimina antes de devolver
      });
    }
  });

  // Peor primero; ante empate de score, gana el que aparece antes en RADAR_AXES.
  debilidades.sort((a, b) => a.score - b.score || a._indiceEje - b._indiceEje);

  return debilidades
    .slice(0, maxDebilidades)
    .map(({ _indiceEje, ...debilidad }) => debilidad);
}

/**
 * Selección determinista de misiones del catálogo para una lista de debilidades.
 *
 * Reglas, en orden:
 * 1. Candidatas: misiones con activa === true y pilar === debilidad.sub_pilar.
 * 2. Filtro por bucket de edad: categoria_bucket === categoriaBucket, o null (comodín).
 * 3. Filtro por nivel: nivel_objetivo === nivelEfectivo, o null (comodín), donde
 *    nivelEfectivo = nivel || 'Desarrollo' (default documentado: el nivel intermedio
 *    es la apuesta menos arriesgada cuando el atleta aún no tiene nivel asignado).
 * 4. Dedup: se excluye toda mision_id ya asignada al atleta ALGUNA VEZ (incluidas
 *    las rechazadas) — por eso el llamador debe pasar TODAS las asignaciones
 *    históricas, no solo las activas. Esto hace idempotente el botón "Regenerar
 *    misiones" de la Fase 2.
 * 5. Diversidad (D4): por debilidad se intenta 1 misión 'general' (auto-asignada)
 *    + 1 'especifica' (aprueba el coach); si una clase no tiene candidatas, se
 *    completa con la otra hasta porDebilidad.
 * 6. Orden dentro de cada clase: match exacto (bucket Y nivel no-null coincidentes)
 *    > match parcial (uno de los dos) > comodín total; luego created_at ascendente
 *    (las misiones más antiguas del catálogo primero); luego id (orden estable →
 *    determinismo total, independiente del orden de entrada del catálogo).
 *
 * @param {Array} debilidades - Salida de detectarDebilidades.
 * @param {Array} catalogoMisiones - Filas de la tabla misiones
 *   ({id, pilar, nivel_objetivo, categoria_bucket, complejidad, activa, created_at, xp_recompensa, ...}).
 * @param {Array} misionesAsignadasAtleta - [{mision_id}] con TODAS las asignaciones
 *   históricas del atleta (progreso_misiones), incluidas rechazadas.
 * @param {Object} [opciones]
 * @param {number} [opciones.porDebilidad=2] - Misiones a asignar por debilidad (D6).
 * @param {string} [opciones.nivel] - Nivel de desarrollo del atleta (Micro/Desarrollo/Elite).
 * @param {string} [opciones.categoriaBucket] - Bucket de baremo del atleta
 *   (Sub12/Sub15/Sub18/Senior, vía categoriaABucketBaremo).
 * @param {string} [opciones.contexto] - Filtro duro de contexto de ejecución
 *   ('cancha' | 'casa'). Las misiones 'ambos' (y las filas sin la columna, de
 *   selects anteriores a v26) pasan siempre. Omitido → sin filtro (retro-compat).
 * @returns {{ asignaciones: Array<{ mision_id, sub_pilar_objetivo, motivo, complejidad }>,
 *             sinCobertura: Array<{ sub_pilar, nivel, categoriaBucket, contexto }> }}
 */
export function seleccionarMisiones(
  debilidades,
  catalogoMisiones,
  misionesAsignadasAtleta,
  { porDebilidad = 2, nivel, categoriaBucket, contexto } = {}
) {
  const asignaciones = [];
  const sinCobertura = [];
  const nivelEfectivo = nivel || NIVEL_POR_DEFECTO;

  if (!debilidades || debilidades.length === 0) {
    return { asignaciones, sinCobertura };
  }

  const catalogo = catalogoMisiones || [];

  // Set de dedup con el historial completo (incluye rechazadas: si el coach ya
  // rechazó esa misión para este atleta, no tiene sentido volver a proponerla).
  const yaAsignadas = new Set(
    (misionesAsignadasAtleta || []).map(p => p && p.mision_id).filter(Boolean)
  );

  // Especificidad del match: 2 = exacto (bucket y nivel no-null coincidentes),
  // 1 = parcial (uno de los dos), 0 = comodín total. Las candidatas ya pasaron
  // los filtros, así que todo campo no-null coincide por construcción.
  const especificidad = m =>
    (m.categoria_bucket != null ? 1 : 0) + (m.nivel_objetivo != null ? 1 : 0);

  // created_at ausente → al final (Infinity habría invertido el orden: usamos
  // Number.MAX_SAFE_INTEGER para que las misiones sin fecha pierdan siempre).
  const tsCatalogo = m => {
    const t = new Date(m.created_at).getTime();
    return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
  };

  // Orden total y estable: especificidad desc → created_at asc → id asc.
  const compararCandidatas = (a, b) => {
    const porEspecificidad = especificidad(b) - especificidad(a);
    if (porEspecificidad !== 0) return porEspecificidad;
    const porFecha = tsCatalogo(a) - tsCatalogo(b);
    if (porFecha !== 0) return porFecha;
    const idA = String(a.id);
    const idB = String(b.id);
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  };

  debilidades.forEach(debilidad => {
    const candidatas = catalogo
      .filter(m =>
        m &&
        m.activa === true &&
        m.pilar === debilidad.sub_pilar &&
        (m.categoria_bucket == null || m.categoria_bucket === categoriaBucket) &&
        (m.nivel_objetivo == null || m.nivel_objetivo === nivelEfectivo) &&
        (contexto == null || m.contexto == null || m.contexto === 'ambos' || m.contexto === contexto) &&
        !yaAsignadas.has(m.id)
      )
      .sort(compararCandidatas);

    // Clasificación por complejidad. Todo lo que no sea 'general' se trata como
    // 'especifica' (es el DEFAULT de la columna en BD y el camino conservador:
    // ante la duda, la misión pasa por aprobación del coach — D4).
    const generales = candidatas.filter(m => m.complejidad === 'general');
    const especificas = candidatas.filter(m => m.complejidad !== 'general');

    // Diversidad: 1 general + 1 específica; luego completar hasta porDebilidad
    // con las candidatas restantes en su orden global.
    const elegidas = [];
    if (generales.length > 0) elegidas.push(generales[0]);
    if (especificas.length > 0 && elegidas.length < porDebilidad) {
      elegidas.push(especificas[0]);
    }
    if (elegidas.length < porDebilidad) {
      candidatas.forEach(m => {
        if (elegidas.length < porDebilidad && !elegidas.includes(m)) {
          elegidas.push(m);
        }
      });
    }

    if (elegidas.length === 0) {
      // Debilidad sin cobertura de catálogo: el orquestador (Fase 2) generará
      // una misión nueva vía IA para esta celda (sub_pilar × nivel × bucket).
      // `contexto` solo se incluye cuando el filtro está activo: con la opción
      // omitida la forma del objeto es EXACTAMENTE la anterior a v26 (retro-compat).
      sinCobertura.push({
        sub_pilar: debilidad.sub_pilar,
        nivel: nivelEfectivo,
        categoriaBucket: categoriaBucket != null ? categoriaBucket : null,
        ...(contexto != null ? { contexto } : {}),
      });
      return;
    }

    elegidas.forEach(m => {
      yaAsignadas.add(m.id); // blindaje contra ids repetidos en el catálogo
      asignaciones.push({
        mision_id: m.id,
        sub_pilar_objetivo: debilidad.sub_pilar,
        motivo: `Debilidad detectada en ${debilidad.sub_pilar} (score ${debilidad.score}, ${debilidad.tier})`,
        // Complejidad normalizada: decide el flujo de aprobación de la asignación (D4).
        complejidad: m.complejidad === 'general' ? 'general' : 'especifica',
      });
    });
  });

  return { asignaciones, sinCobertura };
}

/**
 * XP a otorgar por una misión, calculado SOLO desde datos.
 *
 * Reemplaza la lógica de palabras clave del título en `aprobarMision`
 * (Dashboard_Premium/src/api/misionesService.js), que decidía el XP buscando
 * 'micro'/'desarrollo'/'elite' en el título de la misión. Aquí el título NUNCA
 * influye: una misión llamada "Reto micro élite" vale exactamente su xp_recompensa.
 *
 * Precedencia:
 * 1. mision.xp_recompensa > 0 → ese valor (redondeado a entero).
 * 2. mision.nivel_objetivo → tabla estándar Micro=25 / Desarrollo=50 / Elite=75.
 * 3. atleta?.nivel_desarrollo → la misma tabla.
 * 4. Fallback → 50.
 *
 * @param {Object} mision - Fila de misiones ({xp_recompensa, nivel_objetivo, ...}).
 * @param {Object} [atleta] - Fila de atletas ({nivel_desarrollo, ...}).
 * @returns {number} Entero ≥ 0.
 */
export function calcularXPMision(mision, atleta) {
  const xpExplicito = Number(mision?.xp_recompensa);
  if (Number.isFinite(xpExplicito) && xpExplicito > 0) {
    return Math.round(xpExplicito);
  }

  const porNivelMision = XP_POR_NIVEL[mision?.nivel_objetivo];
  if (porNivelMision !== undefined) return porNivelMision;

  const porNivelAtleta = XP_POR_NIVEL[atleta?.nivel_desarrollo];
  if (porNivelAtleta !== undefined) return porNivelAtleta;

  return XP_FALLBACK;
}
