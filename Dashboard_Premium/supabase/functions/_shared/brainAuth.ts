// _shared/brainAuth.ts — autenticación y alcance por rol/club del cerebro.
//
// Extraído de brain-gateway para que todas las Edge Functions del cerebro
// (brain-gateway, copiloto) compartan los mismos invariantes de seguridad
// (blueprint §3.7 y §4):
// 1. El navegador NUNCA ve service_role: llega con el JWT del usuario
//    (Authorization: Bearer) y las funciones leen los datos server-side.
// 2. Alcance por rol Y por club ANTES de tocar datos: superadmin cruza clubes
//    (acceso auditado en logs), owner solo su club, coach su club+categoría,
//    atleta solo él mismo, padre solo sus hijos (padres_atletas).
//
// _shared/*.ts es válido: las funciones lo importan por ruta relativa dentro
// de supabase/functions/ y el deploy lo empaqueta con cada función.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

// Fallo TRANSITORIO de validación de JWT en el endpoint de Auth. Durante (y un
// tiempo después de) habilitar las asymmetric JWT signing keys del proyecto,
// algunas instancias de GoTrue rechazan intermitentemente el token con
// "unrecognized JWT kid <nil> for algorithm ES256" / "token is unverifiable",
// aunque el JWKS del proyecto ya sea ES256-only. Es del lado servidor y por
// instancia (a veces atiende una con el JWKS ya propagado, a veces no): NO es un
// bug de estas funciones — la misma llamada acierta la mayoría de las veces.
export const esErrorJwtTransitorio = (msg?: string | null): boolean =>
  !!msg && /unrecognized JWT kid|token is unverifiable|invalid JWT/i.test(msg);

// Reintenta una operación de Auth ante ESE fallo transitorio (hasta `intentos`
// veces, con backoff corto). Solo para operaciones cuyo rechazo por este error
// no deja efecto: ocurre en la fase de autenticación de la request, ANTES de
// crear/mutar/borrar, así que reintentar es seguro (createUser no llega a
// insertar, deleteUser no llega a borrar). No reintenta ningún otro error
// (duplicados, validaciones, permisos): esos se devuelven tal cual al primer
// intento. Deliberadamente NO se usa en llamadas PostgREST con efecto (rpc,
// insert), que no son idempotentes.
export async function reintentarAuth<T extends { error: unknown }>(
  op: () => Promise<T>,
  intentos = 3,
): Promise<T> {
  let ultimo = await op();
  for (let i = 1; i < intentos; i++) {
    const err = ultimo.error as { message?: string } | null;
    if (!esErrorJwtTransitorio(err?.message)) break;
    await new Promise((r) => setTimeout(r, 200 * i));
    ultimo = await op();
  }
  return ultimo;
}

export const ROLES_STAFF = new Set(['superadmin', 'owner', 'coach']);

export type Caller = {
  id: string;
  rol: string;
  club: string | null;
  categoria: string | null;
  nombre: string | null;
  estado?: string | null;
};

export type Target = {
  id: string;
  usuario_id: string;
  estado_recuperacion: string | null;
  usuarios: { id: string; nombre: string; fecha_nacimiento: string | null; club: string | null; categoria_feb: string | null };
};

export type AdminClient = ReturnType<typeof createClient>;

// Autentica la petición: método POST + JWT válido + fila en `usuarios`.
// Devuelve { error } (Response lista para retornar) o { caller, admin }.
// El cliente admin (service_role) solo existe tras validar la identidad.
export async function autenticar(req: Request): Promise<{ error?: Response; caller?: Caller; admin?: AdminClient }> {
  if (req.method === 'OPTIONS') return { error: new Response('ok', { headers: corsHeaders }) };
  if (req.method !== 'POST') return { error: jsonResponse({ error: 'Método no permitido' }, 405) };

  // 1. Identidad: el JWT del usuario (además del verify_jwt del gateway).
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { error: jsonResponse({ error: 'Falta el token de autorización.' }, 401) };

  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  // getUser valida el JWT del caller contra Auth → sujeto al mismo fallo
  // transitorio de signing keys; reintento (lectura pura, seguro de repetir).
  const { data: { user }, error: eUser } = await reintentarAuth(() => supabaseAuth.auth.getUser());
  if (eUser || !user) return { error: jsonResponse({ error: 'Sesión inválida o expirada.' }, 401) };

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 2. Rol + club + categoría del caller (usuarios.auth_user_id, v24).
  const { data: caller, error: eCaller } = await admin
    .from('usuarios')
    .select('id, rol, club, categoria, nombre, estado')
    .eq('auth_user_id', user.id)
    .single();
  if (eCaller || !caller) return { error: jsonResponse({ error: 'Usuario sin perfil en el club.' }, 403) };

  // 3. La cuenta debe estar activa (v35). Estas funciones corren con
  //    service_role: saltan la RLS, así que el filtro de estado que v35 metió
  //    en es_staff() no las cubre — hay que comprobarlo aquí. Sin esto, un
  //    coach retirado o un atleta pendiente seguirían operando por el cerebro.
  //    (Estado ausente = activo: la columna es NOT NULL DEFAULT 'activo'.)
  if (caller.estado && caller.estado !== 'activo') {
    return { error: jsonResponse({ error: 'Tu cuenta no está activa en el club.' }, 403) };
  }

  return { caller: caller as Caller, admin };
}

// Atleta objetivo (mismo join que la tool del MCP), con estado_recuperacion
// para las lecturas de readiness.
export async function obtenerAtleta(admin: AdminClient, atletaId: string): Promise<{ error?: Response; target?: Target }> {
  const { data: target, error: eTarget } = await admin
    .from('atletas')
    .select('id, usuario_id, estado_recuperacion, usuarios!inner!atletas_usuario_id_fkey(id, nombre, fecha_nacimiento, club, categoria_feb)')
    .eq('id', atletaId)
    .single();
  if (eTarget || !target) return { error: jsonResponse({ error: 'Atleta no encontrado.' }, 404) };
  return { target: target as unknown as Target };
}

// Devuelve null si el caller puede leer al atleta objetivo; si no, el motivo.
// El orden de las reglas replica la jerarquía multi-club del blueprint §3.7.
export async function fueraDeAlcance(
  admin: AdminClient,
  caller: Caller,
  target: Target,
): Promise<string | null> {
  switch (caller.rol) {
    case 'superadmin':
      // Cruza clubes; cada acceso cross-club queda en los logs de la función
      // (tabla de auditoría dedicada: pendiente en el roadmap multi-tenant §6).
      if (caller.club && target.usuarios.club !== caller.club) {
        console.log(`[auditoria] superadmin ${caller.id} accede cross-club a atleta ${target.id} (club ${target.usuarios.club})`);
      }
      return null;
    case 'owner':
      return target.usuarios.club === caller.club ? null : 'El atleta no pertenece a tu club.';
    case 'coach': {
      if (target.usuarios.club !== caller.club) return 'El atleta no pertenece a tu club.';
      // Mismo criterio de alcance que atletasService.fetchTodosLosAtletas:
      // usuarios.categoria_feb del atleta vs la categoría asignada al coach.
      const limitadoACategoria = caller.categoria && caller.categoria !== 'Todas';
      return !limitadoACategoria || target.usuarios.categoria_feb === caller.categoria
        ? null
        : 'El atleta no pertenece a tu categoría.';
    }
    case 'atleta':
      return target.usuario_id === caller.id ? null : 'Solo puedes consultar tu propio diagnóstico.';
    case 'padre': {
      const { data } = await admin
        .from('padres_atletas')
        .select('atleta_id')
        .eq('padre_id', caller.id)
        .eq('atleta_id', target.id)
        .maybeSingle();
      return data ? null : 'Solo puedes consultar a tus hijos.';
    }
    default:
      return 'Rol sin acceso al cerebro.';
  }
}
