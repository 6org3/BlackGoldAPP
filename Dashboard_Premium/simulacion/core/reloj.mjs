// core/reloj.mjs — Reloj de días virtuales.
// El loop avanza UN "día de club" por tick. Todo lo que la simulación escribe
// se fecha con este reloj virtual, no con la fecha real, para poder simular
// meses de historia en segundos y mantener todo en el pasado del club.

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function crearReloj(inicioISO = process.env.SIM_INICIO || '2025-09-01') {
  let actual = new Date(`${inicioISO}T12:00:00Z`);
  const inicio = new Date(actual);
  return {
    get fecha() { return new Date(actual); },
    get iso() { return actual.toISOString().split('T')[0]; },
    get diaSemana() { return DIAS_SEMANA[actual.getUTCDay()]; },
    get esDiaEntreno() { return [1, 3, 5, 2, 4].includes(actual.getUTCDay()); }, // L-V
    get esInicioDeMes() { return actual.getUTCDate() === 1; },
    get esFinDeMes() {
      const m = actual.getUTCMonth();
      const sig = new Date(actual); sig.setUTCDate(actual.getUTCDate() + 1);
      return sig.getUTCMonth() !== m;
    },
    get diaNumero() { return Math.round((actual - inicio) / 86400000) + 1; }, // 1-indexado
    mes: () => actual.getUTCMonth() + 1,
    anio: () => actual.getUTCFullYear(),
    avanzar(dias = 1) { actual.setUTCDate(actual.getUTCDate() + dias); return this; },
  };
}
