// Filtro por rango de edad.
//
// La edad se resuelve SIEMPRE contra `usuarios.fecha_nacimiento`, nunca contra
// `atletas.edad` ni `usuarios.categoria_feb`: las dos se escriben una vez y no
// envejecen solas (`categoria_feb` es una columna GENERATED de una función
// declarada IMMUTABLE que por dentro usa age(), así que Postgres la congela en
// el INSERT). Traducir el rango de edad a un rango de fechas de nacimiento es
// exacto en cualquier momento y no depende de que nadie recalcule nada.

import { RANGOS_EDAD_FEB } from '../../../packages/analytics-core/categoriaFEB.js';

/**
 * Fecha de nacimiento de quien cumple exactamente `edad` años hoy (ISO
 * `YYYY-MM-DD`). Se formatea en hora local a propósito: `toISOString()`
 * normaliza a UTC y en zonas al oeste de Greenwich (Ecuador es UTC-5)
 * devolvería el día anterior.
 */
export const fechaNacimientoDeEdad = (edad, hoy = new Date()) => {
  const d = new Date(hoy.getFullYear() - edad, hoy.getMonth(), hoy.getDate());
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

/**
 * Normaliza lo que escribe el usuario en un extremo del rango.
 * Vacío o inválido ⇒ `undefined` (extremo sin acotar), que no es lo mismo que
 * 0: un 0 sí filtra, y dejaría la lista vacía.
 */
export const parseEdad = (v) => {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/**
 * Traduce una categoría FEB a un rango de `fecha_nacimiento` — mismo criterio
 * que `edadMin`/`edadMax` arriba, aplicado a `RANGOS_EDAD_FEB`
 * (packages/analytics-core/categoriaFEB.js). Reemplaza los
 * `.eq('usuarios.categoria_feb', categoria)` que dependían de la columna
 * GENERATED congelada (coherencia-01): esa columna nunca envejece con el
 * atleta, este rango de fechas sí.
 *
 * `fechaNacGt` viene `undefined` para 'Mayores' (sin techo de edad) — el
 * caller no debe aplicar `.gt()` en ese caso.
 *
 * Devuelve `null` si `categoria` no es una de las 6 categorías canónicas: el
 * caller debe tratarlo como "cero resultados" (mismo comportamiento que un
 * `.eq()` sobre un valor que `categoria_feb` jamás tendría), no como "sin
 * filtro" — omitir el filtro en silencio le mostraría a un coach atletas
 * fuera de su categoría asignada.
 */
export const rangoFechaNacimientoPorCategoria = (categoria, hoy = new Date()) => {
  const rango = RANGOS_EDAD_FEB[categoria];
  if (!rango) return null;
  return {
    // Nacer en o antes de esta fecha ⇒ tener al menos `rango.min` años.
    fechaNacLte: fechaNacimientoDeEdad(rango.min, hoy),
    // Nacer después de esta fecha ⇒ no haber cumplido aún `rango.max + 1`.
    fechaNacGt: rango.max != null ? fechaNacimientoDeEdad(rango.max + 1, hoy) : undefined,
  };
};
