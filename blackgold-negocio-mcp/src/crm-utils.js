// Contrato local del CRM. La base de datos es la autoridad final para las
// transiciones; estas utilidades mantienen las validaciones del MCP legibles y
// comprobables sin iniciar un servidor ni cargar credenciales.

export const CRM_ETAPAS = [
  "nuevo",
  "interes_identificado",
  "calificado",
  "prueba_o_visita",
  "inscripcion_en_proceso",
  "ganado",
  "perdido",
  "no_contactar",
];

export const CRM_CANALES = ["whatsapp", "web_chat", "app", "manual"];
export const CRM_SENTIDOS = ["entrada", "salida", "nota_interna"];
export const CRM_INTENCIONES = [
  "informacion_general",
  "clases",
  "horarios",
  "inscripcion",
  "prueba",
  "soporte",
  "seguimiento",
  "otro",
];
export const CRM_TIPOS_ACTIVIDAD = ["seguimiento", "llamada", "prueba_o_visita", "documentacion", "otro"];

export function esActorCrmValido(valor) {
  return /^[a-z0-9_-]{2,64}$/.test(valor || "");
}

export function tieneActualizacionPreferencias(preferencias) {
  return Object.values(preferencias).some((valor) => valor !== undefined);
}

export function esFechaISO(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor || "")) return false;
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

// La lista se configura por proceso, no por llamada MCP. No se normaliza
// mayúsculas/minúsculas: el valor debe coincidir exactamente con el club que
// guarda la base para no convertir una coincidencia ambigua en autorización.
export function parsearClubesCrmPermitidos(valor) {
  if (typeof valor !== "string") return [];
  return [...new Set(valor.split(",").map((club) => club.trim()).filter(Boolean))];
}

export function esClubCrmPermitido(club, clubesPermitidos) {
  if (typeof club !== "string" || !club) return false;
  const clubes = clubesPermitidos instanceof Set
    ? clubesPermitidos
    : new Set(clubesPermitidos || []);
  return clubes.has(club);
}
