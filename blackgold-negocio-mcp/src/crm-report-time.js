// Black Gold opera en Sucumbios, Ecuador continental (America/Guayaquil).
// Postgres guarda los timestamps en UTC; los reportes deben cerrar cada dia
// calendario local, no a las 19:00 de Ecuador por usar 00:00 UTC.
export const ZONA_HORARIA_COMERCIAL = "America/Guayaquil";
const OFFSET_UTC_ECUADOR_CONTINENTAL = "-05:00";

const formatoFechaComercial = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_HORARIA_COMERCIAL,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function validarFechaISO(fechaISO) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaISO)) {
    throw new Error("fecha ISO invalida");
  }
}

export function hoyComercialISO(instante = new Date()) {
  const partes = Object.fromEntries(
    formatoFechaComercial
      .formatToParts(instante)
      .filter((parte) => parte.type !== "literal")
      .map((parte) => [parte.type, parte.value]),
  );
  return `${partes.year}-${partes.month}-${partes.day}`;
}

export function sumarDiasCalendarioISO(fechaISO, dias) {
  validarFechaISO(fechaISO);
  const [year, month, day] = fechaISO.split("-").map(Number);
  const fecha = new Date(Date.UTC(year, month - 1, day));
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

export function inicioDiaComercialISO(fechaISO) {
  validarFechaISO(fechaISO);
  return `${fechaISO}T00:00:00.000${OFFSET_UTC_ECUADOR_CONTINENTAL}`;
}

export function finDiaComercialISO(fechaISO) {
  validarFechaISO(fechaISO);
  return `${fechaISO}T23:59:59.999${OFFSET_UTC_ECUADOR_CONTINENTAL}`;
}
