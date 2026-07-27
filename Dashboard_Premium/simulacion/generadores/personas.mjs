// generadores/personas.mjs — Fábrica de personas ficticias con cédula estable.
// Las cédulas llevan el PREFIJO de simulación para que la limpieza sea segura
// (solo borra lo que empieza con ese prefijo) y para no colisionar con los
// clubes DEMO/QA existentes.

import { PREFIJO } from '../core/estado.mjs';

const NOMBRES = ['Mateo', 'Sofía', 'Emilia', 'Thiago', 'Valentina', 'Benjamín', 'Isabella', 'Martín', 'Camila', 'Dylan', 'Renata', 'Alejandro', 'Antonella', 'Sebastián', 'Luciana', 'Nicolás', 'Julieta', 'Samuel', 'Regina', 'Bruno'];
const APELLIDOS = ['Loor', 'Zambrano', 'Cedeño', 'Vera', 'Mendoza', 'Alcívar', 'Quiroz', 'Palma', 'Bravo', 'Chávez', 'Andrade', 'Moreira', 'Vélez', 'Pincay', 'Delgado'];

let contador = { atleta: 0, coach: 0, padre: 0 };

// edad -> fecha_nacimiento coherente con la categoría FEB objetivo.
function fechaNacPorEdad(edad, rng, hoy = new Date()) {
  const anio = hoy.getUTCFullYear() - edad;
  const mes = rng.randInt(1, 12);
  const dia = rng.randInt(1, 28);
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function nuevoAtleta(rng, { edadMin, edadMax }) {
  const n = ++contador.atleta;
  const edad = rng.randInt(edadMin, edadMax);
  return {
    cedula: `${PREFIJO}ATL-${String(n).padStart(4, '0')}`,
    nombre: `${rng.pick(NOMBRES)} ${rng.pick(APELLIDOS)}`,
    rol: 'atleta',
    genero: rng.pick(['Masculino', 'Femenino']),
    fecha_nacimiento: fechaNacPorEdad(edad, rng),
    // perfil de pago (lo usa la acción de pagos)
    perfilPago: rng.pick([...Array(55).fill('puntual'), ...Array(22).fill('ocasional'), ...Array(13).fill('moroso'), ...Array(10).fill('becado')]),
  };
}

export function nuevoCoach(rng) {
  const n = ++contador.coach;
  return { cedula: `${PREFIJO}COACH-${String(n).padStart(3, '0')}`, nombre: `${rng.pick(NOMBRES)} ${rng.pick(APELLIDOS)}`, rol: 'coach' };
}

export function nuevoPadre(rng) {
  const n = ++contador.padre;
  return { cedula: `${PREFIJO}PADRE-${String(n).padStart(4, '0')}`, nombre: `${rng.pick(NOMBRES)} ${rng.pick(APELLIDOS)}`, rol: 'padre' };
}

// Rango de edad por nombre de grupo (coherente con calcularCategoriaFEB).
export const EDAD_POR_GRUPO = {
  'Sub-8': { edadMin: 7, edadMax: 8 },
  'Sub-12': { edadMin: 11, edadMax: 12 },
  'Sub-16': { edadMin: 15, edadMax: 16 },
  'Juvenil': { edadMin: 17, edadMax: 18 },
  'Mayores': { edadMin: 19, edadMax: 25 },
};
