// config/fases.mjs — Plan PROGRESIVO. El corazón del "probar la app de forma
// progresiva": la complejidad y el volumen crecen día a día, así los bugs
// simples salen temprano (club chico) y los de escala salen después.
//
// Cada fase define:
//  - hastaDia: día virtual en el que termina la fase.
//  - activas: qué tipos de acción están habilitados (deben existir en acciones/).
//  - escala: multiplicadores de volumen (atletas objetivo, prob. de cada acción).
//
// Ajustá libremente. Para el modo CARGA/estrés, la última fase sube todo.

export const FASES = [
  {
    nombre: 'F0 · Arranque',
    hastaDia: 7,
    objetivoAtletas: 6,
    grupos: ['Sub-8'],
    activas: ['altaCoach', 'altaAtleta', 'asistencia'],
    prob: { asistencia: 0.9, evaluacion: 0, mision: 0, pago: 0, evento: 0, comunicacion: 0, alta: 0.3, baja: 0 },
  },
  {
    nombre: 'F1 · Formación',
    hastaDia: 30,
    objetivoAtletas: 20,
    grupos: ['Sub-8', 'Sub-12'],
    activas: ['altaAtleta', 'asistencia', 'evaluacion', 'mision', 'comunicacion'],
    prob: { asistencia: 0.85, evaluacion: 0.15, mision: 0.25, pago: 0, evento: 0, comunicacion: 0.1, alta: 0.15, baja: 0.02 },
  },
  {
    nombre: 'F2 · Club vivo',
    hastaDia: 90,
    objetivoAtletas: 45,
    grupos: ['Sub-8', 'Sub-12', 'Sub-16'],
    activas: ['altaAtleta', 'asistencia', 'evaluacion', 'mision', 'pago', 'evento', 'comunicacion', 'baja'],
    prob: { asistencia: 0.8, evaluacion: 0.2, mision: 0.3, pago: 1, evento: 0.05, comunicacion: 0.12, alta: 0.1, baja: 0.03 },
  },
  {
    nombre: 'F3 · Carga / estrés',
    hastaDia: 999,
    objetivoAtletas: Number(process.env.SIM_CARGA_ATLETAS || 200),
    grupos: ['Sub-8', 'Sub-12', 'Sub-16', 'Juvenil', 'Mayores'],
    activas: ['altaAtleta', 'asistencia', 'evaluacion', 'mision', 'pago', 'evento', 'comunicacion', 'baja'],
    prob: { asistencia: 0.9, evaluacion: 0.3, mision: 0.4, pago: 1, evento: 0.1, comunicacion: 0.2, alta: 0.5, baja: 0.05 },
  },
];

export function faseDeDia(dia) {
  return FASES.find((f) => dia <= f.hastaDia) || FASES[FASES.length - 1];
}
