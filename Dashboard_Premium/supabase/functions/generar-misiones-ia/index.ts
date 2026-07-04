// Edge Function: generar-misiones-ia — ORQUESTADOR del loop evaluación → misión.
// Diseño: docs/spec_loop_misiones_baremo.md §Fase 2 (D2/D4/D6).
//
// Invocada EXPLÍCITAMENTE desde la app (recalcularOverall al guardar una
// evaluación, y el botón "Regenerar misiones" del coach) — ya no hay trigger de
// base de datos (eliminado en la migración fase0_disable_broken_mission_trigger).
//
// La detección de debilidades y la selección de misiones son DETERMINISTAS y
// viven en analytics-core (copiado a ../_shared por `npm run functions:sync` —
// no editar la copia). La IA (Gemini) solo entra como último recurso cuando una
// debilidad no tiene cobertura en el catálogo, y lo que genera nace inactivo y
// pasa por aprobación del coach (D3/D4).
//
// Idempotencia (una sesión de evaluación = N submits = N invocaciones):
// 1ª línea: seleccionarMisiones deduplica contra TODAS las asignaciones
// históricas del atleta. 2ª línea: índice único (atleta_id, mision_id) en
// progreso_misiones — el 23505 se cuenta como omisión, nunca como error.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  calcularCategoriaFEB,
  categoriaABucketBaremo,
  detectarDebilidades,
  seleccionarMisiones,
} from "../_shared/analytics-core/index.js";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

// Genera una misión con Gemini para una debilidad sin cobertura de catálogo.
// Best-effort: cualquier fallo devuelve null (la debilidad se reporta sin misión).
async function generarMisionConIA(
  sinCobertura: { sub_pilar: string; nivel: string; categoriaBucket: string | null },
): Promise<{ titulo: string; descripcion: string; justificacion: string; xp_recompensa: number; video_url?: string } | null> {
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiApiKey) {
    console.error('GEMINI_API_KEY no configurada; se omite la generación IA.');
    return null;
  }

  const prompt = `
    Eres un preparador físico de élite de baloncesto formativo. Necesito UNA misión de
    entrenamiento para un atleta de categoría ${sinCobertura.categoriaBucket ?? 'general'}
    y nivel ${sinCobertura.nivel}, dirigida específicamente al sub-pilar
    "${sinCobertura.sub_pilar}".

    Requisitos:
    - La descripción debe ser ejecutable por un chico de esa edad sin supervisión especial.
    - La justificación debe citar el fundamento científico (estándares NSCA, FitnessGram
      o literatura deportiva revisada) de por qué este trabajo mejora ese sub-pilar a esa edad.
    - xp_recompensa coherente con el nivel: Micro≈25, Desarrollo≈50, Elite≈75.
    - video_url es opcional; SOLO inclúyelo si conoces un video de YouTube real y pertinente.

    Responde ÚNICAMENTE con un objeto JSON válido:
    {
      "titulo": "máx 60 caracteres, motivador",
      "descripcion": "instrucciones concretas del ejercicio/hábito",
      "justificacion": "fundamento científico con fuente",
      "xp_recompensa": 50,
      "video_url": "https://www.youtube.com/watch?v=... (opcional, omitir si no hay)"
    }
  `;

  try {
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { response_mime_type: 'application/json' },
        }),
      },
    );

    const geminiData = await geminiResponse.json();
    if (geminiData.error) {
      console.error('Gemini Error:', geminiData.error);
      return null;
    }

    const aiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!aiText) return null;

    const mision = JSON.parse(aiText);
    if (!mision?.titulo || !mision?.descripcion || !mision?.justificacion) return null;
    return mision;
  } catch (err) {
    console.error('Fallo generando misión con IA:', err);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método no permitido' }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const atletaId: string | undefined = body.atleta_id;
    const evaluacionId: string | null = body.evaluacion_id ?? null;

    if (!atletaId) {
      return jsonResponse({ error: 'Falta atleta_id en el body' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // 1. Atleta + fecha de nacimiento → categoría FEB → bucket de baremo
    const { data: atleta, error: atletaError } = await supabase
      .from('atletas')
      .select('id, nivel_desarrollo, usuarios!atletas_usuario_id_fkey(fecha_nacimiento)')
      .eq('id', atletaId)
      .single();

    if (atletaError || !atleta) {
      return jsonResponse({ error: `Atleta no encontrado: ${atletaError?.message ?? atletaId}` }, 404);
    }

    const fechaNacimiento = (atleta.usuarios as { fecha_nacimiento?: string } | null)?.fecha_nacimiento ?? null;
    const categoria = fechaNacimiento ? calcularCategoriaFEB(fechaNacimiento) : null;
    const bucket = categoria ? categoriaABucketBaremo(categoria) : null;

    // 2. Historial COMPLETO de evaluaciones (el corte "última por prueba" lo
    //    hace ultimasPorPrueba dentro de detectarDebilidades — sin limit).
    const { data: evaluaciones, error: evalError } = await supabase
      .from('evaluaciones_pruebas')
      .select('prueba_tipo, sub_pilar, puntuacion_normalizada, tier, created_at')
      .eq('atleta_id', atletaId);
    if (evalError) throw evalError;

    // 3. Debilidades medidas (D6: máx 3 por defecto)
    const debilidades = detectarDebilidades(evaluaciones ?? []);

    // 4. Catálogo activo + TODAS las asignaciones históricas (dedup total)
    const [{ data: catalogo, error: catError }, { data: asignadas, error: asigError }] = await Promise.all([
      supabase
        .from('misiones')
        .select('id, pilar, nivel_objetivo, categoria_bucket, complejidad, activa, created_at, xp_recompensa')
        .eq('activa', true),
      supabase
        .from('progreso_misiones')
        .select('mision_id')
        .eq('atleta_id', atletaId),
    ]);
    if (catError) throw catError;
    if (asigError) throw asigError;

    // 5. Selección determinista (D6: 2 por debilidad)
    const { asignaciones, sinCobertura } = seleccionarMisiones(
      debilidades,
      catalogo ?? [],
      asignadas ?? [],
      { porDebilidad: 2, nivel: atleta.nivel_desarrollo, categoriaBucket: bucket },
    );

    // 6. Insertar asignaciones (D4: generales visibles ya; específicas al coach)
    const insertadas: Array<{ mision_id: string; estado: string; sub_pilar_objetivo: string }> = [];
    let omitidasPorDuplicado = 0;

    for (const asignacion of asignaciones) {
      const estado = asignacion.complejidad === 'general' ? 'pendiente' : 'pendiente_aprobacion';
      const { error: insError } = await supabase.from('progreso_misiones').insert({
        atleta_id: atletaId,
        mision_id: asignacion.mision_id,
        completada: false,
        estado,
        origen: 'auto_baremo',
        sub_pilar_objetivo: asignacion.sub_pilar_objetivo,
        evaluacion_id: evaluacionId,
        tipo_asignacion: 'individual',
        fecha_asignacion: new Date().toISOString(),
      });

      if (insError) {
        // 23505 = índice único (atleta_id, mision_id): otra invocación de la
        // misma tanda ya la asignó — omisión esperada, no error.
        if (insError.code === '23505') {
          omitidasPorDuplicado++;
          continue;
        }
        throw insError;
      }
      insertadas.push({ mision_id: asignacion.mision_id, estado, sub_pilar_objetivo: asignacion.sub_pilar_objetivo });
    }

    // 7. Debilidades sin cobertura → generación IA bajo demanda (best-effort).
    //    Lo generado nace inactivo (activa=false) y su asignación va a la cola
    //    del coach (pendiente_aprobacion) — D3/D4: siempre curaduría humana.
    //
    //    Idempotencia de la rama IA: las misiones generadas tienen ids nuevos,
    //    así que el dedup por mision_id no las frena — sin esta guarda, cada
    //    "Regenerar" con la misma debilidad y catálogo agotado crearía OTRA
    //    misión IA. Regla: máximo UNA asignación IA viva (no rechazada) por
    //    sub-pilar por atleta.
    const { data: iaVivas } = await supabase
      .from('progreso_misiones')
      .select('sub_pilar_objetivo')
      .eq('atleta_id', atletaId)
      .eq('origen', 'ia')
      .neq('estado', 'rechazada');
    const subPilaresConIAViva = new Set((iaVivas ?? []).map((r: { sub_pilar_objetivo: string | null }) => r.sub_pilar_objetivo));

    const sinCoberturaReportadas: Array<{ sub_pilar: string; nivel: string; categoriaBucket: string | null; misionGenerada: boolean; motivo?: string }> = [];

    for (const faltante of sinCobertura) {
      if (subPilaresConIAViva.has(faltante.sub_pilar)) {
        sinCoberturaReportadas.push({
          ...faltante,
          misionGenerada: false,
          motivo: 'ya tiene una misión IA pendiente para este sub-pilar',
        });
        continue;
      }
      const misionIA = await generarMisionConIA(faltante);
      if (!misionIA) {
        sinCoberturaReportadas.push({ ...faltante, misionGenerada: false });
        continue;
      }

      const { data: nuevaMision, error: misionError } = await supabase
        .from('misiones')
        .insert({
          titulo: `[IA] ${misionIA.titulo}`,
          descripcion: misionIA.descripcion,
          justificacion: misionIA.justificacion,
          pilar: faltante.sub_pilar,
          nivel_objetivo: faltante.nivel,
          categoria_bucket: faltante.categoriaBucket,
          complejidad: 'especifica',
          activa: false,
          is_ai_generated: true,
          xp_recompensa: misionIA.xp_recompensa ?? 50,
          video_url: misionIA.video_url ?? null,
          condicion_trigger: 'generado_por_ia',
        })
        .select('id')
        .single();

      if (misionError || !nuevaMision) {
        console.error('Fallo insertando misión IA:', misionError);
        sinCoberturaReportadas.push({ ...faltante, misionGenerada: false });
        continue;
      }

      const { error: asignacionIAError } = await supabase.from('progreso_misiones').insert({
        atleta_id: atletaId,
        mision_id: nuevaMision.id,
        completada: false,
        estado: 'pendiente_aprobacion',
        origen: 'ia',
        sub_pilar_objetivo: faltante.sub_pilar,
        evaluacion_id: evaluacionId,
        tipo_asignacion: 'individual',
        fecha_asignacion: new Date().toISOString(),
      });
      if (asignacionIAError && asignacionIAError.code !== '23505') {
        console.error('Fallo asignando misión IA:', asignacionIAError);
      }

      sinCoberturaReportadas.push({ ...faltante, misionGenerada: true });
    }

    return jsonResponse({
      debilidades,
      asignadas: insertadas,
      omitidasPorDuplicado,
      sinCobertura: sinCoberturaReportadas,
    }, 200);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
