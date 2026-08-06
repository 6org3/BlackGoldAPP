// crm-lily-send
//
// Pasarela de salida de Lily hacia WhatsApp Cloud API. El llamador entrega un
// contact_id, nunca un teléfono. La reserva y el despacho del outbox CRM son
// las únicas operaciones que pueden resolver el canal privado bajo service_role.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  clasificarRechazoMeta,
  destinatarioWhatsApp,
  firmaIngresoLilyValida,
  sha256Hex,
  validarSolicitudSalida,
} from "./protocol.mjs";

const MAX_BODY_BYTES = 16 * 1024;
const ACTOR_LILY = "lily";
const META_MESSAGE_ID_RE = /^[A-Za-z0-9._:-]{1,180}$/;

type SolicitudSalida = {
  contactId: string;
  mensaje: string;
  idempotencyKey: string;
  intent: string;
  modo: "respuesta" | "seguimiento";
  replyToMessageRef: string | null;
};

type ReservaSalida = {
  salida_id?: string;
  estado?: "pendiente" | "aceptada_meta" | "enviando" | "cancelada" | "bloqueada" | "conflicto" | "error_terminal" | "revision_manual";
  repetida?: boolean;
};

type DespachoSalida = {
  salida_id?: string;
  estado?: "enviando" | "aceptada_meta" | "cancelada" | "bloqueada" | "enviando_otro_proceso" | "conflicto" | "no_reservada" | "error_terminal" | "revision_manual";
};

type AutorizacionSalida = {
  salida_id?: string;
  estado?: "autorizada" | "aceptada_meta" | "cancelada" | "bloqueada" | "conflicto" | "no_reservada" | "requiere_despacho" | "error_terminal" | "revision_manual";
  destinatario?: string;
};

type FinalizacionSalida = {
  estado?: "aceptada_meta" | "error" | "error_terminal" | "revision_manual" | "cancelada" | "conflicto" | "no_reservada";
};

type ResultadoMeta =
  | { tipo: "aceptada"; metaMessageId: string }
  | { tipo: "rechazada"; status: number }
  | { tipo: "desconocida" };

type AdminClient = SupabaseClient;

const textResponse = (body: string, status = 200) => new Response(body, {
  status,
  headers: { "Content-Type": "text/plain; charset=utf-8" },
});

const jsonResponse = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8" },
});

function secretRoleKey(): string | null {
  // Compatibilidad con las secret keys actuales y el nombre legacy local.
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys) as Record<string, unknown>;
      if (typeof parsed.default === "string" && parsed.default) return parsed.default;
    } catch {
      console.error("[crm-lily-send] SUPABASE_SECRET_KEYS no tiene formato válido.");
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null;
}

function metaConfig(): { url: URL; accessToken: string } | null {
  const phoneNumberId = Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID")?.trim() ?? "";
  const graphVersion = Deno.env.get("META_WHATSAPP_GRAPH_VERSION")?.trim() ?? "";
  const accessToken = Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")?.trim() ?? "";

  if (!phoneNumberId || !graphVersion || !accessToken) return null;
  if (!/^[0-9]{5,30}$/.test(phoneNumberId) || !/^v\d+\.\d+$/.test(graphVersion)) {
    throw new Error("La configuración de Meta no cumple el formato esperado.");
  }

  const url = new URL(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`);
  if (url.protocol !== "https:" || url.hostname !== "graph.facebook.com") {
    throw new Error("El destino de Meta no cumple la política de salida.");
  }
  return { url, accessToken };
}

async function leerCuerpoConLimite(req: Request, maxBytes: number): Promise<Uint8Array | null> {
  if (!req.body) return new Uint8Array();

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // El cliente puede haberse desconectado: el límite ya se cumplió.
        }
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function payloadParaHash(solicitud: SolicitudSalida): string {
  // El orden fijo evita que la serialización de un objeto altere la identidad
  // idempotente. El hash no se devuelve ni registra el contenido del texto.
  return JSON.stringify([
    solicitud.contactId,
    solicitud.intent,
    solicitud.modo,
    solicitud.replyToMessageRef,
    solicitud.mensaje,
  ]);
}

function esConflictoIdempotente(error: { message?: string } | null): boolean {
  return /idempot|payload[_ ]?hash|hash distinto/i.test(error?.message ?? "");
}

async function reservarSalida(
  admin: AdminClient,
  solicitud: SolicitudSalida,
  payloadHash: string,
): Promise<{ data: ReservaSalida | null; error: { message?: string } | null }> {
  const { data, error } = await admin.rpc("crm_reservar_salida_lily", {
    p_contact_id: solicitud.contactId,
    p_canal: "whatsapp",
    p_idempotency_key: solicitud.idempotencyKey,
    p_payload_hash: payloadHash,
    p_intencion: solicitud.intent,
    p_modo: solicitud.modo,
    p_respuesta_a_ref: solicitud.replyToMessageRef,
    p_actor: ACTOR_LILY,
  });
  return { data: data as ReservaSalida | null, error };
}

async function despacharSalida(
  admin: AdminClient,
  solicitud: SolicitudSalida,
  payloadHash: string,
): Promise<{ data: DespachoSalida | null; error: { message?: string } | null }> {
  const { data, error } = await admin.rpc("crm_despachar_salida_lily", {
    p_idempotency_key: solicitud.idempotencyKey,
    p_payload_hash: payloadHash,
    p_actor: ACTOR_LILY,
  });
  return { data: data as DespachoSalida | null, error };
}

async function finalizarSalida(
  admin: AdminClient,
  solicitud: SolicitudSalida,
  payloadHash: string,
  aceptada: boolean,
  metaMessageId: string | null,
  errorResumido: string | null,
): Promise<{ data: FinalizacionSalida | null; error: { message?: string } | null }> {
  const { data, error } = await admin.rpc("crm_finalizar_salida_lily", {
    p_idempotency_key: solicitud.idempotencyKey,
    p_payload_hash: payloadHash,
    p_aceptada: aceptada,
    p_meta_mensaje_id: metaMessageId,
    p_error_resumido: errorResumido,
    p_actor: ACTOR_LILY,
  });
  return { data: data as FinalizacionSalida | null, error };
}

async function autorizarEnvio(
  admin: AdminClient,
  solicitud: SolicitudSalida,
  payloadHash: string,
): Promise<{ data: AutorizacionSalida | null; error: { message?: string } | null }> {
  const { data, error } = await admin.rpc("crm_autorizar_envio_lily", {
    p_idempotency_key: solicitud.idempotencyKey,
    p_payload_hash: payloadHash,
    p_actor: ACTOR_LILY,
  });
  return { data: data as AutorizacionSalida | null, error };
}

function obtenerMetaMessageId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const messages = (payload as Record<string, unknown>).messages;
  if (!Array.isArray(messages) || !messages[0] || typeof messages[0] !== "object") return null;
  const id = (messages[0] as Record<string, unknown>).id;
  return typeof id === "string" && META_MESSAGE_ID_RE.test(id) ? id : null;
}

async function enviarAMeta(
  config: { url: URL; accessToken: string },
  destinatario: string,
  mensaje: string,
  replyToMessageRef: string | null,
): Promise<ResultadoMeta> {
  try {
    const response = await fetch(config.url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: destinatario,
        type: "text",
        text: { preview_url: false, body: mensaje },
        ...(replyToMessageRef ? { context: { message_id: replyToMessageRef } } : {}),
      }),
    });
    if (!response.ok) return { tipo: "rechazada", status: response.status };

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { tipo: "desconocida" };
    }
    const metaMessageId = obtenerMetaMessageId(body);
    return metaMessageId ? { tipo: "aceptada", metaMessageId } : { tipo: "desconocida" };
  } catch {
    // No se finaliza como fallo un timeout/error de red: Meta pudo aceptar el
    // mensaje antes de perderse la respuesta. El outbox queda en enviando para
    // conciliación, evitando un reintento ciego que duplique WhatsApps.
    return { tipo: "desconocida" };
  }
}

function respuestaEstadoReserva(reserva: ReservaSalida, solicitud: SolicitudSalida): Response | null {
  if (reserva.estado === "conflicto") {
    return jsonResponse({ error: "La idempotency_key no coincide con su payload original." }, 409);
  }
  if (reserva.estado === "aceptada_meta") {
    return jsonResponse({ estado: "aceptada_por_meta", idempotency_key: solicitud.idempotencyKey }, 200);
  }
  if (reserva.estado === "cancelada" || reserva.estado === "bloqueada") {
    return jsonResponse({ estado: reserva.estado, idempotency_key: solicitud.idempotencyKey }, 409);
  }
  if (reserva.estado === "error_terminal") {
    return jsonResponse({ estado: "fallo_terminal", idempotency_key: solicitud.idempotencyKey }, 422);
  }
  if (reserva.estado === "revision_manual") {
    return jsonResponse({ estado: "requiere_revision", idempotency_key: solicitud.idempotencyKey }, 202);
  }
  return null;
}

function respuestaEstadoDespacho(despacho: DespachoSalida, solicitud: SolicitudSalida): Response | null {
  if (despacho.estado === "conflicto") {
    return jsonResponse({ error: "La idempotency_key no coincide con su payload original." }, 409);
  }
  if (despacho.estado === "aceptada_meta") {
    return jsonResponse({ estado: "aceptada_por_meta", idempotency_key: solicitud.idempotencyKey }, 200);
  }
  if (despacho.estado === "cancelada" || despacho.estado === "bloqueada") {
    return jsonResponse({ estado: despacho.estado, idempotency_key: solicitud.idempotencyKey }, 409);
  }
  if (despacho.estado === "enviando_otro_proceso") {
    return jsonResponse({ estado: "en_proceso", idempotency_key: solicitud.idempotencyKey }, 202);
  }
  if (despacho.estado === "error_terminal") {
    return jsonResponse({ estado: "fallo_terminal", idempotency_key: solicitud.idempotencyKey }, 422);
  }
  if (despacho.estado === "revision_manual") {
    return jsonResponse({ estado: "requiere_revision", idempotency_key: solicitud.idempotencyKey }, 202);
  }
  return null;
}

function respuestaEstadoAutorizacion(autorizacion: AutorizacionSalida, solicitud: SolicitudSalida): Response | null {
  if (autorizacion.estado === "conflicto") {
    return jsonResponse({ error: "La idempotency_key no coincide con su payload original." }, 409);
  }
  if (autorizacion.estado === "aceptada_meta") {
    return jsonResponse({ estado: "aceptada_por_meta", idempotency_key: solicitud.idempotencyKey }, 200);
  }
  if (autorizacion.estado === "cancelada" || autorizacion.estado === "bloqueada") {
    return jsonResponse({ estado: autorizacion.estado, idempotency_key: solicitud.idempotencyKey }, 409);
  }
  if (autorizacion.estado === "error_terminal") {
    return jsonResponse({ estado: "fallo_terminal", idempotency_key: solicitud.idempotencyKey }, 422);
  }
  if (autorizacion.estado === "revision_manual") {
    return jsonResponse({ estado: "requiere_revision", idempotency_key: solicitud.idempotencyKey }, 202);
  }
  if (autorizacion.estado === "requiere_despacho") {
    return jsonResponse({ estado: "requiere_despacho", idempotency_key: solicitud.idempotencyKey }, 409);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Método no permitido.", {
      status: 405,
      headers: { Allow: "POST", "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const ingressSecret = Deno.env.get("LILY_OUTBOUND_INGRESS_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = secretRoleKey();
  if (!ingressSecret || !supabaseUrl || !serviceRoleKey) {
    return textResponse("Configuración de salida incompleta.", 503);
  }

  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return textResponse("Carga demasiado grande.", 413);
  }
  const rawBody = await leerCuerpoConLimite(req, MAX_BODY_BYTES);
  if (!rawBody) return textResponse("Carga demasiado grande.", 413);

  const timestamp = req.headers.get("X-BlackGold-Timestamp") ?? "";
  const signature = req.headers.get("X-BlackGold-Signature-256");
  if (!await firmaIngresoLilyValida(rawBody, timestamp, signature, ingressSecret)) {
    console.warn("[crm-lily-send] solicitud de Lily rechazada por firma o antigüedad.");
    return textResponse("No autorizado.", 401);
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return textResponse("JSON inválido.", 400);
  }
  const parsed = validarSolicitudSalida(body);
  if ("error" in parsed) return jsonResponse({ error: parsed.error }, 400);
  const solicitud = parsed.data as SolicitudSalida;

  let config: { url: URL; accessToken: string } | null;
  try {
    config = metaConfig();
  } catch (error) {
    console.error("[crm-lily-send] configuración de Meta inválida:", error instanceof Error ? error.message : "error desconocido");
    return textResponse("Configuración de salida incompleta.", 503);
  }
  if (!config) return textResponse("Configuración de salida incompleta.", 503);

  const payloadHash = await sha256Hex(payloadParaHash(solicitud));
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const reserva = await reservarSalida(admin, solicitud, payloadHash);
  if (reserva.error || !reserva.data) {
    if (esConflictoIdempotente(reserva.error)) {
      return jsonResponse({ error: "La idempotency_key no coincide con su payload original." }, 409);
    }
    console.error("[crm-lily-send] no se pudo reservar la salida CRM.");
    return textResponse("No se pudo reservar la salida CRM.", 503);
  }
  const estadoReserva = respuestaEstadoReserva(reserva.data, solicitud);
  if (estadoReserva) return estadoReserva;
  if (reserva.data.estado !== "pendiente" && reserva.data.estado !== "enviando") {
    console.error("[crm-lily-send] la reserva devolvió un estado no reconocido.");
    return textResponse("No se pudo preparar la salida CRM.", 503);
  }

  const despacho = await despacharSalida(admin, solicitud, payloadHash);
  if (despacho.error || !despacho.data) {
    if (esConflictoIdempotente(despacho.error)) {
      return jsonResponse({ error: "La idempotency_key no coincide con su payload original." }, 409);
    }
    console.error("[crm-lily-send] no se pudo despachar la salida CRM.");
    return textResponse("No se pudo despachar la salida CRM.", 503);
  }
  const estadoDespacho = respuestaEstadoDespacho(despacho.data, solicitud);
  if (estadoDespacho) return estadoDespacho;
  if (despacho.data.estado !== "enviando") {
    console.error("[crm-lily-send] el despacho devolvió un estado no reconocido.");
    return textResponse("No se pudo despachar la salida CRM.", 503);
  }

  // La autorización vuelve a consultar contacto, consentimiento y canal
  // inmediatamente antes de Meta. Sólo esta RPC devuelve el destinatario al
  // proceso de Edge; nunca llega a Lily ni a la respuesta HTTP.
  const autorizacion = await autorizarEnvio(admin, solicitud, payloadHash);
  if (autorizacion.error || !autorizacion.data) {
    if (esConflictoIdempotente(autorizacion.error)) {
      return jsonResponse({ error: "La idempotency_key no coincide con su payload original." }, 409);
    }
    console.error("[crm-lily-send] no se pudo autorizar la salida CRM.");
    return textResponse("No se pudo autorizar la salida CRM.", 503);
  }
  const estadoAutorizacion = respuestaEstadoAutorizacion(autorizacion.data, solicitud);
  if (estadoAutorizacion) return estadoAutorizacion;
  const destinatario = destinatarioWhatsApp(autorizacion.data.destinatario);
  if (autorizacion.data.estado !== "autorizada" || !destinatario) {
    console.error("[crm-lily-send] la autorización no devolvió un destinatario válido.");
    return textResponse("No se pudo autorizar la salida CRM.", 503);
  }

  const meta = await enviarAMeta(config, destinatario, solicitud.mensaje, solicitud.replyToMessageRef);
  if (meta.tipo === "desconocida") {
    // Un timeout, cierre de conexión o JSON 2xx malformado puede ocurrir
    // después de que Meta aceptó el mensaje. Se registra exclusivamente un
    // resultado sintético y se bloquea cualquier reenvío automático.
    const finalizacion = await finalizarSalida(
      admin,
      solicitud,
      payloadHash,
      false,
      null,
      "meta_resultado_desconocido",
    );
    if (finalizacion.error || !finalizacion.data) {
      console.error("[crm-lily-send] resultado de Meta no confirmable; no se pudo cerrar el outbox.");
      return jsonResponse({ estado: "en_proceso", idempotency_key: solicitud.idempotencyKey }, 202);
    }
    if (finalizacion.data.estado === "revision_manual") {
      return jsonResponse({ estado: "requiere_revision", idempotency_key: solicitud.idempotencyKey }, 202);
    }
    if (finalizacion.data.estado === "cancelada") {
      return jsonResponse({ estado: "cancelada", idempotency_key: solicitud.idempotencyKey }, 409);
    }
    if (finalizacion.data.estado === "aceptada_meta") {
      return jsonResponse({ estado: "aceptada_por_meta", idempotency_key: solicitud.idempotencyKey }, 200);
    }
    console.error("[crm-lily-send] resultado de Meta no confirmable; el outbox devolvió un estado no esperado.");
    return jsonResponse({ estado: "en_proceso", idempotency_key: solicitud.idempotencyKey }, 202);
  }

  if (meta.tipo === "rechazada") {
    const clasificacion = clasificarRechazoMeta(meta.status);
    const finalizacion = await finalizarSalida(
      admin,
      solicitud,
      payloadHash,
      false,
      null,
      clasificacion.errorResumido,
    );
    if (finalizacion.error || !finalizacion.data) {
      console.error("[crm-lily-send] Meta rechazó la salida y no se pudo finalizar el outbox.");
      return textResponse("No se pudo finalizar la salida CRM.", 503);
    }
    console.error("[crm-lily-send] Meta rechazó la salida.", { status: meta.status });
    if (finalizacion.data.estado === "cancelada") {
      return jsonResponse({ estado: "cancelada", idempotency_key: solicitud.idempotencyKey }, 409);
    }
    if (finalizacion.data.estado === "revision_manual") {
      return jsonResponse({ estado: "requiere_revision", idempotency_key: solicitud.idempotencyKey }, 202);
    }
    if (!clasificacion.reintentable && finalizacion.data.estado === "error_terminal") {
      return textResponse("Meta no aceptó la salida.", 422);
    }
    console.error("[crm-lily-send] Meta rechazó la salida pero el estado final no coincide con su clasificación.");
    return textResponse("No se pudo finalizar la salida CRM.", 503);
  }

  const finalizacion = await finalizarSalida(
    admin,
    solicitud,
    payloadHash,
    true,
    meta.metaMessageId,
    null,
  );
  if (finalizacion.error || !finalizacion.data || finalizacion.data.estado !== "aceptada_meta") {
    // El proveedor ya aceptó el mensaje. No reintentar a ciegas; el outbox se
    // conserva en enviando para que una conciliación lo cierre de forma segura.
    console.error("[crm-lily-send] Meta aceptó la salida pero no se pudo finalizar el outbox.");
    return jsonResponse({ estado: "en_proceso", idempotency_key: solicitud.idempotencyKey }, 202);
  }

  return jsonResponse({ estado: "aceptada_por_meta", idempotency_key: solicitud.idempotencyKey }, 200);
});
