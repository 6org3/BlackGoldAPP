import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import {
  cargarCredencialesPrivadas,
  esSolicitudNoContactar,
  interesProbable,
  normalizarWhatsApp,
  referenciaEventoWhatsApp,
} from "./src/protocol.js";

const pendientesPorSesion = new Map();
const TTL_PENDIENTE_MS = 5 * 60 * 1_000;

function claveDeTurno(evento, ctx = {}) {
  // runId es único por turno; sessionKey sólo es fallback porque puede tener
  // mensajes concurrentes dentro de la misma conversación.
  const valor = evento?.runId ?? ctx.runId ?? evento?.sessionKey ?? ctx.sessionKey ?? evento?.messageId ?? ctx.messageId;
  return typeof valor === "string" && valor.length > 0 ? valor : null;
}

function configuracion(raw = {}) {
  return {
    enabled: raw.enabled === true,
    club: typeof raw.club === "string" && raw.club.trim() ? raw.club.trim() : "Black Gold",
    lilyAgentId: typeof raw.lilyAgentId === "string" && raw.lilyAgentId.trim() ? raw.lilyAgentId.trim() : "lilith",
    directionAgentId: typeof raw.directionAgentId === "string" && raw.directionAgentId.trim() ? raw.directionAgentId.trim() : "main",
    whatsappAccountId: typeof raw.whatsappAccountId === "string" && raw.whatsappAccountId.trim()
      ? raw.whatsappAccountId.trim()
      : "direccion",
    credentialsFile: typeof raw.credentialsFile === "string" ? raw.credentialsFile.trim() : "",
  };
}

function agenteDestino(evento, ctx, config) {
  if (evento?.channel !== "whatsapp" || evento?.accountId !== config.whatsappAccountId) return null;
  const agentId = ctx?.agentId;
  if (agentId === config.lilyAgentId) return "lily";
  if (agentId === config.directionAgentId) return "direccion";
  return null;
}

function contenidoRecibido(evento) {
  const contenido = evento?.content ?? evento?.body ?? evento?.text;
  if (typeof contenido !== "string") return "";
  return contenido.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 4_096);
}

function registrarDiagnostico(codigo) {
  // No registrar texto, números, tokens ni IDs: el log es sólo operativo.
  console.warn(`[blackgold-crm-bridge] ${codigo}`);
}

async function llamarRpc(credenciales, funcion, parametros) {
  const respuesta = await fetch(`${credenciales.supabaseUrl}/rest/v1/rpc/${funcion}`, {
    method: "POST",
    headers: {
      apikey: credenciales.serviceRoleKey,
      Authorization: `Bearer ${credenciales.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parametros),
    signal: AbortSignal.timeout(8_000),
  });
  if (!respuesta.ok) throw new Error(`rpc_${funcion}_failed`);
  return respuesta.json();
}

async function registrarEntrada(evento, ctx, config, destino) {
  const identificador = normalizarWhatsApp(evento?.senderId ?? ctx?.senderId);
  const messageId = evento?.messageId ?? ctx?.messageId;
  const clave = claveDeTurno(evento, ctx);
  if (!identificador || typeof messageId !== "string" || !clave) {
    registrarDiagnostico("incoming_event_missing_safe_identity");
    return;
  }

  let credenciales;
  try {
    credenciales = cargarCredencialesPrivadas(config.credentialsFile);
  } catch (error) {
    registrarDiagnostico(error instanceof Error ? error.message : "credentials_unavailable");
    return;
  }

  const contenido = contenidoRecibido(evento);
  const rolInterno = credenciales.allowlistInterna.get(identificador) ?? null;
  if (destino === "direccion" && !rolInterno) {
    // El grupo de Dirección es sólo organizacional: no convertir un remitente
    // no verificado en lead ni darle contexto interno por accidente.
    registrarDiagnostico("direction_sender_not_in_internal_allowlist");
    return;
  }
  const referencia = referenciaEventoWhatsApp(config.whatsappAccountId, messageId);
  let ruta;
  try {
    ruta = await llamarRpc(
      credenciales,
      rolInterno ? "crm_recibir_contacto_interno_canal" : "crm_recibir_contacto_canal",
      rolInterno
        ? {
            p_club: config.club,
            p_canal: "whatsapp",
            p_identificador_normalizado: identificador,
            p_nombre_preferido: null,
            p_interes_principal: interesProbable(contenido),
            p_mensaje_externo_ref: referencia,
            p_rol_interno: rolInterno,
          }
        : {
            p_club: config.club,
            p_canal: "whatsapp",
            p_identificador_normalizado: identificador,
            p_nombre_preferido: null,
            p_interes_principal: interesProbable(contenido),
            p_mensaje_externo_ref: referencia,
            p_app_usuario_id: null,
          },
    );

    if (ruta?.contact_id && (ruta.ruta === "lead" || ruta.ruta === "cliente") && esSolicitudNoContactar(contenido)) {
      await llamarRpc(credenciales, "crm_marcar_no_contactar", {
        p_contact_id: ruta.contact_id,
        p_motivo: "Solicitud explícita recibida por WhatsApp.",
        p_actor: "adaptador",
      });
      ruta = { ...ruta, ruta: "no_contactar", tipo_relacion: "no_contactar", debe_responder: false };
    }
  } catch {
    registrarDiagnostico("crm_inbound_registration_failed");
    return;
  }

  if (!ruta?.contact_id || typeof ruta.ruta !== "string") {
    registrarDiagnostico("crm_inbound_invalid_response");
    return;
  }
  pendientesPorSesion.set(clave, {
    ruta,
    referencia,
    credenciales,
    destino,
    agentId: ctx?.agentId,
    venceAt: Date.now() + TTL_PENDIENTE_MS,
  });
}

async function confirmarEntrega(pendiente) {
  await llamarRpc(pendiente.credenciales, "crm_confirmar_entrega_lily", {
    p_canal: "whatsapp",
    p_mensaje_externo_ref: pendiente.referencia,
    p_actor: "adaptador",
  });
}

function contextoCrmParaAgente(ruta, destino) {
  const lineas = [
    "Contexto CRM privado para este mensaje (no reveles estos identificadores):",
    `- contact_id: ${ruta.contact_id}`,
    `- oportunidad_id: ${ruta.oportunidad_id ?? "ninguna"}`,
    `- ruta: ${ruta.ruta}`,
    `- relación: ${ruta.tipo_relacion ?? "desconocida"}`,
  ];
  if (ruta.etapa_codigo) lineas.push(`- etapa: ${ruta.etapa_codigo}`);
  if (ruta.rol_interno) lineas.push(`- rol interno verificado: ${ruta.rol_interno}`);
  if (ruta.ruta === "no_contactar") {
    lineas.push("No envíes seguimiento comercial ni uses este contacto como lead. Si es una solicitud de baja, no respondas salvo una confirmación mínima que sea obligatoria.");
  } else if (ruta.ruta === "interno") {
    lineas.push(destino === "direccion"
      ? "Es personal interno verificado. Atiende su solicitud dentro de Dirección y su rol; no lo trates como lead ni solicites datos comerciales."
      : "Es personal interno verificado; no lo trates como lead, no solicites datos comerciales y limita la respuesta a su rol y al contexto organizacional.");
  } else {
    lineas.push("Usa las herramientas CRM sólo con estos UUIDs. No pidas ni inventes teléfonos, correos o datos de menores.");
  }
  return lineas.join("\n");
}

export default definePluginEntry({
  id: "blackgold-crm-bridge",
  name: "Black Gold CRM Bridge",
  description: "Ingreso privado WhatsApp a CRM y contexto mínimo para Lily.",
  register(api) {
    // OpenClaw entrega la configuración al registro del plugin, no dentro de
    // cada evento. Mantenerla cerrada aquí evita depender de campos no
    // documentados en los hooks y obliga a recargar para cualquier cambio.
    const config = configuracion(api.pluginConfig);

    api.on("inbound_claim", async (evento, ctx) => {
      const destino = agenteDestino(evento, ctx, config);
      if (!config.enabled || !destino) return;
      await registrarEntrada(evento, ctx, config, destino);
    }, { priority: 80, timeoutMs: 10_000 });

    api.on("before_prompt_build", async (evento, ctx) => {
      if (!config.enabled) return;
      const clave = claveDeTurno(evento, ctx);
      const pendiente = clave ? pendientesPorSesion.get(clave) : null;
      if (!pendiente) return;
      pendientesPorSesion.delete(clave);
      if (pendiente.venceAt < Date.now()) return;
      if (ctx?.agentId !== pendiente.agentId) return;
      try {
        await confirmarEntrega(pendiente);
      } catch {
        // No se pierde el ingreso CRM: su idempotencia permite un reintento del proveedor.
        registrarDiagnostico("crm_lily_delivery_confirmation_failed");
      }
      return { appendSystemContext: contextoCrmParaAgente(pendiente.ruta, pendiente.destino) };
    }, { priority: 80, timeoutMs: 10_000 });
  },
});
