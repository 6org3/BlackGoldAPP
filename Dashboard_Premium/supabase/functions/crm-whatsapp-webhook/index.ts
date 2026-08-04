// crm-whatsapp-webhook
//
// Entrada privada para la WhatsApp Cloud API de Meta. Esta función no responde
// a usuarios ni almacena transcripts: valida la entrega, correlaciona el canal
// mediante la RPC CRM y reenvía el contenido en tránsito a la pasarela privada
// de Lily, firmada y con un ID idempotente. El número nunca se devuelve ni se
// registra en logs. La salida de mensajes sigue fuera de esta función.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  allowlistInternaDesdeJson,
  contenidoParaLily,
  esSolicitudNoContactar,
  equalConstante,
  firmaMetaValida,
  hmacSha256Hex,
  interesProbable,
  leerMensajes,
  normalizarWhatsApp,
  rolInternoParaIdentificador,
  textoSeguro,
} from "../_shared/crmWhatsappProtocol.mjs";

const MAX_BODY_BYTES = 256 * 1024;

type RutaCrm = {
  contact_id: string;
  oportunidad_id?: string | null;
  ruta: "interno" | "lead" | "cliente" | "no_contactar";
  tipo_relacion: "interno" | "lead" | "cliente" | "no_contactar";
  etapa_codigo?: string | null;
  nombre_preferido?: string | null;
  rol_interno?: "jorge" | "padre" | "hermano" | null;
  ya_procesado?: boolean;
  debe_responder: boolean;
};

const textResponse = (body: string, status = 200) => new Response(body, {
  status,
  headers: { "Content-Type": "text/plain; charset=utf-8" },
});

function secretRoleKey(): string | null {
  // Supabase está migrando de service_role a secret keys. Soporta ambos sin
  // asumir cuál tiene configurado el proyecto, y jamás envía ninguno al cliente.
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys) as Record<string, unknown>;
      if (typeof parsed.default === "string" && parsed.default) return parsed.default;
    } catch {
      console.error("[crm-whatsapp-webhook] SUPABASE_SECRET_KEYS no tiene formato válido.");
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null;
}


function ingressConfig(): { url: URL; secret: string } | null {
  const rawUrl = Deno.env.get("LILY_INGRESS_URL");
  const secret = Deno.env.get("LILY_INGRESS_SECRET");
  const allowedHost = Deno.env.get("LILY_INGRESS_ALLOWED_HOST");
  if (!rawUrl && !secret && !allowedHost) return null;
  if (!rawUrl || !secret || !allowedHost) throw new Error("La configuración de la pasarela de Lily está incompleta.");

  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.hostname !== allowedHost) {
    throw new Error("La URL de la pasarela de Lily no cumple la política de destino.");
  }
  return { url, secret };
}

function allowlistInternaConfig(): Map<string, string> {
  const allowlist = allowlistInternaDesdeJson(Deno.env.get("CRM_INTERNAL_WHATSAPP_ALLOWLIST"));
  if (!allowlist) throw new Error("La allowlist interna no tiene el formato esperado.");
  return allowlist;
}

async function entregarALily(
  config: { url: URL; secret: string },
  event: {
    messageId: string;
    contactId: string;
    opportunityId: string | null;
    route: RutaCrm["ruta"];
    relationType: RutaCrm["tipo_relacion"];
    stage: string | null;
    displayName: string | null;
    messageType: string;
    content: string;
    receivedAt: string | null;
  },
): Promise<void> {
  const body = JSON.stringify({
    schema_version: "blackgold.crm.inbound.v1",
    event_id: event.messageId,
    channel: "whatsapp",
    contact_id: event.contactId,
    oportunidad_id: event.opportunityId,
    route: event.route,
    tipo_relacion: event.relationType,
    etapa_codigo: event.stage,
    nombre_preferido: event.displayName,
    mensaje: { tipo: event.messageType, contenido: event.content },
    recibido_at: event.receivedAt,
  });
  const signature = await hmacSha256Hex(config.secret, body);
  const response = await fetch(config.url, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: {
      "Content-Type": "application/json",
      "X-BlackGold-Event-Id": event.messageId,
      "X-BlackGold-Signature-256": `sha256=${signature}`,
    },
    body,
  });
  if (!response.ok) throw new Error(`La pasarela de Lily respondió ${response.status}.`);
}

Deno.serve(async (req) => {
  const verifyToken = Deno.env.get("META_WHATSAPP_VERIFY_TOKEN");
  if (!verifyToken) return textResponse("Configuración de webhook incompleta.", 503);

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token") ?? "";
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && challenge && equalConstante(token, verifyToken)) {
      return textResponse(challenge);
    }
    return textResponse("No autorizado.", 403);
  }

  if (req.method !== "POST") return textResponse("Método no permitido.", 405);

  const appSecret = Deno.env.get("META_WHATSAPP_APP_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = secretRoleKey();
  if (!appSecret || !supabaseUrl || !serviceRoleKey) {
    return textResponse("Configuración de webhook incompleta.", 503);
  }

  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return textResponse("Carga demasiado grande.", 413);
  }
  const rawBody = new Uint8Array(await req.arrayBuffer());
  if (rawBody.byteLength > MAX_BODY_BYTES) return textResponse("Carga demasiado grande.", 413);
  if (!await firmaMetaValida(rawBody, req.headers.get("x-hub-signature-256"), appSecret)) {
    console.warn("[crm-whatsapp-webhook] firma Meta rechazada.");
    return textResponse("No autorizado.", 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return textResponse("JSON inválido.", 400);
  }

  let ingress: { url: URL; secret: string } | null;
  let allowlistInterna: Map<string, string> | null = null;
  try {
    ingress = ingressConfig();
    allowlistInterna = allowlistInternaConfig();
  } catch (error) {
    console.error("[crm-whatsapp-webhook] configuración de ingreso inválida:", error instanceof Error ? error.message : "error desconocido");
    return textResponse("Configuración CRM incompleta.", 503);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const club = Deno.env.get("BLACK_GOLD_CLUB")?.trim() || "Black Gold";
  let necesitaReintento = false;

  for (const { message, profileName } of leerMensajes(payload)) {
    const identificador = normalizarWhatsApp(message.from);
    const messageId = textoSeguro(message.id, 180);
    if (!identificador || !messageId) {
      console.warn("[crm-whatsapp-webhook] mensaje omitido por identificador inválido.");
      continue;
    }

    const contenido = contenidoParaLily(message);
    const rolInterno = rolInternoParaIdentificador(allowlistInterna, identificador);
    const { data, error } = rolInterno
      ? await supabase.rpc("crm_recibir_contacto_interno_canal", {
        p_club: club,
        p_canal: "whatsapp",
        p_identificador_normalizado: identificador,
        p_nombre_preferido: profileName,
        p_interes_principal: interesProbable(contenido.contenido),
        p_mensaje_externo_ref: messageId,
        p_rol_interno: rolInterno,
      })
      : await supabase.rpc("crm_recibir_contacto_canal", {
        p_club: club,
        p_canal: "whatsapp",
        p_identificador_normalizado: identificador,
        p_nombre_preferido: profileName,
        p_interes_principal: interesProbable(contenido.contenido),
        p_mensaje_externo_ref: messageId,
        p_app_usuario_id: null,
      });
    if (error || !data) {
      console.error("[crm-whatsapp-webhook] no se pudo registrar una entrada CRM:", error?.message ?? "respuesta vacía");
      necesitaReintento = true;
      continue;
    }

    const ruta = data as RutaCrm;
    if (
      (ruta.ruta === "lead" || ruta.ruta === "cliente")
      && esSolicitudNoContactar(contenido.contenido)
    ) {
      try {
        const { error: noContactarError } = await supabase.rpc("crm_marcar_no_contactar", {
          p_contact_id: ruta.contact_id,
          p_motivo: "Solicitud explícita recibida por WhatsApp.",
          p_actor: "adaptador",
        });
        if (noContactarError) throw new Error(noContactarError.message);
      } catch (error) {
        console.error("[crm-whatsapp-webhook] no se pudo aplicar la solicitud de no contactar:", error instanceof Error ? error.message : "error desconocido");
        necesitaReintento = true;
      }
      continue;
    }

    if (!ruta.debe_responder || ruta.ruta === "no_contactar") continue;
    if (!ingress) {
      // No confirmar a Meta una entrega que no llegó a Lily: Meta reintentará y
      // la RPC es idempotente por message ID, por lo que no duplica el CRM.
      console.error("[crm-whatsapp-webhook] falta LILY_INGRESS_URL para una conversación enrutable.");
      necesitaReintento = true;
      continue;
    }

    try {
      await entregarALily(ingress, {
        messageId,
        contactId: ruta.contact_id,
        opportunityId: ruta.oportunidad_id ?? null,
        route: ruta.ruta,
        relationType: ruta.tipo_relacion,
        stage: ruta.etapa_codigo ?? null,
        displayName: ruta.nombre_preferido ?? profileName,
        messageType: contenido.tipo,
        content: contenido.contenido,
        receivedAt: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : null,
      });
      const { error: confirmacionError } = await supabase.rpc("crm_confirmar_entrega_lily", {
        p_canal: "whatsapp",
        p_mensaje_externo_ref: messageId,
        p_actor: "adaptador",
      });
      if (confirmacionError) throw new Error(confirmacionError.message);
    } catch (error) {
      console.error("[crm-whatsapp-webhook] no se pudo entregar a Lily:", error instanceof Error ? error.message : "error desconocido");
      necesitaReintento = true;
    }
  }

  return necesitaReintento
    ? textResponse("Entrega pendiente.", 503)
    : textResponse("EVENT_RECEIVED", 200);
});
