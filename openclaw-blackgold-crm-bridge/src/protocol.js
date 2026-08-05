import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

const ROLES_INTERNOS = new Set(["ceo", "direccion", "marketing"]);

export function normalizarWhatsApp(valor) {
  const digitos = typeof valor === "string" ? valor.replace(/\D/g, "") : "";
  return /^[1-9][0-9]{7,14}$/.test(digitos) ? `+${digitos}` : null;
}

export function allowlistInternaDesdeJson(raw) {
  if (typeof raw !== "string" || raw.length < 2 || raw.length > 2_000) return null;
  let entradas;
  try {
    entradas = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(entradas) || entradas.length !== ROLES_INTERNOS.size) return null;

  const porIdentificador = new Map();
  const roles = new Set();
  for (const entrada of entradas) {
    if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) return null;
    const identificador = normalizarWhatsApp(entrada.e164);
    const rol = typeof entrada.rol === "string" ? entrada.rol : "";
    if (!identificador || !ROLES_INTERNOS.has(rol) || porIdentificador.has(identificador) || roles.has(rol)) {
      return null;
    }
    porIdentificador.set(identificador, rol);
    roles.add(rol);
  }
  return roles.size === ROLES_INTERNOS.size ? porIdentificador : null;
}

export function interesProbable(contenido) {
  const texto = typeof contenido === "string" ? contenido.toLocaleLowerCase("es") : "";
  if (/\binscri(?:bir|pci[oó]n)/.test(texto)) return "inscripcion";
  if (/\bhorari[oa]s?\b/.test(texto)) return "horarios";
  if (/\bprueba\b|\bvisita\b/.test(texto)) return "prueba";
  if (/\bclases?\b|\bentrenamiento/.test(texto)) return "clases";
  return null;
}

export function esSolicitudNoContactar(contenido) {
  const texto = (typeof contenido === "string" ? contenido : "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/\s+/g, " ")
    .trim();
  return /^(?:stop|unsubscribe)$/i.test(texto)
    || /\b(?:quiero\s+)?darme\s+de\s+baja\b/.test(texto)
    || /\bno\s+(?:me\s+)?(?:escribas|escriban|contactes|contacten)\b/.test(texto)
    || /\bdejen\s+de\s+(?:escribirme|contactarme)\b/.test(texto)
    || /\bno\s+quiero\s+(?:recibir\s+)?(?:mas\s+)?(?:mensajes|informacion|contacto)\b/.test(texto);
}

export function referenciaEventoWhatsApp(accountId, messageId) {
  const material = `${String(accountId ?? "")}\u001f${String(messageId ?? "")}`;
  return `ocwa_${createHash("sha256").update(material).digest("hex")}`;
}

function valorDotenv(linea) {
  let valor = linea.trim();
  if ((valor.startsWith("\"") && valor.endsWith("\"")) || (valor.startsWith("'") && valor.endsWith("'"))) {
    valor = valor.slice(1, -1);
  } else {
    valor = valor.replace(/\s+#.*$/, "").trim();
  }
  return valor;
}

export function leerVariablesDotenv(contenido, nombres) {
  const buscadas = new Set(nombres);
  const resultado = {};
  for (const linea of contenido.split(/\r?\n/)) {
    const coincidencia = linea.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!coincidencia || !buscadas.has(coincidencia[1])) continue;
    resultado[coincidencia[1]] = valorDotenv(coincidencia[2]);
  }
  return resultado;
}

export function cargarCredencialesPrivadas(ruta) {
  if (typeof ruta !== "string" || ruta.length === 0) throw new Error("credentials_file_missing");
  const stat = statSync(ruta);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error("credentials_file_permissions_invalid");
  const variables = leerVariablesDotenv(readFileSync(ruta, "utf8"), [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "CRM_INTERNAL_WHATSAPP_ALLOWLIST",
  ]);
  if (!/^https?:\/\/[^\s]+$/.test(variables.SUPABASE_URL ?? "")) throw new Error("supabase_url_missing");
  if (!variables.SUPABASE_SERVICE_ROLE_KEY) throw new Error("service_role_missing");
  const allowlistInterna = allowlistInternaDesdeJson(variables.CRM_INTERNAL_WHATSAPP_ALLOWLIST);
  if (!allowlistInterna) throw new Error("internal_allowlist_missing_or_invalid");
  return {
    supabaseUrl: variables.SUPABASE_URL.replace(/\/+$/, ""),
    serviceRoleKey: variables.SUPABASE_SERVICE_ROLE_KEY,
    allowlistInterna,
  };
}
