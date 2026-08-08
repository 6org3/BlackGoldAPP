// Protocolo puro del webhook de WhatsApp. No accede a entorno, red ni base de
// datos: puede probarse localmente tanto en Node como en Deno.

export const MAX_TEXTO_LILY = 4096;

export function equalConstante(a, b) {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  let diferencia = aBytes.length ^ bBytes.length;
  const longitud = Math.max(aBytes.length, bBytes.length);
  for (let i = 0; i < longitud; i += 1) {
    diferencia |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diferencia === 0;
}

export function bytesAHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha256Hex(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = typeof payload === "string" ? new TextEncoder().encode(payload) : payload;
  const signature = await crypto.subtle.sign("HMAC", key, bytes);
  return bytesAHex(new Uint8Array(signature));
}

export async function firmaMetaValida(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const recibida = signatureHeader.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(recibida)) return false;
  const esperada = await hmacSha256Hex(appSecret, rawBody);
  return equalConstante(esperada, recibida.toLowerCase());
}

export function normalizarWhatsApp(raw) {
  const digitos = typeof raw === "string" ? raw.replace(/\D/g, "") : "";
  return /^[1-9][0-9]{7,14}$/.test(digitos) ? `+${digitos}` : null;
}

const ROLES_INTERNOS = new Set(["ceo", "direccion", "marketing"]);

// La allowlist vive como secreto de entorno, con forma:
// [{"e164":"+593...","rol":"ceo"}, ...]. Nunca se devuelve el número
// desde esta función ni se incluye en mensajes de error o logs.
export function allowlistInternaDesdeJson(raw) {
  if (typeof raw !== "string" || raw.length < 2 || raw.length > 2_000) return null;
  let entries;
  try {
    entries = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(entries) || entries.length !== ROLES_INTERNOS.size) return null;

  const porIdentificador = new Map();
  const roles = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const identificador = normalizarWhatsApp(entry.e164);
    const rol = typeof entry.rol === "string" ? entry.rol : "";
    if (!identificador || !ROLES_INTERNOS.has(rol) || porIdentificador.has(identificador) || roles.has(rol)) {
      return null;
    }
    porIdentificador.set(identificador, rol);
    roles.add(rol);
  }
  return roles.size === ROLES_INTERNOS.size ? porIdentificador : null;
}

export function rolInternoParaIdentificador(allowlist, identificador) {
  if (!(allowlist instanceof Map)) return null;
  const normalizado = normalizarWhatsApp(identificador);
  return normalizado ? allowlist.get(normalizado) ?? null : null;
}

export function textoSeguro(valor, maximo) {
  const limpio = valor?.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return limpio ? limpio.slice(0, maximo) : null;
}

export function contenidoParaLily(message) {
  const tipo = message.type ?? "desconocido";
  if (tipo === "text") {
    return { tipo, contenido: textoSeguro(message.text?.body, MAX_TEXTO_LILY) ?? "[Mensaje de texto vacío]" };
  }
  if (tipo === "button") {
    return { tipo, contenido: textoSeguro(message.button?.text, 512) ?? "[Botón sin texto]" };
  }
  if (tipo === "interactive") {
    const respuesta = message.interactive?.button_reply ?? message.interactive?.list_reply;
    return { tipo, contenido: textoSeguro(respuesta?.title, 512) ?? "[Respuesta interactiva sin texto]" };
  }
  // No reenviar URLs, ubicaciones, fichas de contacto ni binarios a un agente
  // de forma automática. Lily puede pedir una aclaración o escalar a humano.
  return { tipo, contenido: `[Contenido ${tipo} recibido: requiere atención humana.]` };
}

// Solo reconoce peticiones inequívocas. Evita interpretar como baja consultas
// normales que contengan palabras parecidas (por ejemplo, "¿cómo cancelo una
// clase?"). El adaptador decide el bloqueo; Lily no recibe esa acción.
export function esSolicitudNoContactar(contenido) {
  const texto = (contenido ?? "")
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

// El vínculo solo se reconoce como un comando completo, generado desde la
// sesión autenticada de la app. Una frase normal nunca opera identidad.
export function codigoVinculoAppWhatsApp(contenido) {
  if (typeof contenido !== "string") return null;
  const match = contenido.trim().toUpperCase().match(/^VINCULAR\s+(BGV-[A-HJ-NP-Z2-9]{10})$/);
  return match?.[1] ?? null;
}

export function interesProbable(contenido) {
  const texto = contenido.toLocaleLowerCase("es");
  if (/\binscri(?:bir|pción|pcion)/.test(texto)) return "inscripcion";
  if (/\bhorari[oa]s?\b/.test(texto)) return "horarios";
  if (/\bprueba\b|\bvisita\b/.test(texto)) return "prueba";
  if (/\bclases?\b|\bentrenamiento/.test(texto)) return "clases";
  return null;
}

export function leerMensajes(payload) {
  if (payload?.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) return [];

  const resultado = [];
  for (const entry of payload.entry) {
    if (!Array.isArray(entry?.changes)) continue;
    for (const change of entry.changes) {
      const value = change?.value;
      if (!Array.isArray(value?.messages)) continue; // estados/entregas no se enrutan a Lily
      const nombres = new Map(
        (value.contacts ?? []).map((contact) => [contact.wa_id, textoSeguro(contact.profile?.name, 120)]),
      );
      for (const message of value.messages) {
        resultado.push({ message, profileName: nombres.get(message.from) ?? null });
      }
    }
  }
  return resultado;
}
