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
// 2. Alcance por rol Y por club ANTES de tocar datos — autenticar() +
//    obtenerAtleta() + fueraDeAlcance() compartidos en _shared/brainAuth.ts
//    (los mismos que usa la Edge Function copiloto).
// 3. La lógica analítica no se duplica: analizarPilares() viene del espejo
//    _shared/brain-core (npm run functions:sync) — el mismo módulo que usa el
//    MCP. Aquí NO se importa el barrel ni prompts.js/rack.js (Node-only, fs).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  autenticar,
  corsHeaders,
  fueraDeAlcance,
  jsonResponse,
  obtenerAtleta,
  ROLES_STAFF,
  type AdminClient,
  type Caller,
  type Target,
} from "../_shared/brainAuth.ts";
import { analizarPilares } from "../_shared/brain-core/diagnostico.js";
import { analizarReadiness } from "../_shared/brain-core/readiness.js";

const RECURSOS = new Set(['diagnostico', 'readiness']);

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

  // 1-2. Identidad + rol/club/categoría del caller (compartido, _shared/brainAuth.ts).
  const auth = await autenticar(req);
  if (auth.error) return auth.error;
  const caller = auth.caller!;
  const admin = auth.admin!;

  // 3. Atleta objetivo (mismo join que la tool del MCP).
  const res = await obtenerAtleta(admin, atletaId);
  if (res.error) return res.error;
  const target = res.target as Target;

  // 4. Alcance por rol y club ANTES de leer datos analíticos.
  const rechazo = await fueraDeAlcance(admin, caller, target);
  if (rechazo) return jsonResponse({ error: rechazo }, 403);

  return recurso === 'diagnostico'
    ? await manejarDiagnostico(admin, caller, target)
    : await manejarReadiness(admin, target);
});

// --- Recurso: diagnóstico 360° (analyze_athlete_pillars, JSON) ---
async function manejarDiagnostico(
  admin: AdminClient,
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
  admin: AdminClient,
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
