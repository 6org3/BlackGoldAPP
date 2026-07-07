// Edge Function: registro-publico — registro público completo server-side.
//
// Motivo (descubierto por scripts/validar_rls_por_rol.js, 2026-07-07):
// GoTrue RECHAZA los emails sintéticos (cedula@sinacceso...internal) en el
// signUp PÚBLICO — valida el dominio — pero sí los acepta vía
// auth.admin.createUser. Como la mayoría de atletas no tiene correo real,
// el registro desde el navegador no puede crear la cuenta de Auth: se hace
// aquí con service_role, igual que hizo la migración de los 819 usuarios.
//
// Flujo: valida el payload → rpc registrar_publico() (transacción de filas
// con roles forzados a atleta/padre; v24) → admin.createUser del atleta (y
// del padre si es nuevo) — el trigger trg_vincular_auth_usuario (v24)
// vincula usuarios.auth_user_id automáticamente al crearse cada cuenta.
// Bonus sobre el flujo viejo: el navegador del registrante ya no queda
// logueado como el último signUp.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

// Misma regla que resolver_email_login() (v19) y el trigger de v24.
const emailParaAuth = (correo: string | null | undefined, cedula: string) =>
  (correo || `${cedula}@sinacceso.blackgoldapp.internal`).toLowerCase();

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido' }, 405);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: { atleta?: Record<string, string | null>; padre?: Record<string, string | null> | null };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Cuerpo JSON inválido.' }, 400);
  }

  const atleta = body?.atleta;
  const padre = body?.padre ?? null;
  if (!atleta?.cedula || !atleta?.nombre || !atleta?.fecha_nacimiento) {
    return jsonResponse({ error: 'Cédula, nombre y fecha de nacimiento del atleta son obligatorios.' }, 400);
  }

  // 1. Filas de usuarios/atletas/padres_atletas en una sola transacción.
  //    La RPC fuerza rol atleta/padre server-side y trae los mensajes
  //    amigables de duplicados (cédula ya registrada, teléfono repetido).
  const { data: reg, error: eReg } = await supabase.rpc('registrar_publico', {
    p_atleta: atleta,
    p_padre: padre,
  });
  if (eReg) return jsonResponse({ error: eReg.message }, 400);

  // 2. Cuenta de acceso del atleta (password inicial = su cédula, como el
  //    login histórico). El trigger de v24 vincula auth_user_id.
  const { error: eAuthAtleta } = await supabase.auth.admin.createUser({
    email: emailParaAuth(atleta.correo, atleta.cedula),
    password: atleta.cedula,
    email_confirm: true,
  });
  if (eAuthAtleta) {
    return jsonResponse({
      error: 'El perfil se creó pero no se pudo generar la cuenta de acceso: ' + eAuthAtleta.message,
      atleta_id: reg?.atleta_id ?? null,
    }, 500);
  }

  // 3. Cuenta del representante solo si la RPC lo creó en esta llamada
  //    (si ya existía conserva su cuenta y contraseña). Password inicial:
  //    la cédula de este hijo. Best-effort: no bloquea el registro.
  if (reg?.padre_id && !reg?.padre_existente && reg?.padre_cedula) {
    const { error: eAuthPadre } = await supabase.auth.admin.createUser({
      email: emailParaAuth(padre?.correo, reg.padre_cedula),
      password: atleta.cedula,
      email_confirm: true,
    });
    if (eAuthPadre) console.error('Cuenta del representante no creada:', eAuthPadre.message);
  }

  return jsonResponse({ success: true, atleta_id: reg?.atleta_id ?? null }, 200);
});
