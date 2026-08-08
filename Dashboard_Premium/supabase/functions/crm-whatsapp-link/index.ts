import "@supabase/functions-js/edge-runtime.d.ts";
import { autenticar, jsonResponse } from "../_shared/brainAuth.ts";

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const EXPIRACION_MINUTOS = 15;

function codigoSeguro(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return `BGV-${Array.from(bytes, (byte) => ALFABETO[byte % ALFABETO.length]).join("")}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// La app autenticada obtiene un código breve. El código en claro sólo viaja a
// la sesión que lo solicitó; la base guarda exclusivamente su hash.
Deno.serve(async (req) => {
  const auth = await autenticar(req);
  if (auth.error) return auth.error;
  const { caller, admin } = auth;
  if (!caller || !admin || !caller.club) return jsonResponse({ error: "No se pudo identificar tu club." }, 403);
  if (!['padre', 'atleta'].includes(caller.rol)) return jsonResponse({ error: "Tu perfil no puede vincular este canal." }, 403);

  const code = codigoSeguro();
  const expiresAt = new Date(Date.now() + EXPIRACION_MINUTOS * 60_000).toISOString();
  const tokenHash = await sha256Hex(`blackgold.app-link.v1:${code}`);
  const { error } = await admin.rpc("crm_emitir_enlace_app_whatsapp", {
    p_app_usuario_id: caller.id,
    p_token_hash: tokenHash,
    p_expira_at: expiresAt,
    p_actor: `app_link_${caller.id}`,
  });
  if (error) {
    console.error("[crm-whatsapp-link] no se pudo emitir enlace.");
    return jsonResponse({ error: "No pudimos crear el vínculo ahora mismo. Inténtalo otra vez." }, 503);
  }

  return jsonResponse({
    code,
    expires_at: expiresAt,
    whatsapp_message: `VINCULAR ${code}`,
    instructions: "Abre el WhatsApp oficial del club y envía este mensaje sin modificarlo.",
  }, 201);
});
