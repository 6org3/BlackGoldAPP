// AUTO-GENERADO desde packages/analytics-core — NO EDITAR. Regenerar con: npm run functions:sync
// packages/analytics-core/categoriaFEB.js

// Lista canónica de categorías FEB, en orden de edad. Debe coincidir con los
// valores que devuelve calcularCategoriaFEB() (y con el gemelo SQL
// calcular_categoria_feb de la migración v18/v20). Consumida por la UI de
// tarifas de pagos para no duplicar los literales.
export const CATEGORIAS_FEB = [
  'Premini (Sub-9)',
  'Mini (Sub-11)',
  'Menores (Sub-14)',
  'Prejuvenil (Sub-16)',
  'Juvenil (Sub-18)',
  'Mayores',
];

// Rango de EDAD (años, ambos límites inclusive; `max: null` = sin techo, solo
// Mayores) por categoría FEB — espejo en forma de TABLA de los mismos
// umbrales que calcularCategoriaFEB() aplica por comparación secuencial
// (edad <= 9 → Premini, etc.). Existe para que un caller que filtra en SQL/
// PostgREST (coherencia-01: gates de alcance por categoría del coach en
// atletasService.js, AdminMisiones.jsx) pueda traducir "categoría X" a un
// rango de `fecha_nacimiento` sin poder invocar esta función fila por fila —
// nunca leyendo `usuarios.categoria_feb`, la columna GENERATED que Postgres
// congela en el INSERT (v20). Un test cruzado (utilsAtletas.test.js) recorre
// todas las edades y verifica que esta tabla y calcularCategoriaFEB() nunca
// diverjan; si se cambia un umbral aquí sin cambiarlo allá (o viceversa), esa
// suite lo marca.
export const RANGOS_EDAD_FEB = {
  'Premini (Sub-9)': { min: 1, max: 9 },
  'Mini (Sub-11)': { min: 10, max: 11 },
  'Menores (Sub-14)': { min: 12, max: 14 },
  'Prejuvenil (Sub-16)': { min: 15, max: 16 },
  'Juvenil (Sub-18)': { min: 17, max: 18 },
  'Mayores': { min: 19, max: null },
};

// Componentes { anio, mes (1-12), dia } de una fecha de nacimiento, sin pasar
// por new Date() + getters locales: fecha_nacimiento llega en producción
// como 'YYYY-MM-DD' puro (columna `date` de Postgres, o el value de un
// <input type="date">), y new Date('YYYY-MM-DD') lo interpreta como
// medianoche UTC — leerlo luego con getFullYear/getMonth/getDate (locales)
// adelanta el cumpleaños un día entero en cualquier huso detrás de UTC
// (Ecuador, UTC-5). También se admite un objeto Date ya construido (algunos
// callers/tests lo usan así), leyendo sus componentes locales directamente
// sin reinterpretar nada.
function partesFecha(fechaNacimiento) {
  if (fechaNacimiento instanceof Date) {
    if (isNaN(fechaNacimiento.getTime())) return null;
    return {
      anio: fechaNacimiento.getFullYear(),
      mes: fechaNacimiento.getMonth() + 1,
      dia: fechaNacimiento.getDate(),
    };
  }
  const [anioStr, mesStr, diaStr] = String(fechaNacimiento).split('-');
  const anio = Number(anioStr);
  const mes = Number(mesStr);
  const dia = Number(diaStr);
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) return null;
  return { anio, mes, dia };
}

export function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return 0;
  const partes = partesFecha(fechaNacimiento);
  if (!partes) return 0;
  const hoy = new Date();
  let edad = hoy.getFullYear() - partes.anio;
  const mesActual = hoy.getMonth() + 1; // 1-indexado, para comparar contra partes.mes sin mezclar bases
  if (mesActual < partes.mes || (mesActual === partes.mes && hoy.getDate() < partes.dia)) {
    edad--;
  }
  return edad;
}

export function calcularCategoriaFEB(fechaNacimiento) {
  if (!fechaNacimiento) return null;
  let edad;
  if (typeof fechaNacimiento === 'number') {
    edad = fechaNacimiento;
  } else {
    edad = calcularEdad(fechaNacimiento);
  }
  if (edad <= 0) return null;
  if (edad <= 9) return 'Premini (Sub-9)';
  if (edad <= 11) return 'Mini (Sub-11)';
  if (edad <= 14) return 'Menores (Sub-14)';
  if (edad <= 16) return 'Prejuvenil (Sub-16)';
  if (edad <= 18) return 'Juvenil (Sub-18)';
  return 'Mayores';
}
