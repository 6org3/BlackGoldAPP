// packages/analytics-core/categoriaFEB.js

export function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return 0;
  const hoy = new Date();
  const fechaNac = new Date(fechaNacimiento);
  if (isNaN(fechaNac.getTime())) return 0;
  let edad = hoy.getFullYear() - fechaNac.getFullYear();
  const mes = hoy.getMonth() - fechaNac.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < fechaNac.getDate())) {
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
