// Protocolo puro de la salida de Lily. No conoce secretos de Supabase, no
// accede a la red ni a la base de datos, por lo que se puede probar en Node.

const encoder = new TextEncoder();

export const MAX_MENSAJE_LILY = 4096;
export const MAX_IDEMPOTENCY_KEY = 180;
export const MAX_REPLY_TO_MESSAGE_REF = 180;
export const INTENCIONES_LILY = new Set([
  "informacion_general",
  "clases",
  "horarios",
  "inscripcion",
  "prueba",
  "soporte",
  "seguimiento",
  "otro",
]);
export const MODOS_SALIDA_LILY = new Set(["respuesta", "seguimiento"]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_RE = /^[A-Za-z0-9._:-]{8,180}$/;
const MESSAGE_REF_RE = /^[A-Za-z0-9._:-]{1,180}$/;

export function equalConstante(a, b) {
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  let diferencia = aBytes.length ^ bBytes.length;
  const longitud = Math.max(aBytes.length, bBytes.length);
  for (let i = 0; i < longitud; i += 1) {
    diferencia |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diferencia === 0;
}

function bytesAHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hmacSha256Hex(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = typeof payload === "string" ? encoder.encode(payload) : payload;
  const signature = await crypto.subtle.sign("HMAC", key, bytes);
  return bytesAHex(new Uint8Array(signature));
}

export async function sha256Hex(payload) {
  const bytes = typeof payload === "string" ? encoder.encode(payload) : payload;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesAHex(new Uint8Array(digest));
}

function bytesFirmados(timestamp, rawBody) {
  const prefix = encoder.encode(`${timestamp}.`);
  const bytes = new Uint8Array(prefix.length + rawBody.length);
  bytes.set(prefix);
  bytes.set(rawBody, prefix.length);
  return bytes;
}

export function timestampFresco(
  timestamp,
  nowMs = Date.now(),
  antiguedadMaximaMs = 5 * 60 * 1000,
  adelantoMaximoMs = 30 * 1000,
) {
  if (!/^\d{10}$/.test(timestamp ?? "")) return false;
  const milliseconds = Number(timestamp) * 1000;
  return Number.isSafeInteger(milliseconds)
    && milliseconds >= nowMs - antiguedadMaximaMs
    && milliseconds <= nowMs + adelantoMaximoMs;
}

export async function firmaIngresoLilyValida(rawBody, timestamp, signatureHeader, secret, nowMs = Date.now()) {
  if (!timestampFresco(timestamp, nowMs) || !signatureHeader?.startsWith("sha256=")) return false;
  const recibida = signatureHeader.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(recibida)) return false;
  const esperada = await hmacSha256Hex(secret, bytesFirmados(timestamp, rawBody));
  return equalConstante(esperada, recibida.toLowerCase());
}

function texto(valor, maximo, requerido = false) {
  if (typeof valor !== "string") return null;
  const limpio = valor.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if ((requerido && !limpio) || limpio.length > maximo) return null;
  return limpio || null;
}

function objeto(valor) {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? valor : null;
}

export function validarSolicitudSalida(valor) {
  const body = objeto(valor);
  if (!body) return { error: "El cuerpo debe ser un objeto JSON." };
  if (body.actor !== undefined) return { error: "actor se asigna en el servidor." };

  const contactId = typeof body.contact_id === "string" && UUID_RE.test(body.contact_id)
    ? body.contact_id
    : null;
  const mensaje = texto(body.mensaje, MAX_MENSAJE_LILY, true);
  const idempotencyKey = typeof body.idempotency_key === "string" && IDEMPOTENCY_RE.test(body.idempotency_key)
    ? body.idempotency_key
    : null;
  const intent = texto(body.intent, 80, true);
  const modo = texto(body.modo, 32, true);
  const replyToMessageRef = body.reply_to_message_ref === undefined || body.reply_to_message_ref === null
    ? null
    : texto(body.reply_to_message_ref, MAX_REPLY_TO_MESSAGE_REF, true);

  if (!contactId) return { error: "contact_id no es válido." };
  if (!mensaje) return { error: "mensaje no es válido." };
  if (!idempotencyKey) return { error: "idempotency_key no es válido." };
  if (!intent || !INTENCIONES_LILY.has(intent)) return { error: "intent no es válido." };
  if (!modo || !MODOS_SALIDA_LILY.has(modo)) return { error: "modo no es válido." };
  if (modo === "seguimiento" && intent !== "seguimiento") {
    return { error: "modo seguimiento requiere intent seguimiento." };
  }
  if (body.reply_to_message_ref !== undefined && body.reply_to_message_ref !== null && (!replyToMessageRef || !MESSAGE_REF_RE.test(replyToMessageRef))) {
    return { error: "reply_to_message_ref no es válido." };
  }
  if (modo === "respuesta" && !replyToMessageRef) {
    return { error: "reply_to_message_ref es obligatorio para una respuesta." };
  }

  return {
    data: {
      contactId,
      mensaje,
      idempotencyKey,
      intent,
      modo,
      replyToMessageRef,
    },
  };
}

export function destinatarioWhatsApp(valor) {
  const digitos = typeof valor === "string" ? valor.replace(/\D/g, "") : "";
  return /^[1-9][0-9]{7,14}$/.test(digitos) ? digitos : null;
}

export function clasificarRechazoMeta(status) {
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    return { errorResumido: "meta_resultado_desconocido", reintentable: false };
  }
  // Sólo se conserva el código HTTP y su clase. El cuerpo de Meta puede
  // contener datos operativos o del destinatario y no se registra.
  const reintentable = status === 408 || status === 425 || status === 429 || status >= 500;
  return {
    errorResumido: `meta_${reintentable ? "reintentable" : "terminal"}_http_${status}`,
    reintentable,
  };
}
