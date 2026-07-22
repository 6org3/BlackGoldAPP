import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { calcularCategoriaFEB } from "../../packages/analytics-core/categoriaFEB.js";
import { BAREMOS, categoriaABucketBaremo, resolverUmbrales } from "../../packages/analytics-core/baremos.js";
import { PILARES, SUB_PILARES as SUB_PILARES_TAXONOMIA, SUB_PILARES_MONITOREO, getSubPilar, getPilar } from "../../packages/analytics-core/taxonomia.js";
import { clasificarContextoMision } from "../../packages/analytics-core/clasificadorContexto.js";
// Capa compartida de "lógica de las tools" (packages/brain-core): rack documental
// (knowledge/ + docs deportivos del repo, de donde las tools recuperan el fundamento
// científico/metodológico de sus prompts), diagnóstico de pilares y readiness —
// este último sobre el motor de recomendación COMPARTIDO de analytics-core (el
// mismo que usa la web vía el shim src/lib/didacticEngine.js y la Edge Function).
// Las tools analíticas de este server son wrappers finos: fetch a Supabase →
// funciones puras de brain-core → texto (mismo cerebro que las futuras Edge
// Functions brain-gateway).
import {
  buscarRack, contextoRack, inventarioRack,
  analizarPilares, construirPromptDiagnostico,
  analizarReadiness, construirPromptReadiness,
  RECUPERACION_TRIGGERS,
} from "../../packages/brain-core/index.js";

// Resuelto contra la ubicación del script, no contra process.cwd(): un cliente MCP
// (Claude Code, Claude Desktop) lanza este proceso con el cwd del host, no de este paquete.
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
// Desde la migración v24 (RLS real) la anon key no tiene acceso a ninguna
// tabla: este proceso corre local en la máquina del staff y necesita la
// service_role key (solo en .env, nunca en el repo ni en un cliente web).
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[blackgold-mcp] SUPABASE_SERVICE_ROLE_KEY no está en .env: con RLS v24 la anon key no puede leer ni escribir tablas y todas las tools fallarán.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const server = new McpServer({
  name: "blackgold-mcp",
  version: "1.0.0"
});

// Tool 1: Analyze Athlete Pillars
server.tool(
  "analyze_athlete_pillars",
  "Genera un resumen analítico de los sub-pilares del radar de un atleta basado en sus evaluaciones físicas, técnicas y percepciones subjetivas.",
  {
    athlete_id: z.string().describe("UUID del atleta a evaluar")
  },
  async ({ athlete_id }) => {
    try {
      // Obtener el atleta. `athlete_id` es atletas.id (la misma FK que usa
      // evaluaciones_pruebas.atleta_id más abajo) — se hace join a usuarios para el
      // nombre y la fecha de nacimiento. La categoría la deriva analizarPilares() con
      // calcularCategoriaFEB() (packages/analytics-core, compartido con la web app) en
      // vez de leer una columna usuarios.categoria_actual que no existe en el esquema
      // (el resto del repo usa usuarios.categoria) — esa columna inexistente hacía que
      // esta consulta fallara siempre con un error de Postgres.
      const { data: atleta, error: atletaError } = await supabase
        .from("atletas")
        .select("usuarios!inner!atletas_usuario_id_fkey(nombre, fecha_nacimiento)")
        .eq("id", athlete_id)
        .single();

      if (atletaError) throw new Error("Atleta no encontrado: " + atletaError.message);

      // Obtener evaluaciones recientes
      const { data: evaluaciones, error: evalError } = await supabase
        .from("evaluaciones_pruebas")
        .select("*")
        .eq("atleta_id", athlete_id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (evalError) throw new Error("Error al obtener evaluaciones: " + evalError.message);

      // Análisis + prompt con las funciones puras compartidas (brain-core):
      // misma salida que cuando este cuerpo vivía aquí.
      const analisis = analizarPilares({ atleta: atleta.usuarios, evaluaciones });
      const promptInfo = construirPromptDiagnostico({ nombre: atleta.usuarios.nombre, analisis });

      return {
        content: [{ type: "text", text: promptInfo }]
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// Tool 2: Generate Custom Mission
server.tool(
  "generate_custom_mission",
  "Asigna misiones o aconseja entrenamientos individualizados para mejorar cada pilar detectado como débil. Con contexto:'casa' propone trabajo ejecutable fuera de la cancha (hábitos, tareas en casa, video-análisis).",
  {
    athlete_id: z.string().describe("UUID del atleta a evaluar"),
    contexto: z.enum(["cancha", "casa"]).optional()
      .describe("'casa' = la misión debe poder hacerse fuera de la cancha, sin material del club"),
  },
  async ({ athlete_id, contexto }) => {
    try {
      const { data: evaluaciones } = await supabase
        .from("evaluaciones_pruebas")
        .select("sub_pilar, tier")
        .eq("atleta_id", athlete_id)
        .order("created_at", { ascending: false })
        .limit(30);

      // Agrupar los peores tiers
      let debilidades = new Set();
      (evaluaciones || []).forEach(ev => {
        if (ev.tier === 'poor' || ev.tier === 'below_avg') {
          debilidades.add(ev.sub_pilar);
        }
      });

      let promptInfo = `Atleta ID: ${athlete_id}\n`;
      promptInfo += `Pilares Críticos Detectados (Bajo Promedio): ${Array.from(debilidades).join(", ") || "Ninguno"}\n`;
      if (contexto) promptInfo += `Contexto pedido: ${contexto}\n`;
      promptInfo += contextoRack(
        contexto === "casa"
          ? `${Array.from(debilidades).join(" ") || "hábitos"} trabajo casa fuera de cancha rutina video análisis diario nutrición sueño`
          : `${Array.from(debilidades).join(" ") || "mantenimiento avanzado"} ejercicios entrenamiento progresión edad baloncesto`,
        { k: 3 }
      );
      promptInfo += "\n\nINSTRUCCIÓN PARA LA IA: Asigna misiones específicas o aconseja entrenamientos súper individualizados para mejorar CADA UNO de los pilares débiles detectados. Si es 'Ninguno', genera una misión de mantenimiento avanzado." +
        (contexto === "casa" ? " La misión debe ser ejecutable EN CASA, sin supervisión ni material del club (autocarga, pared, hábitos, video, diario)." : "") +
        " Fundamenta cada misión en el CONTEXTO DEL RACK DOCUMENTAL, citando [archivo › sección]. Responde en formato atractivo para el atleta.";

      return { content: [{ type: "text", text: promptInfo }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// Tool 3: Suggest Next Test
server.tool(
  "suggest_next_test",
  "Analiza el historial de evaluaciones y sugiere qué prueba debería tomar el atleta próximamente con su explicación lógica.",
  {
    athlete_id: z.string().describe("UUID del atleta a evaluar")
  },
  async ({ athlete_id }) => {
    try {
      const { data: evaluaciones } = await supabase
        .from("evaluaciones_pruebas")
        .select("prueba_tipo, sub_pilar, created_at")
        .eq("atleta_id", athlete_id)
        .order("created_at", { ascending: false });

      let lastTests = {};
      (evaluaciones || []).forEach(ev => {
        if (!lastTests[ev.sub_pilar]) {
          lastTests[ev.sub_pilar] = ev.created_at;
        }
      });

      let promptInfo = `Atleta ID: ${athlete_id}\n`;
      promptInfo += `Últimas evaluaciones por pilar:\n`;
      for (const [pilar, date] of Object.entries(lastTests)) {
        promptInfo += `- ${pilar}: ${new Date(date).toLocaleDateString()}\n`;
      }

      promptInfo += contextoRack(
        "batería pruebas evaluación detección fases sensibles frecuencia edad " + Object.keys(lastTests).join(" "),
        { k: 3, maxChars: 2400 }
      );

      promptInfo += `\n\nINSTRUCCIÓN PARA LA IA: Teniendo en cuenta los ${SUB_PILARES_TAXONOMIA.length} sub-pilares del radar (${SUB_PILARES_TAXONOMIA.map(s => s.key).join(", ")}), detecta cuáles no han sido evaluados o hace más tiempo no se evalúan. Sugiere la siguiente prueba específica (ej: CMJ, Lane Agility, etc) y BRINDA UNA EXPLICACIÓN LÓGICA y científica de por qué debe evaluarse eso ahora, apoyada en el CONTEXTO DEL RACK DOCUMENTAL con cita [archivo › sección] cuando aplique.`;

      return { content: [{ type: "text", text: promptInfo }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// Las condiciones de recuperación (RECUPERACION_TRIGGERS / RECUPERACION_CONDICIONES)
// viven ahora en packages/brain-core/readiness.js, junto al análisis que las consume.

// Tool 6: Analizar Readiness / Recuperación y recomendar misiones
server.tool(
  "analyze_athlete_readiness",
  "Analiza la recuperación del atleta (check-in diario: sueño, fatiga, hidratación de la tabla atleta_readiness + estado_recuperacion) usando el motor compartido, y recomienda misiones de recuperación del catálogo. La recuperación es una señal de disponibilidad/riesgo, NO una nota de rendimiento.",
  {
    athlete_id: z.string().describe("UUID del atleta (atletas.id)")
  },
  async ({ athlete_id }) => {
    try {
      // Último check-in de readiness + estado de recuperación del atleta.
      const [{ data: readiness }, { data: atleta }] = await Promise.all([
        supabase
          .from("atleta_readiness")
          .select("sueno_calidad, fatiga_fisica, color_orina, fecha")
          .eq("atleta_id", athlete_id)
          .order("fecha", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("atletas")
          .select("estado_recuperacion")
          .eq("id", athlete_id)
          .maybeSingle(),
      ]);

      if (!readiness && !(atleta && atleta.estado_recuperacion)) {
        return { content: [{ type: "text", text: `El atleta ${athlete_id} no tiene check-in de readiness ni estado de recuperación registrado. Pídele completar el Check-in Diario.` }] };
      }

      // Misiones de recuperación del catálogo activo (el emparejamiento con las
      // condiciones activas lo hace analizarReadiness, vía la función COMPARTIDA
      // — misma que getAutoMissions).
      const { data: misiones } = await supabase
        .from("misiones")
        .select("id, titulo, condicion_trigger, complejidad, xp_recompensa, activa, pilar")
        .eq("activa", true)
        .eq("pilar", "recuperacion");

      // Score + déficits + recomendaciones con las funciones puras compartidas
      // (brain-core, mismo motor que la web/Edge): misma salida que cuando este
      // cuerpo vivía aquí.
      const analisis = analizarReadiness({
        readiness,
        estadoRecuperacion: atleta?.estado_recuperacion,
        misiones,
      });
      const out = construirPromptReadiness({
        athleteId: athlete_id,
        readiness,
        estadoRecuperacion: atleta?.estado_recuperacion,
        misiones,
        analisis,
      });

      return { content: [{ type: "text", text: out }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ============================================================
// CATÁLOGO DE MISIONES (D3 del spec loop misiones-baremo):
// el MCP propone misiones con justificación científica, el coach
// las activa desde AdminMisiones. Matriz objetivo:
// SUB_PILARES.length × 3 niveles × 4 buckets de edad (96 celdas hoy).
// ============================================================

// Derivado de la taxonomía compartida (fuente única): los sub-pilares del radar
// (8 desde que 'resistencia' entró a taxonomia.js el 2026-07-05 — la matriz de
// misiones creció sola). TODAS_LAS_KEYS_SUBPILAR añade los de monitoreo
// (recuperacion, composicion_corporal) para las tools del rack/mapa.
const SUB_PILARES = SUB_PILARES_TAXONOMIA.map(s => s.key);
const TODAS_LAS_KEYS_SUBPILAR = [...SUB_PILARES_TAXONOMIA, ...SUB_PILARES_MONITOREO].map(s => s.key);
const NIVELES = ["Micro", "Desarrollo", "Elite"];
const BUCKETS = ["Sub12", "Sub15", "Sub18", "Senior"];
// Contexto de ejecución de una misión (v26): 'ambos' es comodín explícito.
const CONTEXTOS = ["cancha", "casa", "ambos"];
// Etiqueta de periodización (v26): null = comodín, válida todo el año.
const FASES_TEMPORADA = ["preparatoria", "competitiva", "transicion"];
// Valores válidos de misiones.pilar (CHECK misiones_pilar_check, v26): los 8 sub-pilares
// del radar + 'recuperacion' + los legacy de contenido 'youtube'/'articulo'.
const PILARES_MISION = [...SUB_PILARES, "recuperacion", "youtube", "articulo"];

const TOTAL_CELDAS = () => SUB_PILARES.length * NIVELES.length * BUCKETS.length;

const claveCelda = (subPilar, nivel, bucket) => `${subPilar}|${nivel}|${bucket}`;

// Cobertura actual de la matriz: una celda está cubierta si tiene ≥1 misión
// 'general' Y ≥1 'especifica' (activas o propuestas — la curaduría es del coach).
function calcularCobertura(misiones) {
  const porCelda = {};
  (misiones || []).forEach(m => {
    if (!SUB_PILARES.includes(m.pilar) || !m.nivel_objetivo || !m.categoria_bucket) return;
    const clave = claveCelda(m.pilar, m.nivel_objetivo, m.categoria_bucket);
    if (!porCelda[clave]) porCelda[clave] = { general: 0, especifica: 0 };
    porCelda[clave][m.complejidad === "general" ? "general" : "especifica"]++;
  });

  const faltantes = [];
  let cubiertas = 0;
  SUB_PILARES.forEach(sp => NIVELES.forEach(niv => BUCKETS.forEach(b => {
    const c = porCelda[claveCelda(sp, niv, b)];
    if (c && c.general >= 1 && c.especifica >= 1) {
      cubiertas++;
    } else {
      faltantes.push({ sub_pilar: sp, nivel: niv, bucket: b, tiene: c || { general: 0, especifica: 0 } });
    }
  })));
  return { cubiertas, faltantes };
}

// Matriz CASA (paralela, no multiplica la principal): sub-pilar × bucket.
// Una celda está cubierta con ≥1 misión contexto='casa' ESTRICTO (si 'ambos'
// contara, el backfill de v26 la cubriría al instante y nunca se redactaría
// contenido genuinamente de casa), complejidad='general' y nivel_objetivo=null
// (la dosis por edad va en la descripción, como en el seed).
const TOTAL_CELDAS_CASA = () => SUB_PILARES.length * BUCKETS.length;

function calcularCoberturaCasa(misiones) {
  const porCelda = {};
  (misiones || []).forEach(m => {
    if (m.contexto !== "casa" || m.complejidad !== "general") return;
    if (!SUB_PILARES.includes(m.pilar) || !m.categoria_bucket) return;
    const clave = `${m.pilar}|${m.categoria_bucket}`;
    porCelda[clave] = (porCelda[clave] || 0) + 1;
  });

  const faltantes = [];
  let cubiertas = 0;
  SUB_PILARES.forEach(sp => BUCKETS.forEach(b => {
    if (porCelda[`${sp}|${b}`] >= 1) cubiertas++;
    else faltantes.push({ sub_pilar: sp, bucket: b });
  }));
  return { cubiertas, faltantes };
}

// Tool 4: Generar Catálogo de Misiones
server.tool(
  "generar_catalogo_misiones",
  "Analiza la cobertura del catálogo de misiones (matriz sub-pilares de la taxonomía × 3 niveles × 4 buckets de edad; con contexto:'casa' analiza la matriz paralela de misiones fuera de cancha, sub-pilar × bucket), prioriza las celdas faltantes según los atletas reales del club, y devuelve las instrucciones para redactar las misiones faltantes con justificación científica. Tras redactarlas, insertarlas con insertar_misiones_catalogo.",
  {
    sub_pilar: z.enum(SUB_PILARES).optional().describe("Limitar a un sub-pilar"),
    nivel: z.enum(NIVELES).optional().describe("Limitar a un nivel"),
    categoria_bucket: z.enum(BUCKETS).optional().describe("Limitar a un bucket de edad"),
    contexto: z.enum(["cancha", "casa"]).optional()
      .describe("'casa' = analizar la matriz de misiones fuera de cancha (hábitos, tareas en casa); omitido = matriz principal"),
  },
  async ({ sub_pilar, nivel, categoria_bucket, contexto }) => {
    try {
      const { data: misiones, error: misError } = await supabase
        .from("misiones")
        .select("id, pilar, nivel_objetivo, categoria_bucket, complejidad, activa, contexto");
      if (misError) throw new Error("Error consultando misiones: " + misError.message +
        (misError.message.includes("column") ? " — aplica primero la migración loop_misiones_fase1 (npx supabase db push)." : ""));

      // Buckets con atletas REALES del club (priorización de celdas)
      const { data: atletasClub, error: atlError } = await supabase
        .from("usuarios")
        .select("fecha_nacimiento")
        .eq("rol", "atleta")
        .not("fecha_nacimiento", "is", null);
      if (atlError) throw new Error("Error consultando atletas: " + atlError.message);

      const bucketsConAtletas = new Set(
        (atletasClub || [])
          .map(a => categoriaABucketBaremo(calcularCategoriaFEB(a.fecha_nacimiento)))
          .filter(Boolean)
      );

      const esCasa = contexto === "casa";
      const cobPrincipal = calcularCobertura(misiones);
      const cobCasa = calcularCoberturaCasa(misiones);

      let pendientes = esCasa
        ? cobCasa.faltantes.filter(f =>
            (!sub_pilar || f.sub_pilar === sub_pilar) &&
            (!categoria_bucket || f.bucket === categoria_bucket))
        : cobPrincipal.faltantes.filter(f =>
            (!sub_pilar || f.sub_pilar === sub_pilar) &&
            (!nivel || f.nivel === nivel) &&
            (!categoria_bucket || f.bucket === categoria_bucket));
      // Primero las celdas de buckets donde hay atletas reales
      pendientes.sort((a, b) =>
        (bucketsConAtletas.has(b.bucket) ? 1 : 0) - (bucketsConAtletas.has(a.bucket) ? 1 : 0));

      // Umbrales de los baremos como contexto de qué se mide en cada sub-pilar
      const subPilaresPedidos = sub_pilar ? [sub_pilar] : [...new Set(pendientes.map(p => p.sub_pilar))];
      let contextoBaremos = "";
      subPilaresPedidos.forEach(sp => {
        const pruebas = Object.entries(BAREMOS).filter(([, b]) => b.sub_pilar === sp);
        if (pruebas.length === 0) return;
        contextoBaremos += `\nSub-pilar "${sp}" — se mide con:\n`;
        pruebas.forEach(([key, b]) => {
          contextoBaremos += `  · ${b.label} (${key}, ${b.unidad}, ${b.tipo}): umbrales ${JSON.stringify(b.thresholds)}\n`;
        });
      });

      let prompt;
      if (esCasa) {
        prompt = `=== COBERTURA DE MISIONES DE CASA (fuera de cancha) ===\n`;
        prompt += `Celdas cubiertas: ${cobCasa.cubiertas}/${TOTAL_CELDAS_CASA()} (celda = sub-pilar × bucket; cubierta = ≥1 misión con contexto='casa' ESTRICTO y complejidad='general').\n`;
      } else {
        prompt = `=== COBERTURA DEL CATÁLOGO DE MISIONES ===\n`;
        prompt += `Celdas cubiertas: ${cobPrincipal.cubiertas}/${TOTAL_CELDAS()} (cubierta = ≥1 general Y ≥1 específica).\n`;
        prompt += `Matriz paralela de CASA: ${cobCasa.cubiertas}/${TOTAL_CELDAS_CASA()} celdas — para analizarla/redactarla pide contexto:'casa'.\n`;
      }
      prompt += `Buckets con atletas reales en el club (PRIORIDAD): ${[...bucketsConAtletas].join(", ") || "ninguno"}.\n\n`;
      prompt += `=== CELDAS FALTANTES (priorizadas) ===\n`;
      pendientes.slice(0, 30).forEach(f => {
        prompt += esCasa
          ? `- ${f.sub_pilar} × ${f.bucket} (casa)` + (bucketsConAtletas.has(f.bucket) ? "  ← ATLETAS REALES" : "") + `\n`
          : `- ${f.sub_pilar} × ${f.nivel} × ${f.bucket}` +
            ` (tiene ${f.tiene.general} general/${f.tiene.especifica} específica)` +
            (bucketsConAtletas.has(f.bucket) ? "  ← ATLETAS REALES" : "") + `\n`;
      });
      if (pendientes.length > 30) prompt += `… y ${pendientes.length - 30} celdas más (pide por sub_pilar para acotar).\n`;
      prompt += `\n=== CONTEXTO CIENTÍFICO (umbrales de baremos) ===${contextoBaremos || "\n(sin pruebas asociadas)"}\n`;
      prompt += contextoRack(
        esCasa
          ? `${subPilaresPedidos.join(" ")} trabajo casa fuera de cancha hábitos rutina video análisis diario del atleta nutrición sueño`
          : `${subPilaresPedidos.join(" ")} desarrollo capacidades edad iniciación entrenamiento`,
        { k: esCasa ? 4 : 3, titulo: "CONTEXTO DEL RACK DOCUMENTAL (fundamento para las justificaciones)" }
      );
      prompt += `
=== INSTRUCCIONES DE REDACCIÓN ===
Para cada celda faltante genera misiones con:
- titulo: motivador, máx 60 caracteres.
- descripcion: ejecutable por un chico de esa edad (bucket) sin supervisión especial.${esCasa ? `
  Al ser misión de CASA: ejecutable en casa SIN material del club ni cancha (autocarga,
  pared, balón si es razonable tenerlo, hábitos, video, diario). La dosis por edad va en
  la propia descripción (no hay nivel_objetivo).` : ""}
- justificacion: fundamento científico CON FUENTE de por qué ese trabajo mejora ese
  sub-pilar a esa edad. Prioriza las fuentes del RACK DOCUMENTAL citándolas como
  [archivo › sección]; complementa con NSCA/FitnessGram/PubMed si hace falta.
- xp_recompensa coherente con el nivel: Micro≈25, Desarrollo≈50, Elite≈75.${esCasa ? `
- contexto: 'casa' (obligatorio en esta pasada) y nivel_objetivo: null (omitir el campo).
- complejidad: 'general' (hábito auto-asignable; es lo que cuenta para la matriz casa).` : `
- complejidad: 'general' = hábito/educativa auto-asignable al atleta; 'especifica' = técnica
  que requiere criterio del coach antes de ser visible.
- contexto: opcional ('cancha' | 'casa' | 'ambos'; default 'ambos'). Marca 'cancha' solo si
  la misión exige aro/cancha/material del club.`}
- fase_temporada: opcional ('preparatoria' | 'competitiva' | 'transicion'). Etiquétala SOLO
  si el fundamento del rack es de periodización (p.ej. volumen aeróbico → preparatoria);
  si la misión vale todo el año, omítela (null = comodín).
- video_url: opcional; SOLO YouTube real y pertinente.

Cuando tengas el lote redactado, llama a la herramienta insertar_misiones_catalogo con el array JSON.
Las misiones nacen inactivas (activa=false): el coach las revisa y activa desde AdminMisiones.`;

      return { content: [{ type: "text", text: prompt }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// Tool 5: Insertar Misiones al Catálogo
server.tool(
  "insertar_misiones_catalogo",
  "Inserta en lote las misiones redactadas para el catálogo (nacen inactivas, is_ai_generated=true; el coach las activa desde AdminMisiones). Valida contra los CHECKs reales de la tabla misiones.",
  {
    misiones: z.array(z.object({
      titulo: z.string().min(5),
      descripcion: z.string().min(20),
      justificacion: z.string().min(30),
      pilar: z.enum(SUB_PILARES),
      // null/omitido = comodín de nivel (obligatorio omitirlo en misiones de casa:
      // la dosis por edad va en la descripción).
      nivel_objetivo: z.enum(NIVELES).nullable().optional(),
      categoria_bucket: z.enum(BUCKETS),
      complejidad: z.enum(["general", "especifica"]),
      xp_recompensa: z.number().int().positive(),
      contexto: z.enum(CONTEXTOS).optional().describe("Dónde se ejecuta (default 'ambos'; 'casa' para la matriz fuera de cancha)"),
      fase_temporada: z.enum(FASES_TEMPORADA).nullable().optional()
        .describe("Etiqueta de periodización; omitir si la misión vale todo el año"),
      video_url: z.string().url().optional(),
    })).min(1).describe("Lote de misiones a insertar"),
  },
  async ({ misiones }) => {
    try {
      const filas = misiones.map(m => ({
        titulo: m.titulo,
        descripcion: m.descripcion,
        justificacion: m.justificacion,
        pilar: m.pilar,
        nivel_objetivo: m.nivel_objetivo ?? null,
        categoria_bucket: m.categoria_bucket,
        complejidad: m.complejidad,
        xp_recompensa: m.xp_recompensa,
        contexto: m.contexto ?? "ambos",
        fase_temporada: m.fase_temporada ?? null,
        video_url: m.video_url ?? null,
        activa: false,
        is_ai_generated: true,
        condicion_trigger: "catalogo_mcp",
      }));

      const { error: insError } = await supabase.from("misiones").insert(filas);
      if (insError) {
        throw new Error("Error insertando misiones: " + insError.message +
          (insError.message.includes("column") ? " — aplica primero la migración loop_misiones_fase1 (npx supabase db push)." : ""));
      }

      // Recalcular cobertura post-insert (ambas matrices)
      const { data: todas } = await supabase
        .from("misiones")
        .select("id, pilar, nivel_objetivo, categoria_bucket, complejidad, activa, contexto");
      const { cubiertas } = calcularCobertura(todas);
      const casa = calcularCoberturaCasa(todas);

      return {
        content: [{
          type: "text",
          text: `✅ ${filas.length} misión(es) insertada(s) con activa=false (pendientes de curaduría del coach en AdminMisiones).\nCobertura matriz principal: ${cubiertas}/${TOTAL_CELDAS()} celdas. Matriz casa: ${casa.cubiertas}/${TOTAL_CELDAS_CASA()} celdas.`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// Tool 7: Insertar Misiones de Recuperación al Catálogo
server.tool(
  "insertar_misiones_recuperacion",
  "Inserta misiones de recuperación (pilar='recuperacion', nivel/bucket agnósticos) que analyze_athlete_readiness recomendará cuando el atleta tenga alertas de sueño/fatiga/hidratación/carga. Nacen inactivas (activa=false); el coach las activa desde AdminMisiones. Son la contraparte de contenido del motor de recuperación.",
  {
    misiones: z.array(z.object({
      titulo: z.string().min(5),
      descripcion: z.string().min(20),
      justificacion: z.string().min(30).describe("Fundamento científico con fuente (higiene de sueño, hidratación, recuperación activa, gestión de carga)."),
      condicion_trigger: z.enum(RECUPERACION_TRIGGERS).describe("Condición de recuperación que activa la misión (la produce el motor compartido)."),
      complejidad: z.enum(["general", "especifica"]).default("general").describe("'general' = hábito auto-asignable al atleta; 'especifica' = requiere criterio del coach."),
      xp_recompensa: z.number().int().positive(),
      video_url: z.string().url().optional(),
    })).min(1).describe("Lote de misiones de recuperación a insertar"),
  },
  async ({ misiones }) => {
    try {
      const filas = misiones.map(m => ({
        titulo: m.titulo,
        descripcion: m.descripcion,
        justificacion: m.justificacion,
        pilar: "recuperacion",
        // Recuperación es agnóstica de nivel/edad: aplica a todos (null = comodín).
        nivel_objetivo: null,
        categoria_bucket: null,
        complejidad: m.complejidad ?? "general",
        condicion_trigger: m.condicion_trigger,
        xp_recompensa: m.xp_recompensa,
        // Los hábitos de sueño/hidratación/descarga se ejecutan fuera de la cancha.
        contexto: "casa",
        video_url: m.video_url ?? null,
        activa: false,
        is_ai_generated: true,
      }));

      const { error: insError } = await supabase.from("misiones").insert(filas);
      if (insError) {
        throw new Error("Error insertando misiones de recuperación: " + insError.message);
      }

      return {
        content: [{
          type: "text",
          text: `✅ ${filas.length} misión(es) de recuperación insertada(s) con activa=false (pendientes de curaduría del coach en AdminMisiones). Triggers: ${[...new Set(filas.map(f => f.condicion_trigger))].join(", ")}.`,
        }],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ============================================================
// AUTORÍA DE PRUEBAS DE EVALUACIÓN + BAREMOS (fase P1.5):
// el MCP propone pruebas con umbrales fundamentados en la guía
// metodológica ecuatoriana (Vinueza, knowledge/) y las inserta en
// catalogo_ejercicios. Cubre los 3 pilares / 8 sub-pilares del radar.
// ============================================================

const KNOWLEDGE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "knowledge");
const DOC_METODOLOGIA = path.join(KNOWLEDGE_DIR, "fundamentos_iniciacion_vinueza.md");

const SUB_PILARES_PRUEBAS = SUB_PILARES;
const GENEROS = ["Masculino", "Femenino"];
const BUCKETS_PRUEBA = [...BUCKETS, "Todas"];

const pilarDeSubPilar = (subPilar) => getSubPilar(subPilar)?.pilar ?? null;

// --- Validación estructural de thresholds (mismas convenciones que resolverUmbrales) ---
function validarCortes(arr, ruta) {
  if (!Array.isArray(arr) || arr.length !== 4 || !arr.every(Number.isFinite)) {
    return `${ruta}: debe ser un array de exactamente 4 números [t1,t2,t3,t4]`;
  }
  for (let i = 1; i < 4; i++) {
    if (arr[i] <= arr[i - 1]) return `${ruta}: los cortes deben ser estrictamente ascendentes (t1<t2<t3<t4; también en pruebas menos_es_mejor, ej. lane_agility [13.0,13.9,14.9,16.0])`;
  }
  return null;
}

function validarPorBucket(obj, ruta) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return `${ruta}: debe ser un objeto { bucket: cortes }`;
  const keys = Object.keys(obj);
  if (keys.length === 0) return `${ruta}: sin buckets definidos`;
  for (const k of keys) {
    if (!BUCKETS_PRUEBA.includes(k)) return `${ruta}.${k}: bucket desconocido (usa ${BUCKETS_PRUEBA.join("/")})`;
    const v = obj[k];
    if (Array.isArray(v)) {
      const e = validarCortes(v, `${ruta}.${k}`);
      if (e) return e;
    } else if (v && typeof v === "object") {
      const niveles = Object.keys(v);
      if (niveles.length === 0) return `${ruta}.${k}: objeto por nivel vacío`;
      for (const n of niveles) {
        if (!NIVELES.includes(n)) return `${ruta}.${k}.${n}: nivel desconocido (usa ${NIVELES.join("/")})`;
        const e = validarCortes(v[n], `${ruta}.${k}.${n}`);
        if (e) return e;
      }
    } else {
      return `${ruta}.${k}: debe ser un array de 4 cortes o un objeto { Micro/Desarrollo/Elite: cortes }`;
    }
  }
  return null;
}

function validarThresholds(t) {
  if (!t || typeof t !== "object" || Array.isArray(t)) return "thresholds: debe ser un objeto";
  const keys = Object.keys(t);
  const conGenero = keys.filter(k => GENEROS.includes(k));
  if (conGenero.length > 0) {
    if (conGenero.length !== keys.length) return "thresholds: no mezcles claves de género (Masculino/Femenino) con claves de bucket en el mismo nivel";
    for (const g of conGenero) {
      const e = validarPorBucket(t[g], `thresholds.${g}`);
      if (e) return e;
    }
    return null;
  }
  return validarPorBucket(t, "thresholds");
}

// Tool 8: Consultar la guía metodológica de iniciación (Vinueza, Ecuador)
server.tool(
  "consultar_metodologia_iniciacion",
  "Devuelve COMPLETA la guía metodológica de referencia del club para iniciación deportiva ('Fundamentos Técnico Metodológicos de la Planificación del Entrenamiento en la Iniciación Deportiva', Edwin Vinueza Tapia, Ecuador): fases sensibles por edad, pruebas de detección con normas ecuatorianas, dimorfismo sexual, planificación y sistema de evaluación. Para una búsqueda dirigida por tema sobre TODO el rack documental (esta guía + baremos + entrenamiento + táctica + mentalidad + referencias) usa consultar_rack.",
  {},
  async () => {
    try {
      const texto = fs.readFileSync(DOC_METODOLOGIA, "utf8");
      return { content: [{ type: "text", text: texto }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error leyendo la guía metodológica (${DOC_METODOLOGIA}): ${err.message}` }] };
    }
  }
);

// ============================================================
// RACK DOCUMENTAL DEPORTIVO (packages/brain-core/rack.js + knowledge/):
// corpus indexado (BM25) de la documentación específica del
// deporte — metodología de iniciación, baremos científicos,
// entrenamiento, táctica, mentalidad, referencias. Las tools
// analíticas y de autoría le inyectan contexto automáticamente;
// estas dos lo exponen para consulta directa.
// ============================================================

// Tool 13: Consultar el rack documental
server.tool(
  "consultar_rack",
  "Busca en el rack documental deportivo del club (guía metodológica Vinueza, baremos científicos, manual de entrenamiento, táctica, mentalidad, referencias académicas y documentos extra del staff) y devuelve los fragmentos más relevantes con su cita [archivo › sección]. Úsala para fundamentar diagnósticos, misiones, pruebas o decisiones de planificación en las fuentes del club.",
  {
    consulta: z.string().min(3).describe("Tema o pregunta (español; el índice cruza también términos en inglés de los baremos)"),
    area: z.enum(["metodologia", "baremos", "entrenamiento", "tactica", "mentalidad", "referencias", "extra"]).optional()
      .describe("Limitar la búsqueda a un área del rack"),
    sub_pilar: z.enum(TODAS_LAS_KEYS_SUBPILAR).optional()
      .describe("Limitar a fragmentos etiquetados con un sub-pilar de la taxonomía (además boostea el ranking)"),
    k: z.number().int().min(1).max(10).optional().describe("Cuántos fragmentos devolver (default 5)"),
  },
  async ({ consulta, area, sub_pilar, k }) => {
    try {
      const hits = buscarRack(consulta, { k: k ?? 5, area: area ?? null, subpilar: sub_pilar ?? null });
      if (hits.length === 0) {
        return { content: [{ type: "text", text: `Sin resultados en el rack para "${consulta}"${area ? ` (área ${area})` : ""}${sub_pilar ? ` (sub-pilar ${sub_pilar})` : ""}. Prueba con otros términos o revisa el inventario con listar_rack.` }] };
      }
      let out = `=== RACK DOCUMENTAL — ${hits.length} fragmento(s) para "${consulta}" ===\n`;
      hits.forEach(h => {
        const tags = h.subpilares?.length ? `, sub-pilares: ${h.subpilares.join("/")}` : "";
        out += `\n[${h.archivo} › ${h.seccion}] (área ${h.area}${tags}, score ${h.score})\n${h.texto}\n`;
      });
      return { content: [{ type: "text", text: out }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error consultando el rack: ${err.message}` }] };
    }
  }
);

// Tool 14: Inventario del rack documental
server.tool(
  "listar_rack",
  "Devuelve el inventario del rack documental deportivo: qué documentos hay, de qué área (metodologia/baremos/entrenamiento/tactica/mentalidad/referencias/extra), cuántas secciones y fragmentos indexa cada uno. Útil para saber qué fuentes existen antes de consultar o para detectar qué documentación falta incorporar a knowledge/.",
  {},
  async () => {
    try {
      const inv = inventarioRack();
      let out = `=== INVENTARIO DEL RACK DOCUMENTAL ===\n`;
      out += `${inv.documentos.length} documento(s), ${inv.totalFragmentos} fragmento(s) indexados. Áreas: ${inv.areas.join(", ")}.\n`;
      inv.documentos.forEach(d => {
        out += `\n- [${d.area}] ${d.archivo} — "${d.titulo}"\n  ${d.secciones} secciones, ${d.fragmentos} fragmentos, ~${Math.round(d.caracteres / 1000)} k caracteres`;
      });
      out += `\n\nPara añadir documentación: colocar .md/.txt en blackgold-mcp/knowledge/ (o declararla en knowledge/rack.config.json; carpetas personales via env RACK_DIRS). Ver knowledge/README.md.`;
      return { content: [{ type: "text", text: out }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error listando el rack: ${err.message}` }] };
    }
  }
);

// Tool 15: Mapa de conocimiento por pilar/sub-pilar
server.tool(
  "mapa_conocimiento",
  "Devuelve el mapa semántico de la taxonomía del club: por cada sub-pilar, su pilar y peso, los documentos/fragmentos del rack etiquetados con él, las pruebas con baremo que lo miden, y cuántas misiones y ejercicios de catálogo lo cubren — señalando los HUECOS (sub-pilares sin conocimiento, sin pruebas o sin misiones). Es la vista pilar → conocimiento → pruebas → misiones para auditar la salud del corpus y del catálogo.",
  {
    pilar: z.enum(PILARES.map(p => p.key)).optional().describe("Limitar a un pilar (fisico/tecnico/mental)"),
    sub_pilar: z.enum(TODAS_LAS_KEYS_SUBPILAR).optional().describe("Limitar a un sub-pilar"),
  },
  async ({ pilar, sub_pilar }) => {
    try {
      const inv = inventarioRack();

      // Misiones y ejercicios del catálogo (tolerante a fallo de red: el mapa
      // sigue sirviendo con rack + baremos aunque Supabase no responda).
      let misionesPorPilar = null;
      let ejerciciosPorSubPilar = null;
      try {
        const [{ data: mis }, { data: ejs }] = await Promise.all([
          supabase.from("misiones").select("pilar, activa"),
          supabase.from("catalogo_ejercicios").select("sub_pilar"),
        ]);
        if (mis) {
          misionesPorPilar = {};
          mis.forEach(m => {
            if (!misionesPorPilar[m.pilar]) misionesPorPilar[m.pilar] = { total: 0, activas: 0 };
            misionesPorPilar[m.pilar].total++;
            if (m.activa) misionesPorPilar[m.pilar].activas++;
          });
        }
        if (ejs) {
          ejerciciosPorSubPilar = {};
          ejs.forEach(e => { ejerciciosPorSubPilar[e.sub_pilar] = (ejerciciosPorSubPilar[e.sub_pilar] || 0) + 1; });
        }
      } catch (err) {
        console.error(`[mapa_conocimiento] Supabase no disponible (se continúa con rack/baremos): ${err.message}`);
      }

      const objetivo = [...SUB_PILARES_TAXONOMIA, ...SUB_PILARES_MONITOREO]
        .filter(s => (!sub_pilar || s.key === sub_pilar) && (!pilar || s.pilar === pilar));

      let out = `=== MAPA DE CONOCIMIENTO (taxonomía → rack → pruebas → misiones) ===\n`;
      const huecos = [];
      for (const s of objetivo) {
        const p = s.pilar ? getPilar(s.pilar) : null;
        out += `\n■ ${s.key} — "${s.label}"` +
          (p ? ` · pilar ${p.key} (${Math.round(p.peso * 100)}% del overall)` : " · monitoreo (no puntúa en radar/overall)") + `\n`;

        const docsEtiquetados = inv.documentos.filter(d => (d.subpilares || []).includes(s.key));
        const nChunks = (inv.porSubPilar && inv.porSubPilar[s.key]) || 0;
        out += `  Conocimiento del rack: ${nChunks} fragmento(s) etiquetado(s)` +
          (docsEtiquetados.length ? ` en ${docsEtiquetados.map(d => d.archivo).join(", ")}` : "") + `\n`;
        const hits = buscarRack(`${s.label} ${s.key}`, { k: 3, subpilar: s.key });
        hits.forEach(h => { out += `    · [${h.archivo} › ${h.seccion}]\n`; });

        const pruebas = Object.entries(BAREMOS).filter(([, b]) => b.sub_pilar === s.key);
        out += `  Pruebas con baremo: ${pruebas.length ? pruebas.map(([key, b]) => `${b.label} (${key})`).join(", ") : "NINGUNA"}\n`;

        const m = misionesPorPilar ? (misionesPorPilar[s.key] || { total: 0, activas: 0 }) : null;
        const e = ejerciciosPorSubPilar ? (ejerciciosPorSubPilar[s.key] || 0) : null;
        out += `  Misiones: ${m ? `${m.total} (${m.activas} activas)` : "(Supabase no disponible)"} · Ejercicios de catálogo: ${e ?? "(Supabase no disponible)"}\n`;

        if (nChunks === 0) huecos.push(`${s.key}: sin conocimiento etiquetado en el rack (engordar corpus o etiquetar docs)`);
        if (s.pilar && pruebas.length === 0) huecos.push(`${s.key}: sin pruebas con baremo (generar_catalogo_pruebas)`);
        if (s.pilar && m && m.total === 0) huecos.push(`${s.key}: sin misiones en el catálogo (generar_catalogo_misiones)`);
      }

      if (inv.avisos && inv.avisos.length) {
        out += `\n⚠️ Avisos del rack:\n${inv.avisos.map(a => `  - ${a}`).join("\n")}\n`;
      }
      out += `\n=== HUECOS ===\n` +
        (huecos.length ? huecos.map(h => `- ${h}`).join("\n") : "Sin huecos: cada sub-pilar tiene conocimiento, pruebas y misiones.");

      return { content: [{ type: "text", text: out }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error generando el mapa de conocimiento: ${err.message}` }] };
    }
  }
);

// Tool 9: Generar Catálogo de Pruebas de Evaluación
server.tool(
  "generar_catalogo_pruebas",
  "Analiza la cobertura del catálogo de pruebas de evaluación (catalogo_ejercicios) por sub-pilar — los 8 sub-pilares del radar — detectando huecos y pruebas con umbrales irresolubles, y devuelve las instrucciones para redactar las pruebas/baremos faltantes fundamentadas en la guía metodológica ecuatoriana (Vinueza). Tras redactarlas y validarlas con el cuerpo técnico, insertarlas con insertar_pruebas_evaluacion.",
  {
    sub_pilar: z.enum(SUB_PILARES_PRUEBAS).optional().describe("Limitar el análisis a un sub-pilar"),
  },
  async ({ sub_pilar }) => {
    try {
      const { data: pruebas, error: prError } = await supabase
        .from("catalogo_ejercicios")
        .select("nombre, pilar, sub_pilar, unidad, thresholds");
      if (prError) throw new Error("Error consultando catalogo_ejercicios: " + prError.message);

      // Distribución real del club (para priorizar buckets/niveles/género con atletas)
      const [{ data: usuariosAtletas }, { data: atletasNivel }] = await Promise.all([
        supabase.from("usuarios").select("fecha_nacimiento, genero").eq("rol", "atleta").not("fecha_nacimiento", "is", null),
        supabase.from("atletas").select("nivel_desarrollo"),
      ]);
      const bucketsConAtletas = new Set(
        (usuariosAtletas || []).map(a => categoriaABucketBaremo(calcularCategoriaFEB(a.fecha_nacimiento))).filter(Boolean)
      );
      const generosClub = {};
      (usuariosAtletas || []).forEach(a => { const g = a.genero || "Masculino"; generosClub[g] = (generosClub[g] || 0) + 1; });
      const nivelesClub = {};
      (atletasNivel || []).forEach(a => { const n = a.nivel_desarrollo || "(sin nivel)"; nivelesClub[n] = (nivelesClub[n] || 0) + 1; });

      // Una prueba está "viva" si su thresholds resuelve en algún bucket (con defaults).
      const resuelve = (t) => BUCKETS.some(b => resolverUmbrales(t, { bucket: b }) !== null);
      const segmentadaPorNivel = (t) => JSON.stringify(t || {}).includes('"Micro"') || JSON.stringify(t || {}).includes('"Elite"');

      const porSubPilar = {};
      const fueraDeTaxonomia = [];
      (pruebas || []).forEach(p => {
        if (SUB_PILARES_PRUEBAS.includes(p.sub_pilar)) {
          if (!porSubPilar[p.sub_pilar]) porSubPilar[p.sub_pilar] = { total: 0, vivas: 0, porNivel: 0, muertas: [] };
          const s = porSubPilar[p.sub_pilar];
          s.total++;
          if (resuelve(p.thresholds)) s.vivas++;
          else s.muertas.push(p.nombre);
          if (segmentadaPorNivel(p.thresholds)) s.porNivel++;
        } else {
          fueraDeTaxonomia.push(`${p.nombre} (sub_pilar='${p.sub_pilar}')`);
        }
      });

      const objetivo = sub_pilar ? [sub_pilar] : SUB_PILARES_PRUEBAS;
      let out = `=== COBERTURA DEL CATÁLOGO DE PRUEBAS (catalogo_ejercicios) ===\n`;
      out += `Buckets con atletas reales (PRIORIDAD): ${[...bucketsConAtletas].join(", ") || "ninguno"}.\n`;
      out += `Atletas por género: ${Object.entries(generosClub).map(([g, n]) => `${g} ${n}`).join(", ") || "sin datos"}.\n`;
      out += `Atletas por nivel de desarrollo: ${Object.entries(nivelesClub).map(([n, c]) => `${n} ${c}`).join(", ") || "sin datos"}.\n\n`;

      objetivo.forEach(sp => {
        const s = porSubPilar[sp] || { total: 0, vivas: 0, porNivel: 0, muertas: [] };
        const pilar = pilarDeSubPilar(sp);
        out += `- ${sp} (pilar ${pilar}): ${s.total} prueba(s), ${s.vivas} con umbrales resolubles, ${s.porNivel} segmentada(s) por nivel`;
        if (s.muertas.length) out += `\n    · umbrales irresolubles (revisar/reescribir): ${s.muertas.join("; ")}`;
        out += `\n`;
      });

      if (fueraDeTaxonomia.length && !sub_pilar) {
        out += `\n⚠️ Pruebas con sub_pilar FUERA de la taxonomía (no puntúan en ningún eje del radar; candidatas a reclasificar):\n`;
        fueraDeTaxonomia.forEach(p => { out += `  · ${p}\n`; });
      }

      // Contexto metodológico recuperado del rack (antes era texto fijo en el
      // código); la regla de oro se mantiene explícita como línea propia.
      const ctxMetodologico = contextoRack(
        `detección talentos batería pruebas normas fases sensibles dimorfismo ${objetivo.join(" ")}`,
        { k: 4, maxChars: 3200, titulo: "CONTEXTO METODOLÓGICO (rack documental — consultar_rack para profundizar)" }
      );
      out += ctxMetodologico ||
        `\n=== CONTEXTO METODOLÓGICO ===\n(rack documental no disponible — usa consultar_metodologia_iniciacion para la guía Vinueza completa)\n`;
      out += `\nREGLA DE ORO: preferir normas basadas en POBLACIÓN ECUATORIANA (guía Vinueza, mismo contexto del club) a baremos importados cuando cubran la edad/prueba; usar la capa de género de thresholds cuando el dimorfismo documentado lo amerite.\n`;

      out += `
=== INSTRUCCIONES DE REDACCIÓN ===
Para cada prueba faltante define:
- nombre, descripcion (qué capacidad mide), protocolo (ejecución paso a paso medible en cancha).
- justificacion: fundamento científico CON FUENTE — cita el rack documental como [archivo › sección] (Vinueza para normas ecuatorianas; NSCA/FitnessGram/PubMed como complemento).
- sub_pilar canónico (${SUB_PILARES_PRUEBAS.join("/")}), unidad, tipo ('mas_es_mejor' | 'menos_es_mejor').
- thresholds con 4 cortes ascendentes [t1,t2,t3,t4] por bucket (Sub12/Sub15/Sub18/Senior o 'Todas'), opcionalmente segmentados:
    · por nivel de desarrollo: { "Sub15": { "Micro": [...], "Desarrollo": [...], "Elite": [...] } } (REQUISITO del club para pruebas nuevas)
    · por género: { "Masculino": { ... }, "Femenino": { ... } } cuando el dimorfismo aplique (Vinueza 2002).

⚠️ Las pruebas insertadas aparecen INMEDIATAMENTE en la Evaluación Científica (no hay flag de curaduría en catalogo_ejercicios): insértalas solo tras validar los cortes con el owner/cuerpo técnico. Cuando el lote esté validado, llama a insertar_pruebas_evaluacion.`;

      return { content: [{ type: "text", text: out }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// Tool 10: Insertar Pruebas de Evaluación al Catálogo
server.tool(
  "insertar_pruebas_evaluacion",
  "Inserta en lote pruebas de evaluación con sus baremos en catalogo_ejercicios. Valida sub_pilar contra la taxonomía, y thresholds contra las convenciones del motor (bucket→[t1,t2,t3,t4] ascendentes; capas opcionales por género Masculino/Femenino y por nivel Micro/Desarrollo/Elite). ATENCIÓN: quedan visibles de inmediato en la Evaluación Científica — insertar solo baremos ya validados con el cuerpo técnico.",
  {
    pruebas: z.array(z.object({
      nombre: z.string().min(4),
      descripcion: z.string().min(20).describe("Qué capacidad mide y por qué importa en baloncesto formativo."),
      protocolo: z.string().min(20).describe("Ejecución paso a paso, medible en cancha con material simple."),
      justificacion: z.string().min(30).describe("Fundamento científico CON FUENTE (Vinueza / NSCA / FitnessGram / PubMed). Se anexa a la descripción."),
      sub_pilar: z.enum(SUB_PILARES_PRUEBAS),
      tren: z.enum(["superior", "inferior"]).optional().describe("Solo si la prueba es específica de un tren."),
      unidad: z.string().min(1).describe("Unidad de medida (reps, seg, cm, m, ml/kg/min…)"),
      tipo: z.enum(["mas_es_mejor", "menos_es_mejor"]),
      thresholds: z.record(z.string(), z.any()).describe("Cortes por bucket FEB, con capas opcionales de género y nivel de desarrollo. Ver generar_catalogo_pruebas."),
      inputs_requeridos: z.array(z.object({ id: z.string(), label: z.string() })).optional()
        .describe("Solo para pruebas multi-input (ej. bilateral izq/der). Default: input único en la unidad dada."),
    })).min(1).describe("Lote de pruebas a insertar"),
  },
  async ({ pruebas }) => {
    try {
      // Validación estructural de cada prueba antes de tocar la BD (todo o nada).
      for (const p of pruebas) {
        const e = validarThresholds(p.thresholds);
        if (e) throw new Error(`Prueba "${p.nombre}" — ${e}`);
      }

      const filas = pruebas.map(p => ({
        nombre: p.nombre,
        descripcion: `${p.descripcion}\n\nFundamento: ${p.justificacion}`,
        descripcion_ejecucion: p.protocolo,
        pilar: pilarDeSubPilar(p.sub_pilar),
        sub_pilar: p.sub_pilar,
        tren: p.tren ?? null,
        unidad: p.unidad,
        tipo: p.tipo,
        invertido: p.tipo === "menos_es_mejor",
        thresholds: p.thresholds,
        inputs_requeridos: p.inputs_requeridos ?? [{ id: "unico", label: `Medida en ${p.unidad}` }],
        club_id: null, // visible globalmente (club único hoy)
      }));

      const { error: insError } = await supabase.from("catalogo_ejercicios").insert(filas);
      if (insError) throw new Error("Error insertando pruebas: " + insError.message);

      let msg = `✅ ${filas.length} prueba(s) insertada(s) en catalogo_ejercicios — ya visibles en la Evaluación Científica.\n`;
      msg += filas.map(f => `- ${f.nombre} → ${f.pilar}/${f.sub_pilar} (${f.tipo}, ${f.unidad})`).join("\n");
      return { content: [{ type: "text", text: msg }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ============================================================
// DESCRIPCIONES DEL CATÁLOGO DE PRUEBAS (espejo de las tools de
// misiones): el MCP redacta descripcion (qué mide + justificación
// científica con fuente) y descripcion_ejecucion (protocolo) para
// las pruebas de catalogo_ejercicios que no las tengan — tanto la
// batería estándar (baremo_key) como las creadas por el coach en
// NuevaPruebaModal. EvaluacionModal muestra ambos campos al
// seleccionar la prueba.
// ============================================================

const faltaTexto = (v) => v === null || v === undefined || String(v).trim() === "";

// Tool 11: Generar Descripciones de Pruebas
server.tool(
  "generar_descripciones_pruebas",
  "Lista las pruebas de catalogo_ejercicios sin descripcion y/o sin descripcion_ejecucion (batería estándar y pruebas creadas por el coach) con sus umbrales de baremo por bucket de edad como contexto, y devuelve las instrucciones para redactarlas con justificación científica. Tras redactarlas, guardarlas con actualizar_descripciones_pruebas.",
  {
    solo_baremo_key: z.boolean().optional().describe("true = limitar a la batería estándar (filas con baremo_key)"),
  },
  async ({ solo_baremo_key }) => {
    try {
      const { data: pruebas, error } = await supabase
        .from("catalogo_ejercicios")
        .select("id, nombre, baremo_key, pilar, sub_pilar, tren, unidad, invertido, thresholds, inputs_requeridos, descripcion, descripcion_ejecucion");
      if (error) throw new Error("Error consultando catalogo_ejercicios: " + error.message);

      const pendientes = (pruebas || []).filter(p =>
        (!solo_baremo_key || p.baremo_key) &&
        (faltaTexto(p.descripcion) || faltaTexto(p.descripcion_ejecucion))
      );

      if (pendientes.length === 0) {
        return { content: [{ type: "text", text: "✅ Todas las pruebas del catálogo ya tienen descripcion y descripcion_ejecucion." }] };
      }

      let prompt = `=== PRUEBAS SIN DESCRIPCIÓN COMPLETA: ${pendientes.length} ===\n`;
      pendientes.forEach(p => {
        prompt += `\n· "${p.nombre}" (id=${p.id})\n`;
        prompt += `  pilar=${p.pilar} sub_pilar=${p.sub_pilar}${p.tren ? ` tren=${p.tren}` : ""} · unidad=${p.unidad} · ${p.invertido ? "menos_es_mejor" : "mas_es_mejor"}\n`;
        if (p.inputs_requeridos) prompt += `  inputs: ${p.inputs_requeridos.map(i => i.label).join(" y ")} (el sistema promedia y alerta asimetría >15%)\n`;
        if (p.thresholds) prompt += `  umbrales por bucket: ${JSON.stringify(p.thresholds)}\n`;
        prompt += `  falta: ${[faltaTexto(p.descripcion) ? "descripcion" : null, faltaTexto(p.descripcion_ejecucion) ? "descripcion_ejecucion" : null].filter(Boolean).join(" + ")}\n`;
      });

      const spPendientes = [...new Set(pendientes.map(p => p.sub_pilar))];
      prompt += contextoRack(
        `${spPendientes.join(" ")} protocolo prueba medición umbrales edad`,
        { k: 3, maxChars: 2400 }
      );

      prompt += `
=== INSTRUCCIONES DE REDACCIÓN (mismo estándar que el catálogo de misiones) ===
Para cada prueba redacta:
- descripcion: qué capacidad mide y por qué importa en baloncesto formativo, con fundamento
  científico CON FUENTE (NSCA, FitnessGram, NBA Combine, PubMed — mismo estándar que
  packages/analytics-core/baremos_cientificos.md), y cómo puntúa: los umbrales del baremo
  dependen del bucket de edad (Sub12/Sub15/Sub18/Senior) derivado de la categoría FEB del
  atleta, y definen 5 tiers (Debe Mejorar → Excelente) que alimentan el overall del pilar.
- descripcion_ejecucion: protocolo ejecutable paso a paso por el coach (posición inicial,
  criterio de repetición/medida válida, intentos y qué valor registrar, en la unidad indicada).
Texto plano, 2-4 frases por campo, en español.

Cuando tengas el lote redactado, llama a actualizar_descripciones_pruebas. Por defecto solo
rellena campos vacíos (nunca pisa texto ya escrito por el coach).`;

      return { content: [{ type: "text", text: prompt }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// Tool 12: Actualizar Descripciones de Pruebas
server.tool(
  "actualizar_descripciones_pruebas",
  "Guarda en lote descripcion y/o descripcion_ejecucion de pruebas de catalogo_ejercicios. Solo escribe esos dos campos (jamás los campos científicos del sync) y por defecto solo rellena los que estén vacíos; sobrescribir=true permite reemplazar texto existente.",
  {
    pruebas: z.array(z.object({
      id: z.string().uuid(),
      descripcion: z.string().min(20).optional(),
      descripcion_ejecucion: z.string().min(20).optional(),
    })).min(1).describe("Lote de pruebas con los textos redactados"),
    sobrescribir: z.boolean().optional().describe("true = permite reemplazar textos no vacíos (default false)"),
  },
  async ({ pruebas, sobrescribir }) => {
    try {
      const resultados = [];
      for (const p of pruebas) {
        if (!p.descripcion && !p.descripcion_ejecucion) {
          resultados.push(`⚠️ ${p.id}: sin campos que actualizar, omitida.`);
          continue;
        }

        const { data: actual, error: readError } = await supabase
          .from("catalogo_ejercicios")
          .select("id, nombre, descripcion, descripcion_ejecucion")
          .eq("id", p.id)
          .single();
        if (readError || !actual) {
          resultados.push(`❌ ${p.id}: no encontrada (${readError?.message ?? "sin fila"}).`);
          continue;
        }

        const cambios = {};
        if (p.descripcion && (sobrescribir || faltaTexto(actual.descripcion))) cambios.descripcion = p.descripcion;
        if (p.descripcion_ejecucion && (sobrescribir || faltaTexto(actual.descripcion_ejecucion))) cambios.descripcion_ejecucion = p.descripcion_ejecucion;

        if (Object.keys(cambios).length === 0) {
          resultados.push(`⏭️ "${actual.nombre}": campos ya escritos, no se pisan (usa sobrescribir=true si es intencional).`);
          continue;
        }

        const { error: upError } = await supabase
          .from("catalogo_ejercicios")
          .update(cambios)
          .eq("id", p.id);
        if (upError) {
          resultados.push(`❌ "${actual.nombre}": ${upError.message}`);
          continue;
        }
        resultados.push(`✅ "${actual.nombre}": ${Object.keys(cambios).join(" + ")}`);
      }

      return { content: [{ type: "text", text: resultados.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ============================================================
// AUDITORÍA DE MISIONES (limpieza del catálogo antes de activar
// las misiones de casa): clasifica las misiones existentes
// (casa / cancha / basura) con el clasificador compartido +
// una señal semántica del rack, y devuelve acciones sugeridas.
// El par analizar→aplicar espeja generar_/actualizar_descripciones_pruebas.
// ============================================================

// Documentos del rack que delatan contenido de CANCHA (sesión presencial) vs CASA.
const DOCS_CANCHA = new Set(["manual_entrenamiento.md", "periodizacion_entrenamiento_anual.md"]);
const DOCS_CASA = new Set(["trabajo_casa_atleta.md"]);

// Tool 16: Auditar misiones (read-only)
server.tool(
  "auditar_misiones",
  "Audita el catálogo de misiones existente: por cada misión combina el clasificador de contexto (sub-pilar + señales léxicas de material/coach/formato vs autocarga/video/hábito) con una señal semántica del rack, y sugiere una acción — OK, RECLASIFICAR_CASA, RECLASIFICAR_CANCHA_DESACTIVAR (ejercicio de cancha mal ubicado como misión) o BORRAR_BASURA (IA sin justificación que describe gym). No modifica nada; para aplicar usa actualizar_misiones y eliminar_misiones_basura.",
  {
    pilar: z.enum(PILARES_MISION).optional().describe("Limitar a un pilar"),
    contexto_actual: z.enum(CONTEXTOS).optional().describe("Limitar a las misiones que hoy tienen este contexto (p.ej. 'ambos')"),
    solo_discrepancias: z.boolean().optional().describe("true = omitir las que quedan OK (contexto ya correcto)"),
  },
  async ({ pilar, contexto_actual, solo_discrepancias }) => {
    try {
      let query = supabase
        .from("misiones")
        .select("id, titulo, descripcion, pilar, quiz, is_ai_generated, justificacion, contexto, activa, categoria_bucket");
      if (pilar) query = query.eq("pilar", pilar);
      if (contexto_actual) query = query.eq("contexto", contexto_actual);
      const { data: misiones, error } = await query;
      if (error) throw new Error("Error consultando misiones: " + error.message);
      if (!misiones || misiones.length === 0) {
        return { content: [{ type: "text", text: "No hay misiones que coincidan con el filtro." }] };
      }

      const grupos = { BORRAR_BASURA: [], RECLASIFICAR_CANCHA_DESACTIVAR: [], RECLASIFICAR_CASA: [], RECLASIFICAR_AMBOS: [], OK: [] };

      for (const m of misiones) {
        const c = clasificarContextoMision(m);

        // Señal semántica del rack: ¿el contenido se parece más a sesión de cancha o a trabajo de casa?
        let señalRack = null;
        try {
          const hits = buscarRack(`${m.titulo || ""} ${m.descripcion || ""}`, { k: 2 });
          const top = hits[0];
          if (top) {
            if (DOCS_CANCHA.has(top.archivo)) señalRack = { lado: "cancha", archivo: top.archivo };
            else if (DOCS_CASA.has(top.archivo)) señalRack = { lado: "casa", archivo: top.archivo };
            else señalRack = { lado: "neutro", archivo: top.archivo };
          }
        } catch { /* rack no disponible: se ignora la señal */ }

        // Acción sugerida.
        let accion;
        if (c.esBasura) {
          accion = "BORRAR_BASURA";
        } else if (c.esCanchaNoMision) {
          accion = "RECLASIFICAR_CANCHA_DESACTIVAR";
        } else if (c.contextoSugerido !== m.contexto) {
          accion = c.contextoSugerido === "casa" ? "RECLASIFICAR_CASA"
            : c.contextoSugerido === "cancha" ? "RECLASIFICAR_CANCHA_DESACTIVAR" : "RECLASIFICAR_AMBOS";
        } else {
          accion = "OK";
        }

        grupos[accion].push({ m, c, señalRack });
      }

      const nombreLinea = (item) => {
        const { m, c, señalRack } = item;
        const rk = señalRack ? ` · rack→${señalRack.lado} (${señalRack.archivo})` : "";
        return `  · [${m.id}] "${m.titulo}" (pilar ${m.pilar}, contexto ${m.contexto}→${c.contextoSugerido}, conf ${c.confianza}${rk})\n      señales: ${c.señales.join(" | ") || "—"}`;
      };

      let out = `=== AUDITORÍA DE MISIONES (${misiones.length} analizadas${pilar ? `, pilar=${pilar}` : ""}${contexto_actual ? `, contexto=${contexto_actual}` : ""}) ===\n`;
      out += `Resumen: BORRAR_BASURA ${grupos.BORRAR_BASURA.length} · RECLASIFICAR_CANCHA_DESACTIVAR ${grupos.RECLASIFICAR_CANCHA_DESACTIVAR.length} · RECLASIFICAR_CASA ${grupos.RECLASIFICAR_CASA.length} · RECLASIFICAR_AMBOS ${grupos.RECLASIFICAR_AMBOS.length} · OK ${grupos.OK.length}\n`;

      const ordenGrupos = ["BORRAR_BASURA", "RECLASIFICAR_CANCHA_DESACTIVAR", "RECLASIFICAR_CASA", "RECLASIFICAR_AMBOS"];
      if (!solo_discrepancias) ordenGrupos.push("OK");
      for (const g of ordenGrupos) {
        if (grupos[g].length === 0) continue;
        out += `\n### ${g} (${grupos[g].length})\n`;
        out += grupos[g].map(nombreLinea).join("\n") + "\n";
      }

      // Payloads listos para aplicar (el humano revisa antes de ejecutar).
      const idsBasura = grupos.BORRAR_BASURA.map(i => i.m.id);
      const upCancha = grupos.RECLASIFICAR_CANCHA_DESACTIVAR.map(i => ({ id: i.m.id, contexto: "cancha", activa: false }));
      const upCasa = grupos.RECLASIFICAR_CASA.map(i => ({ id: i.m.id, contexto: "casa" }));
      const upAmbos = grupos.RECLASIFICAR_AMBOS.map(i => ({ id: i.m.id, contexto: "ambos" }));

      out += `\n=== PARA APLICAR (revisar antes) ===\n`;
      out += `• eliminar_misiones_basura → ids: ${JSON.stringify(idsBasura)}\n`;
      out += `• actualizar_misiones → misiones: ${JSON.stringify([...upCancha, ...upCasa, ...upAmbos])}\n`;
      out += `\nNota: RECLASIFICAR_CANCHA_DESACTIVAR marca contexto='cancha' y activa=false (sale del flujo de misiones, se conserva). BORRAR_BASURA solo borra si la misión no tiene progreso de atletas (la salvaguarda vive en eliminar_misiones_basura). La decisión final es del coach.`;

      return { content: [{ type: "text", text: out }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// Tool 17: Actualizar misiones por id (aplicar la auditoría / editar catálogo)
server.tool(
  "actualizar_misiones",
  "Actualiza misiones por id: contexto, activa, pilar, video_url, fase_temporada (decisión explícita: se aplican si vienen) y descripcion/justificacion (solo rellenan vacío salvo sobrescribir=true). Es la contraparte de aplicar de auditar_misiones y sirve también para corregir el catálogo (p.ej. añadir el link de YouTube).",
  {
    misiones: z.array(z.object({
      id: z.string().uuid(),
      contexto: z.enum(CONTEXTOS).optional(),
      activa: z.boolean().optional(),
      pilar: z.enum(PILARES_MISION).optional(),
      video_url: z.string().url().nullable().optional(),
      fase_temporada: z.enum(FASES_TEMPORADA).nullable().optional(),
      descripcion: z.string().min(20).optional(),
      justificacion: z.string().min(30).optional(),
    })).min(1).describe("Lote de misiones a actualizar por id"),
    sobrescribir: z.boolean().optional().describe("true = permite reemplazar descripcion/justificacion no vacías (default false)"),
  },
  async ({ misiones, sobrescribir }) => {
    try {
      const resultados = [];
      for (const p of misiones) {
        const { data: actual, error: readError } = await supabase
          .from("misiones")
          .select("id, titulo, descripcion, justificacion, contexto, activa, pilar, video_url, fase_temporada")
          .eq("id", p.id)
          .single();
        if (readError || !actual) {
          resultados.push(`❌ ${p.id}: no encontrada (${readError?.message ?? "sin fila"}).`);
          continue;
        }

        const cambios = {};
        // Campos de decisión explícita: se aplican si vienen (aunque ya tengan valor).
        if (p.contexto !== undefined) cambios.contexto = p.contexto;
        if (p.activa !== undefined) cambios.activa = p.activa;
        if (p.pilar !== undefined) cambios.pilar = p.pilar;
        if (p.video_url !== undefined) cambios.video_url = p.video_url;
        if (p.fase_temporada !== undefined) cambios.fase_temporada = p.fase_temporada;
        // Campos de texto: solo rellenan vacío salvo sobrescribir.
        if (p.descripcion && (sobrescribir || faltaTexto(actual.descripcion))) cambios.descripcion = p.descripcion;
        if (p.justificacion && (sobrescribir || faltaTexto(actual.justificacion))) cambios.justificacion = p.justificacion;

        if (Object.keys(cambios).length === 0) {
          resultados.push(`⏭️ "${actual.titulo}": nada que cambiar (campos de texto ya escritos; usa sobrescribir=true si es intencional).`);
          continue;
        }

        const { error: upError } = await supabase.from("misiones").update(cambios).eq("id", p.id);
        if (upError) {
          resultados.push(`❌ "${actual.titulo}": ${upError.message}`);
          continue;
        }
        resultados.push(`✅ "${actual.titulo}": ${Object.keys(cambios).join(" + ")}`);
      }
      return { content: [{ type: "text", text: resultados.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// Tool 18: Eliminar misiones basura (borrado con salvaguarda)
server.tool(
  "eliminar_misiones_basura",
  "Borra DEFINITIVAMENTE misiones por id, con salvaguardas: solo borra las que existen, son is_ai_generated=true y NO tienen filas en progreso_misiones (asignaciones/completadas de atletas). Las que tienen progreso se PROTEGEN (no se borran; se sugiere desactivar). Pensada para las misiones basura de IA detectadas por auditar_misiones.",
  {
    ids: z.array(z.string().uuid()).min(1).describe("Ids de misiones a borrar"),
    permitir_no_ia: z.boolean().optional().describe("true = permite borrar aunque is_ai_generated no sea true (default false, protege el trabajo del coach)"),
  },
  async ({ ids, permitir_no_ia }) => {
    try {
      const resultados = [];
      let borradas = 0;
      for (const id of ids) {
        const { data: m, error: readError } = await supabase
          .from("misiones")
          .select("id, titulo, is_ai_generated")
          .eq("id", id)
          .single();
        if (readError || !m) {
          resultados.push(`❌ ${id}: no encontrada.`);
          continue;
        }
        if (!m.is_ai_generated && !permitir_no_ia) {
          resultados.push(`🛡️ "${m.titulo}": NO es is_ai_generated → protegida (usa permitir_no_ia=true si es intencional).`);
          continue;
        }
        const { count, error: cntError } = await supabase
          .from("progreso_misiones")
          .select("id", { count: "exact", head: true })
          .eq("mision_id", id);
        if (cntError) {
          resultados.push(`❌ "${m.titulo}": no se pudo verificar progreso (${cntError.message}) → NO se borra.`);
          continue;
        }
        if ((count ?? 0) > 0) {
          resultados.push(`🛡️ "${m.titulo}": tiene ${count} progreso(s) de atleta → protegida (desactívala con actualizar_misiones en vez de borrar).`);
          continue;
        }
        const { error: delError } = await supabase.from("misiones").delete().eq("id", id);
        if (delError) {
          resultados.push(`❌ "${m.titulo}": ${delError.message}`);
          continue;
        }
        borradas++;
        resultados.push(`🗑️ "${m.titulo}": borrada.`);
      }
      return { content: [{ type: "text", text: `Borradas: ${borradas}/${ids.length}\n${resultados.join("\n")}` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Black Gold MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
