import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { calcularCategoriaFEB } from "../../packages/analytics-core/categoriaFEB.js";
import { BAREMOS, categoriaABucketBaremo } from "../../packages/analytics-core/baremos.js";

// Resuelto contra la ubicación del script, no contra process.cwd(): un cliente MCP
// (Claude Code, Claude Desktop) lanza este proceso con el cwd del host, no de este paquete.
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const server = new McpServer({
  name: "blackgold-mcp",
  version: "1.0.0"
});

// Tool 1: Analyze Athlete Pillars
server.tool(
  "analyze_athlete_pillars",
  "Genera un resumen analítico de los 7 pilares de un atleta basado en sus evaluaciones físicas, técnicas y percepciones subjetivas.",
  {
    athlete_id: z.string().describe("UUID del atleta a evaluar")
  },
  async ({ athlete_id }) => {
    try {
      // Obtener el atleta. `athlete_id` es atletas.id (la misma FK que usa
      // evaluaciones_pruebas.atleta_id más abajo) — se hace join a usuarios para el
      // nombre y la fecha de nacimiento. La categoría se deriva con
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

      const categoria = calcularCategoriaFEB(atleta.usuarios.fecha_nacimiento) || "Sin categoría";

      // Obtener evaluaciones recientes
      const { data: evaluaciones, error: evalError } = await supabase
        .from("evaluaciones_pruebas")
        .select("*")
        .eq("atleta_id", athlete_id)
        .order("created_at", { ascending: false })
        .limit(20);
        
      if (evalError) throw new Error("Error al obtener evaluaciones: " + evalError.message);

      let pilarStats = {};
      let notasSubjetivas = [];

      evaluaciones.forEach(ev => {
        if (!pilarStats[ev.sub_pilar]) {
          pilarStats[ev.sub_pilar] = { count: 0, sumScore: 0, currentTier: ev.tier };
        }
        pilarStats[ev.sub_pilar].count++;
        pilarStats[ev.sub_pilar].sumScore += ev.puntuacion_normalizada || 0;
        if (ev.notas) notasSubjetivas.push(`[${ev.sub_pilar}] ${ev.notas}`);
      });

      let promptInfo = `Atleta: ${atleta.usuarios.nombre} (${categoria})\n`;
      promptInfo += "--- RESULTADOS POR SUB-PILAR ---\n";
      for (const pilar in pilarStats) {
        let avg = Math.round(pilarStats[pilar].sumScore / pilarStats[pilar].count);
        promptInfo += `- ${pilar.toUpperCase()}: Promedio ${avg}/100 (Último tier: ${pilarStats[pilar].currentTier})\n`;
      }
      
      promptInfo += "\n--- NOTAS SUBJETIVAS (Coach/Atleta) ---\n";
      promptInfo += notasSubjetivas.length ? notasSubjetivas.join("\n") : "Sin notas.";
      
      promptInfo += "\n\nINSTRUCCIÓN PARA LA IA: Procesa esta información y da un diagnóstico de 360 grados sobre el rendimiento de este atleta.";

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
  "Asigna misiones o aconseja entrenamientos individualizados para mejorar cada pilar detectado como débil.",
  {
    athlete_id: z.string().describe("UUID del atleta a evaluar")
  },
  async ({ athlete_id }) => {
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
      promptInfo += `Pilares Críticos Detectados (Bajo Promedio): ${Array.from(debilidades).join(", ") || "Ninguno"}\n\n`;
      promptInfo += "INSTRUCCIÓN PARA LA IA: Asigna misiones específicas o aconseja entrenamientos súper individualizados para mejorar CADA UNO de los pilares débiles detectados. Si es 'Ninguno', genera una misión de mantenimiento avanzado. Responde en formato atractivo para el atleta.";

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

      promptInfo += "\nINSTRUCCIÓN PARA LA IA: Teniendo en cuenta los 7 sub-pilares (explosividad, fuerza, movilidad, tiro, agilidad, tactica, resiliencia), detecta cuáles no han sido evaluados o hace más tiempo no se evalúan. Sugiere la siguiente prueba específica (ej: CMJ, Lane Agility, etc) y BRINDA UNA EXPLICACIÓN LÓGICA y científica de por qué debe evaluarse eso ahora.";

      return { content: [{ type: "text", text: promptInfo }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// ============================================================
// CATÁLOGO DE MISIONES (D3 del spec loop misiones-baremo):
// el MCP propone misiones con justificación científica, el coach
// las activa desde AdminMisiones. Matriz objetivo:
// 7 sub-pilares × 3 niveles × 4 buckets de edad = 84 celdas.
// ============================================================

const SUB_PILARES = ["fuerza", "explosividad", "movilidad", "tiro", "agilidad", "tactica", "resiliencia"];
const NIVELES = ["Micro", "Desarrollo", "Elite"];
const BUCKETS = ["Sub12", "Sub15", "Sub18", "Senior"];

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

// Tool 4: Generar Catálogo de Misiones
server.tool(
  "generar_catalogo_misiones",
  "Analiza la cobertura del catálogo de misiones (matriz 7 sub-pilares × 3 niveles × 4 buckets de edad), prioriza las celdas faltantes según los atletas reales del club, y devuelve las instrucciones para redactar las misiones faltantes con justificación científica. Tras redactarlas, insertarlas con insertar_misiones_catalogo.",
  {
    sub_pilar: z.enum(SUB_PILARES).optional().describe("Limitar a un sub-pilar"),
    nivel: z.enum(NIVELES).optional().describe("Limitar a un nivel"),
    categoria_bucket: z.enum(BUCKETS).optional().describe("Limitar a un bucket de edad"),
  },
  async ({ sub_pilar, nivel, categoria_bucket }) => {
    try {
      const { data: misiones, error: misError } = await supabase
        .from("misiones")
        .select("id, pilar, nivel_objetivo, categoria_bucket, complejidad, activa");
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

      const { cubiertas, faltantes } = calcularCobertura(misiones);

      let pendientes = faltantes.filter(f =>
        (!sub_pilar || f.sub_pilar === sub_pilar) &&
        (!nivel || f.nivel === nivel) &&
        (!categoria_bucket || f.bucket === categoria_bucket)
      );
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

      let prompt = `=== COBERTURA DEL CATÁLOGO DE MISIONES ===\n`;
      prompt += `Celdas cubiertas: ${cubiertas}/84 (cubierta = ≥1 general Y ≥1 específica).\n`;
      prompt += `Buckets con atletas reales en el club (PRIORIDAD): ${[...bucketsConAtletas].join(", ") || "ninguno"}.\n\n`;
      prompt += `=== CELDAS FALTANTES (priorizadas) ===\n`;
      pendientes.slice(0, 30).forEach(f => {
        prompt += `- ${f.sub_pilar} × ${f.nivel} × ${f.bucket}` +
          ` (tiene ${f.tiene.general} general/${f.tiene.especifica} específica)` +
          (bucketsConAtletas.has(f.bucket) ? "  ← ATLETAS REALES" : "") + `\n`;
      });
      if (pendientes.length > 30) prompt += `… y ${pendientes.length - 30} celdas más (pide por sub_pilar para acotar).\n`;
      prompt += `\n=== CONTEXTO CIENTÍFICO (umbrales de baremos) ===${contextoBaremos || "\n(sin pruebas asociadas)"}\n`;
      prompt += `
=== INSTRUCCIONES DE REDACCIÓN ===
Para cada celda faltante genera misiones con:
- titulo: motivador, máx 60 caracteres.
- descripcion: ejecutable por un chico de esa edad (bucket) sin supervisión especial.
- justificacion: fundamento científico CON FUENTE (NSCA, FitnessGram, PubMed) de por qué
  ese trabajo mejora ese sub-pilar a esa edad — mismo estándar que packages/analytics-core/baremos_cientificos.md.
- xp_recompensa coherente con el nivel: Micro≈25, Desarrollo≈50, Elite≈75.
- complejidad: 'general' = hábito/educativa auto-asignable al atleta; 'especifica' = técnica
  que requiere criterio del coach antes de ser visible.
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
      nivel_objetivo: z.enum(NIVELES),
      categoria_bucket: z.enum(BUCKETS),
      complejidad: z.enum(["general", "especifica"]),
      xp_recompensa: z.number().int().positive(),
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
        nivel_objetivo: m.nivel_objetivo,
        categoria_bucket: m.categoria_bucket,
        complejidad: m.complejidad,
        xp_recompensa: m.xp_recompensa,
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

      // Recalcular cobertura post-insert
      const { data: todas } = await supabase
        .from("misiones")
        .select("id, pilar, nivel_objetivo, categoria_bucket, complejidad, activa");
      const { cubiertas } = calcularCobertura(todas);

      return {
        content: [{
          type: "text",
          text: `✅ ${filas.length} misión(es) insertada(s) con activa=false (pendientes de curaduría del coach en AdminMisiones).\nCobertura de la matriz tras el insert: ${cubiertas}/84 celdas.`,
        }],
      };
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
