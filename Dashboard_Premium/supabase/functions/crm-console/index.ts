// crm-console
//
// BFF privado del panel CRM. El navegador nunca lee las tablas CRM ni sus
// identificadores de canal directamente: llega con JWT, se valida el perfil
// activo, el rol y el club, y sólo se devuelve el contexto operativo que
// necesita Dirección. Las mutaciones usan las RPC auditadas del CRM.

import { withSupabase } from "@supabase/server";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_BODY_BYTES = 16 * 1024;
const ROLES_CRM = new Set(["owner", "superadmin"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ETAPAS = new Set([
  "nuevo",
  "interes_identificado",
  "calificado",
  "prueba_o_visita",
  "inscripcion_en_proceso",
  "ganado",
  "perdido",
]);
const CANALES = new Set(["whatsapp", "web_chat", "app", "manual"]);
const TIPOS_ACTIVIDAD = new Set(["seguimiento", "llamada", "prueba_o_visita", "documentacion", "otro"]);
const INTENCIONES = new Set(["informacion_general", "clases", "horarios", "inscripcion", "prueba", "soporte", "seguimiento", "otro"]);

type JsonObject = Record<string, unknown>;
type AdminClient = SupabaseClient;
type Caller = {
  id: string;
  rol: string;
  club: string | null;
  estado: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function error(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

function record(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function text(value: unknown, max: number, required = false): string | null {
  if (value === undefined || value === null) return required ? null : null;
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if ((required && !clean) || clean.length > max) return null;
  return clean || null;
}

function uuid(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

function nonNegativeInteger(value: unknown, maximum: number): number | null {
  if (value === undefined) return 0;
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= maximum
    ? value
    : null;
}

function actorFor(caller: Caller): string {
  // UUID + prefijo sigue bajo el límite de 64 caracteres de crm_auditoria.
  return `crm_web_${caller.id}`;
}

function clubFor(caller: Caller, body: JsonObject): string | Response {
  const requested = text(body.club, 120);
  if (body.club !== undefined && requested === null) return error("El club solicitado no es válido.");

  if (caller.rol === "superadmin") {
    return requested ?? caller.club ?? "Black Gold";
  }
  if (!caller.club) return error("Tu perfil no tiene un club operativo asignado.", 403);
  if (requested && requested !== caller.club) return error("No puedes operar contactos de otro club.", 403);
  return caller.club;
}

async function readBody(req: Request): Promise<{ body?: JsonObject; response?: Response }> {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    return { response: error("La solicitud es demasiado grande.", 413) };
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return { response: error("La solicitud es demasiado grande.", 413) };
  try {
    const body = record(JSON.parse(raw));
    return body ? { body } : { response: error("El cuerpo debe ser un objeto JSON.") };
  } catch {
    return { response: error("El cuerpo debe ser JSON válido.") };
  }
}

async function contactoEnClub(admin: AdminClient, club: string, contactId: string) {
  const { data, error: dbError } = await admin
    .from("crm_contactos")
    .select("id, club, tipo_relacion, rol_interno, estado, nombre_preferido, origen_inicial, created_at, updated_at")
    .eq("id", contactId)
    .eq("club", club)
    .maybeSingle();
  if (dbError) throw new Error("No se pudo verificar el contacto CRM.");
  return data;
}

async function overview(admin: AdminClient, club: string, body: JsonObject): Promise<Response> {
  const offset = nonNegativeInteger(body.offset, 1000000);
  if (offset === null) return error("El desplazamiento de contactos no es válido.");

  const { data, error: dbError } = await admin.rpc("crm_resumen_operativo", {
    p_club: club,
    p_limite: 50,
    p_offset: offset,
  });
  const summary = record(data);
  if (dbError || !summary) throw new Error("No se pudo cargar el resumen CRM.");

  return jsonResponse({ ...summary, generado_en: new Date().toISOString() }, 200);
}

async function detail(
  admin: AdminClient,
  club: string,
  contactId: string,
): Promise<Response> {
  const contact = await contactoEnClub(admin, club, contactId);
  if (!contact) return error("No se encontró el contacto en tu club.", 404);

  const [preferencesResult, opportunitiesResult, activitiesResult, interactionsResult, consentsResult] = await Promise.all([
    admin.from("crm_preferencias").select("tratamiento_preferido, canal_preferido, franja_preferida, estilo_mensaje_preferido, updated_at").eq("contact_id", contactId).maybeSingle(),
    admin.from("crm_oportunidades").select("id, etapa_codigo, origen, interes_principal, proximo_paso_en, etapa_actualizada_at, cerrada_at, created_at").eq("contact_id", contactId).order("created_at", { ascending: false }).limit(20),
    admin.from("crm_actividades").select("id, oportunidad_id, tipo, asunto, vencimiento_at, estado, asignado_a, completada_at, created_at").eq("contact_id", contactId).order("vencimiento_at", { ascending: true }).limit(50),
    admin.from("crm_interacciones").select("id, oportunidad_id, canal, sentido, intencion, resumen_operativo, created_at").eq("contact_id", contactId).order("created_at", { ascending: false }).limit(50),
    // No se devuelve evidencia_ref: puede apuntar a un recurso externo y no
    // hace falta para que Dirección conozca el estado del consentimiento.
    admin.from("crm_consentimientos").select("id, alcance, estado, version_politica, registrado_at").eq("contact_id", contactId).order("registrado_at", { ascending: false }).limit(10),
  ]);
  if (preferencesResult.error || opportunitiesResult.error || activitiesResult.error || interactionsResult.error || consentsResult.error) {
    throw new Error("No se pudo cargar el contexto del contacto.");
  }

  return jsonResponse({
    contact,
    preferencias: preferencesResult.data ?? null,
    oportunidades: opportunitiesResult.data ?? [],
    actividades: activitiesResult.data ?? [],
    interacciones: interactionsResult.data ?? [],
    consentimientos: consentsResult.data ?? [],
  }, 200);
}

async function mutate(
  admin: AdminClient,
  caller: Caller,
  club: string,
  action: string,
  body: JsonObject,
): Promise<Response> {
  const contactId = uuid(body.contact_id);
  if (!contactId) return error("Falta un identificador de contacto válido.");
  const contact = await contactoEnClub(admin, club, contactId);
  if (!contact) return error("No se encontró el contacto en tu club.", 404);
  const actor = actorFor(caller);

  if (action === "configurar_contacto_interno") {
    if (contact.tipo_relacion === "no_contactar") {
      return error("Un contacto con no contactar no puede reclasificarse sin una revisión de privacidad.", 409);
    }
    const { data, error: dbError } = await admin.rpc("crm_configurar_contacto_interno", {
      p_contact_id: contactId,
      p_actor: actor,
    });
    if (dbError || !data) throw new Error("No se pudo configurar el contacto interno.");
    return jsonResponse({ resultado: data }, 200);
  }

  if (action === "actualizar_etapa") {
    const opportunityId = uuid(body.oportunidad_id);
    const stage = text(body.etapa_codigo, 80, true);
    const reason = text(body.motivo, 500);
    const nextStep = text(body.proximo_paso_en, 80);
    if (!opportunityId || !stage || !ETAPAS.has(stage)) return error("La oportunidad o la etapa no son válidas.");
    if (body.motivo !== undefined && reason === null) return error("El motivo no es válido.");
    if (body.proximo_paso_en !== undefined && (!nextStep || Number.isNaN(Date.parse(nextStep)))) {
      return error("La fecha del próximo paso no es válida.");
    }
    const { data: opportunity, error: opportunityError } = await admin
      .from("crm_oportunidades")
      .select("id")
      .eq("id", opportunityId)
      .eq("contact_id", contactId)
      .eq("club", club)
      .maybeSingle();
    if (opportunityError) throw new Error("No se pudo verificar la oportunidad.");
    if (!opportunity) return error("La oportunidad no pertenece al contacto.", 403);
    const { data, error: dbError } = await admin.rpc("crm_actualizar_etapa_oportunidad", {
      p_oportunidad_id: opportunityId,
      p_etapa_codigo: stage,
      p_actor: actor,
      p_motivo: reason,
      p_proximo_paso_en: nextStep ? new Date(nextStep).toISOString() : null,
    });
    if (dbError || !data) throw new Error("No se pudo actualizar la etapa.");
    return jsonResponse({ resultado: data }, 200);
  }

  if (action === "actualizar_preferencias") {
    const tratamiento = text(body.tratamiento_preferido, 80);
    const canal = text(body.canal_preferido, 40);
    const franja = text(body.franja_preferida, 120);
    const estilo = text(body.estilo_mensaje_preferido, 120);
    const notes = text(body.notas_operativas, 1000);
    if (![tratamiento, canal, franja, estilo, notes].some((value) => value !== null)) {
      return error("Indica al menos una preferencia para actualizar.");
    }
    if (body.canal_preferido !== undefined && (!canal || !CANALES.has(canal))) return error("El canal preferido no es válido.");
    const { data, error: dbError } = await admin.rpc("crm_actualizar_preferencias", {
      p_contact_id: contactId,
      p_tratamiento_preferido: tratamiento,
      p_canal_preferido: canal,
      p_franja_preferida: franja,
      p_estilo_mensaje_preferido: estilo,
      p_notas_operativas: notes,
      p_actor: actor,
    });
    if (dbError || !data) throw new Error("No se pudieron actualizar las preferencias.");
    return jsonResponse({ resultado: data }, 200);
  }

  if (action === "programar_actividad") {
    const opportunityId = body.oportunidad_id === null || body.oportunidad_id === undefined ? null : uuid(body.oportunidad_id);
    const type = text(body.tipo, 50, true);
    const subject = text(body.asunto, 240, true);
    const dueAt = text(body.vencimiento_at, 80, true);
    const assignee = text(body.asignado_a, 64, true);
    if (!type || !TIPOS_ACTIVIDAD.has(type) || !subject || !dueAt || Number.isNaN(Date.parse(dueAt)) || !assignee || !/^[a-z0-9_-]{2,64}$/.test(assignee)) {
      return error("Los datos de la actividad no son válidos.");
    }
    if (body.oportunidad_id !== null && body.oportunidad_id !== undefined && !opportunityId) return error("La oportunidad no es válida.");
    const { data, error: dbError } = await admin.rpc("crm_programar_actividad", {
      p_contact_id: contactId,
      p_oportunidad_id: opportunityId,
      p_tipo: type,
      p_asunto: subject,
      p_vencimiento_at: new Date(dueAt).toISOString(),
      p_asignado_a: assignee,
      p_actor: actor,
    });
    if (dbError || !data) throw new Error("No se pudo programar la actividad.");
    return jsonResponse({ resultado: data }, 200);
  }

  if (action === "marcar_no_contactar") {
    const reason = text(body.motivo, 500, true);
    if (!reason) return error("Indica el motivo para no contactar.");
    const { data, error: dbError } = await admin.rpc("crm_marcar_no_contactar", {
      p_contact_id: contactId,
      p_motivo: reason,
      p_actor: actor,
    });
    if (dbError || !data) throw new Error("No se pudo registrar la preferencia de no contacto.");
    return jsonResponse({ resultado: data }, 200);
  }

  if (action === "registrar_nota") {
    const opportunityId = body.oportunidad_id === null || body.oportunidad_id === undefined ? null : uuid(body.oportunidad_id);
    const channel = text(body.canal, 40, true);
    const intention = text(body.intencion, 50);
    const summary = text(body.resumen_operativo, 1000, true);
    if (!channel || !CANALES.has(channel) || !summary || (intention && !INTENCIONES.has(intention))) {
      return error("La nota operativa no es válida.");
    }
    if (body.oportunidad_id !== null && body.oportunidad_id !== undefined && !opportunityId) return error("La oportunidad no es válida.");
    const { data, error: dbError } = await admin.rpc("crm_registrar_interaccion", {
      p_contact_id: contactId,
      p_oportunidad_id: opportunityId,
      p_canal: channel,
      p_sentido: "nota_interna",
      p_intencion: intention,
      p_resumen_operativo: summary,
      p_actor: actor,
    });
    if (dbError || !data) throw new Error("No se pudo guardar la nota operativa.");
    return jsonResponse({ resultado: data }, 200);
  }

  return error("Acción CRM no reconocida.", 404);
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return error("Método no permitido.", 405);
    if (!ctx.userClaims?.id) return error("Sesión inválida o expirada.", 401);

    const { data: profile, error: profileError } = await ctx.supabaseAdmin
      .from("usuarios")
      .select("id, rol, club, estado")
      .eq("auth_user_id", ctx.userClaims.id)
      .maybeSingle();
    if (profileError || !profile) return error("Usuario sin perfil en el club.", 403);

    const caller = profile as Caller;
    if (caller.estado && caller.estado !== "activo") {
      return error("Tu cuenta no está activa en el club.", 403);
    }
    if (!ROLES_CRM.has(caller.rol)) return error("Tu rol no puede acceder al CRM.", 403);

    const parsed = await readBody(req);
    if (parsed.response) return parsed.response;
    const body = parsed.body!;
    const club = clubFor(caller, body);
    if (club instanceof Response) return club;

    const action = text(body.accion, 80, true);
    if (!action) return error("Falta la acción CRM.");

    try {
      if (action === "resumen") return await overview(ctx.supabaseAdmin, club, body);
      if (action === "detalle_contacto") {
        const contactId = uuid(body.contact_id);
        return contactId ? await detail(ctx.supabaseAdmin, club, contactId) : error("Falta un identificador de contacto válido.");
      }
      return await mutate(ctx.supabaseAdmin, caller, club, action, body);
    } catch (caught) {
      console.error("[crm-console] error controlado", {
        action,
        message: caught instanceof Error ? caught.message : "error desconocido",
      });
      return error("No pudimos completar la operación CRM. Intenta de nuevo.", 500);
    }
  }),
};
