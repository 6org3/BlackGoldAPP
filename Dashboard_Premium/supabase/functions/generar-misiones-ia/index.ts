import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Obtenemos el payload enviado por el Webhook de Supabase
    const payload = await req.json();
    
    // Solo procesamos eventos INSERT (nuevas evaluaciones)
    if (payload.type !== 'INSERT') {
      return new Response(JSON.stringify({ message: "No es un INSERT, ignorando." }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      });
    }

    const nuevaEvaluacion = payload.record;
    const athleteId = nuevaEvaluacion.atleta_id;

    if (!athleteId) throw new Error("atleta_id no encontrado en el payload.");

    // Configuración de Supabase Service Role para poder insertar misiones
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Obtener historial reciente del atleta (últimas 30 evaluaciones)
    const { data: historial, error: dbError } = await supabase
      .from('evaluaciones_pruebas')
      .select('sub_pilar, tier, prueba_tipo, puntuacion_normalizada')
      .eq('atleta_id', athleteId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (dbError) throw dbError;

    // Agrupar los peores tiers
    let debilidades = new Set<string>();
    (historial || []).forEach(ev => {
      if (ev.tier === 'poor' || ev.tier === 'below_avg') {
        debilidades.add(ev.sub_pilar);
      }
    });

    const pilaresDebiles = Array.from(debilidades).join(", ") || "Ninguno";

    // 2. Construir Prompt para Gemini
    const systemPrompt = `
      Eres un Coach de Élite de Baloncesto Deportivo. Un atleta acaba de realizar una nueva prueba.
      Revisando su historial, hemos detectado que tiene debilidad en los siguientes pilares: ${pilaresDebiles}.
      
      Tu tarea es crear UNA MISIÓN DE ENTRENAMIENTO específica y altamente individualizada para mejorar estos pilares.
      Si es 'Ninguno', genera una misión de mantenimiento avanzado.
      
      IMPORTANTE: Debes responder ÚNICAMENTE con un objeto JSON válido con este formato:
      {
        "titulo": "Título de la misión motivador (máx 50 chars)",
        "descripcion": "Descripción detallada del entrenamiento o la acción que debe realizar el atleta para mejorar sus debilidades.",
        "xp_recompensa": 100
      }
    `;

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) throw new Error("GEMINI_API_KEY no configurada");

    // 3. Llamar a Google Gemini (REST API)
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }],
        generationConfig: { response_mime_type: "application/json" }
      })
    });

    const geminiData = await geminiResponse.json();
    
    if (geminiData.error) {
      console.error("Gemini Error:", geminiData.error);
      throw new Error(geminiData.error.message);
    }

    const aiText = geminiData.candidates[0].content.parts[0].text;
    const missionData = JSON.parse(aiText);

    // 4. Insertar la nueva misión en la tabla
    const { error: insertError } = await supabase
      .from('misiones')
      .insert({
        titulo: `[IA] ${missionData.titulo}`,
        descripcion: missionData.descripcion,
        tipo: 'youtube', // Workaround: Usar tipo existente para pasar el check_constraint
        video_url: 'https://www.youtube.com/watch?v=1bXoM0k7Y6A', // Video por defecto
        xp_recompensa: missionData.xp_recompensa || 50,
        condicion_trigger: 'generado_por_ia',
        is_ai_generated: true // Nuestra nueva columna bandera
      });

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ success: true, mission: missionData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
