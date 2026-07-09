// Edge Function: brain-gateway — el cerebro (brain-core) detrás de HTTP.
//
// Fase 0/2 del rediseño frontend por rol (docs/blueprint_rediseno_frontend.md
// §4.2-4.3, docs/handoff_implementacion.md §5-PR2). Vía A: cards IA
// DETERMINISTAS — sin LLM: lectura de datos + funciones puras de brain-core,
// respuesta JSON estructurada lista para renderizar.
//
// Endpoints:
//   POST /brain-gateway/atleta/{id}/diagnostico
//   → { atleta, diagnostico: { subPilares, debilidades, ... }, fuente }
//   POST /brain-gateway/atleta/{id}/readiness
//   → { atleta, readiness: { score, alertas, misionesRecomendadas, ... }, fuente }
//
// Seguridad (los tres invariantes del blueprint):
// 1. El navegador NUNCA ve service_role: llega con el JWT del usuario
//    (Authorization: Bearer) y esta función lee los datos server-side.
// 2. Alcance por rol Y por club ANTES de tocar datos: superadmin cruza clubes
//    (acceso auditado en logs), owner solo su club, coach su club+categoría,
//    atleta solo él mismo, padre solo sus hijos (padres_atletas).
// 3. La lógica analítica no se duplica: analizarPilares() viene del espejo
//    _shared/brain-core (npm run functions:sync) — el mismo módulo que usa el
//    MCP. Aquí NO se importa el barrel ni prompts.js/rack.js (Node-only, fs).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { analizarPilares } from "../_shared/brain-core/diagnostico.js";
import { analizarReadiness } from "../_shared/brain-core/readiness.js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

const ROLES_STAFF = new Set(['superadmin', 'owner', 'coach']);

type Caller = { id: string; rol: string; club: string | null; categoria: string | null };
type Target = {
  id: string;
  usuario_id: string;
  estado_recuperacion: string | null;
  usuarios: { id: string; nombre: string; fecha_nacimiento: string | null; club: string | null; categoria_feb: string | null };
};

const RECURSOS = new Set(['diagnostico', 'readiness']);

// Devuelve null si el caller puede leer al atleta objetivo; si no, el motivo.
// El orden de las reglas replica la jerarquía multi-club del blueprint §3.7.
async function fueraDeAlcance(
  admin: ReturnType<typeof createClient>,
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no permitido' }, 405);

  // Ruta esperada: .../brain-gateway/atleta/{id}/{diagnostico|readiness}
  const segmentos = new URL(req.url).pathname.split('/').filter(Boolean);
  const idx = segmentos.lastIndexOf('atleta');
  const atletaId = idx !== -1 ? segmentos[idx + 1] : null;
  const recurso = idx !== -1 ? segmentos[idx + 2] : null;
  if (!atletaId || !recurso || !RECURSOS.has(recurso)) {
    return jsonResponse({ error: 'Ruta no reconocida. Usa POST /brain-gateway/atleta/{id}/diagnostico o .../readiness.' }, 404);
  }

  // 1. Identidad: el JWT del usuario (además del verify_jwt del gateway).
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Falta el token de autorización.' }, 401);

  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: eUser } = await supabaseAuth.auth.getUser();
  if (eUser || !user) return jsonResponse({ error: 'Sesión inválida o expirada.' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // 2. Rol + club + categoría del caller (usuarios.auth_user_id, v24).
  const { data: caller, error: eCaller } = await admin
    .from('usuarios')
    .select('id, rol, club, categoria')
    .eq('auth_user_id', user.id)
    .single();
  if (eCaller || !caller) return jsonResponse({ error: 'Usuario sin perfil en el club.' }, 403);

  // 3. Atleta objetivo (mismo join que la tool del MCP).
  const { data: targetRaw, error: eTarget } = await admin
    .from('atletas')
    .select('id, usuario_id, estado_recuperacion, usuarios!inner!atletas_usuario_id_fkey(id, nombre, fecha_nacimiento, club, categoria_feb)')
    .eq('id', atletaId)
    .single();
  if (eTarget || !targetRaw) return jsonResponse({ error: 'Atleta no encontrado.' }, 404);
  const target = targetRaw as unknown as Target;

  // 4. Alcance por rol y club ANTES de leer datos analíticos.
  const rechazo = await fueraDeAlcance(admin, caller as Caller, target);
  if (rechazo) return jsonResponse({ error: rechazo }, 403);

  return recurso === 'diagnostico'
    ? await manejarDiagnostico(admin, caller as Caller, target)
    : await manejarReadiness(admin, target);
});

// --- Recurso: diagnóstico 360° (analyze_athlete_pillars, JSON) ---
async function manejarDiagnostico(
  admin: ReturnType<typeof createClient>,
  caller: Caller,
  target: Target,
): Promise<Response> {
  // Evaluaciones recientes (misma ventana que analyze_athlete_pillars).
  const { data: evaluaciones, error: eEval } = await admin
    .from('evaluaciones_pruebas')
    .select('*')
    .eq('atleta_id', target.id)
    .order('created_at', { ascending: false })
    .limit(20);
  if (eEval) return jsonResponse({ error: 'Error al obtener evaluaciones: ' + eEval.message }, 500);

  // El mismo cerebro que el MCP, en JSON estructurado para las cards.
  const { categoria, pilarStats, notasSubjetivas, debiles } = analizarPilares({
    atleta: target.usuarios,
    evaluaciones: evaluaciones || [],
  });

  // Debilidades primero: es el orden en que las cards priorizan la acción.
  const subPilares = Object.entries(pilarStats)
    .map(([sub_pilar, s]: [string, { count: number; sumScore: number; currentTier: string | null }]) => ({
      sub_pilar,
      promedio: Math.round(s.sumScore / s.count),
      tier: s.currentTier,
      evaluaciones: s.count,
    }))
    .sort((a, b) => a.promedio - b.promedio);

  return jsonResponse({
    atleta: { id: target.id, nombre: target.usuarios.nombre, categoria },
    diagnostico: {
      categoria,
      subPilares,
      debilidades: debiles,
      // Las notas del coach solo vuelven a staff: a atleta/padre les llega la
      // lectura simple, no el cuaderno interno (tono por rol, blueprint §4.4).
      ...(ROLES_STAFF.has(caller.rol) ? { notas: notasSubjetivas } : {}),
    },
    fuente: { tool: 'analyze_athlete_pillars', modulo: 'brain-core/analizarPilares' },
    generado_en: new Date().toISOString(),
  }, 200);
}

// --- Recurso: readiness / recuperación (analyze_athlete_readiness, JSON) ---
async function manejarReadiness(
  admin: ReturnType<typeof createClient>,
  target: Target,
): Promise<Response> {
  // Último check-in + catálogo activo de recuperación (mismas queries que el MCP).
  const [{ data: checkIn }, { data: misiones }] = await Promise.all([
    admin
      .from('atleta_readiness')
      .select('sueno_calidad, fatiga_fisica, color_orina, fecha')
      .eq('atleta_id', target.id)
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('misiones')
      .select('id, titulo, condicion_trigger, complejidad, xp_recompensa, activa, pilar')
      .eq('activa', true)
      .eq('pilar', 'recuperacion'),
  ]);

  // Sin señal alguna no es un error: la card muestra el CTA de check-in.
  const sinDatos = !checkIn && !target.estado_recuperacion;

  const { score, deficits, recomendadas } = analizarReadiness({
    readiness: checkIn,
    estadoRecuperacion: target.estado_recuperacion,
    misiones: misiones || [],
  });

  return jsonResponse({
    atleta: { id: target.id, nombre: target.usuarios.nombre },
    readiness: {
      sinDatos,
      score,
      checkIn: checkIn || null,
      estadoRecuperacion: target.estado_recuperacion,
      alertas: deficits,
      misionesRecomendadas: recomendadas,
    },
    fuente: { tool: 'analyze_athlete_readiness', modulo: 'brain-core/analizarReadiness' },
    generado_en: new Date().toISOString(),
  }, 200);
}
