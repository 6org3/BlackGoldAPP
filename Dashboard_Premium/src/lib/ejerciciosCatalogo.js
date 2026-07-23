// src/lib/ejerciciosCatalogo.js
//
// Funciones puras sobre el catálogo de ejercicios de entrenamiento
// (ejercicios_catalogo, ver src/api/tablas.js). Sin imports de Supabase —
// se testean en aislamiento (ver ejerciciosCatalogo.test.js, patrón de
// src/lib/xp.test.js).

/**
 * Ejercicios de un tipo, filtrados por el nivel del grupo actual.
 *
 * `grupo.nivel` es el vocabulario cerrado (Micro/Desarrollo/Elite) contra el
 * que matchea `grupos_recomendados`; `grupo.nombre` es texto libre por club y
 * se conserva como compatibilidad legacy adicional. Sin grupo o con nivel
 * NULL no se filtra por nivel (se devuelven todos los del tipo).
 *
 * Extraída de AdminSesiones.jsx (antes inline, líneas ~118-123) para poder
 * testearla sin montar el componente.
 */
export function filtrarEjerciciosPorTipoYNivel(catalogo, tipo, grupo = null) {
  return (catalogo || []).filter((e) =>
    e.tipo === tipo &&
    (!grupo || !grupo.nivel ||
      e.grupos_recomendados?.includes(grupo.nivel) ||
      e.grupos_recomendados?.includes(grupo.nombre))
  );
}

/**
 * Resuelve una lista de `ejercicios_ids` (guardados en sesiones_control) a
 * `{ id, nombre }` contra el catálogo actual, preservando orden y longitud.
 * Un id que ya no existe en el catálogo (ejercicio eliminado) devuelve
 * `nombre: null` en su misma posición, en vez de desaparecer de la lista.
 */
export function resolverNombresEjercicios(ids, catalogo) {
  if (!ids || ids.length === 0) return [];
  return ids.map((id) => {
    const ej = (catalogo || []).find((e) => e.id === id);
    return { id, nombre: ej?.nombre ?? null };
  });
}
